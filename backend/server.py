from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
import os
import io
import logging
import uuid
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import stripe
import likes_client
import likes_sync
import likes_reconcile
import emailer
import base64
from auth import create_auth_router, get_current_user, seed_admin, hash_password, verify_password
from invoices import generate_invoice_pdf
from contracts import generate_contract_pdf, DEFAULT_TEMPLATE as DEFAULT_CONTRACT_TEMPLATE

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"

app = FastAPI(title="Goroky Telecom CRM")
api = APIRouter(prefix="/api")


# ------------------------- helpers -------------------------
def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def current_user(request: Request) -> dict:
    return await get_current_user(request, db)


async def require_admin(request: Request) -> dict:
    user = await get_current_user(request, db)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    return user


def clean(doc: dict) -> dict:
    if not doc:
        return doc
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id")) if "_id" in doc else doc.get("id")
    doc.pop("password_hash", None)
    return doc


SPANISH_MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
                  "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def _period_label(dt):
    return f"{SPANISH_MONTHS[dt.month - 1]} {dt.year}"


def _line_usage(line: dict) -> dict:
    """Agrega el consumo de una línea a partir de sus CDRs."""
    cdrs = line.get("cdrs", []) or []
    voice = [c for c in cdrs if c.get("type") == "VOICE"]
    sms = [c for c in cdrs if c.get("type") == "SMS"]
    minutes = round(sum(c.get("duration", 0) for c in voice) / 60)
    return {
        "lineNumber": line.get("lineNumber"),
        "productName": line.get("productName"),
        "nationalMinutes": minutes,
        "sms": len(sms),
        "dataGB": line.get("usedGB", 0),
        "calls": [{"number": c.get("calledNumber"), "date": c.get("date"),
                   "duration": c.get("duration", 0)} for c in voice],
    }


def _enrich_line(line: dict) -> dict:
    if line.get("family") == "Mobile":
        u = _line_usage(line)
        line["nationalMinutes"] = u["nationalMinutes"]
        line["smsUsed"] = u["sms"]
    return line


async def _refresh_line_live(line: dict) -> dict:
    """Trae de Likes en vivo SVAs/roaming/consumo/estado de la línea y lo persiste (espejo instantáneo)."""
    if line.get("source") != "likes" or not likes_client.get_token():
        return line
    ln = line.get("lineNumber")
    upd = {}
    try:
        svas = likes_client.get_line_svas(ln)
        if isinstance(svas, list) and svas:
            svas = likes_reconcile._norm_svas(svas)
            upd["svas"] = svas
            roaming = next((x for x in svas if x.get("code") == "ROAMING"), None)
            if roaming is not None:
                upd["roaming"] = bool(roaming.get("status"))
        if line.get("family") == "Mobile":
            gb = likes_client.get_line_gb(ln)
            if gb:
                upd.update({"totalGB": gb.get("totalGB"), "usedGB": gb.get("usedGB"),
                            "leftGB": gb.get("leftGB"), "lastDailyGB": gb.get("lastDailyGB")})
            cl = likes_client.get_credit_limit(ln)
            if cl and cl.get("creditLimit") is not None:
                upd["creditLimit"] = cl.get("creditLimit")
        info = likes_client.get_line_info(ln)
        if info:
            if info.get("status"):
                upd["status"] = info["status"]
            if info.get("icc"):
                upd["icc"] = info["icc"]
            if info.get("spn"):
                upd["spn"] = info["spn"]
            if info.get("created"):
                upd["activationDate"] = info["created"]
            owner = info.get("owner") or {}
            if owner.get("name"):
                upd["titularName"] = owner.get("name")
            si = info.get("simInfo") or {}
            if si:
                # PIN/PUK REALES de Likes (espejo exacto)
                upd["pins"] = {"pin": si.get("pin"), "puk": si.get("puk"),
                               "pin2": si.get("pin2"), "puk2": si.get("puk2")}
                if si.get("imsi"):
                    upd["imsi"] = si["imsi"]
                if info.get("eSim") and si.get("activationCode"):
                    upd["esimData"] = {k: si.get(k) for k in
                                       ("icc", "pin", "puk", "smdpAddress", "activationCode",
                                        "qrUrl", "qrDownloadUrl") if si.get(k) is not None}
            if line.get("family") == "Mobile":
                cdrs = likes_client.get_line_cdrs(ln)
                if isinstance(cdrs, list):
                    upd["cdrs"] = cdrs[:50]
    except Exception as e:  # noqa
        logger.warning("refresh line live %s: %s", ln, e)
    if upd:
        upd["likesSyncedAt"] = now_iso()
        await db.lines.update_one({"lineNumber": ln}, {"$set": upd})
        line.update(upd)
    return line


async def scope_fiscal(user: dict, fiscalId: Optional[str]) -> Optional[str]:
    """Clients can only access their own fiscalId."""
    if user.get("role") == "client":
        return user.get("fiscalId")
    return fiscalId


# ------------------------- billing config -------------------------
BILLING_REMINDER_DAYS = [int(x) for x in os.environ.get("BILLING_REMINDER_DAYS", "5,3").split(",") if x.strip()]
BILLING_MAX_FAILED = int(os.environ.get("BILLING_MAX_FAILED_ATTEMPTS", "3"))


async def log_event(source: str, level: str, message: str, meta: dict = None):
    """Registra un evento del sistema (para el panel de Alertas del CRM)."""
    try:
        await db.system_events.insert_one({
            "source": source, "level": level, "message": message,
            "meta": meta or {}, "read": False, "created_at": now_iso()})
    except Exception as e:  # noqa
        logger.warning("log_event failed: %s", e)


async def _send_mail_safe(source: str, to: str, subject: str, html: str, attachments=None):
    """Envía email y registra un evento si falla (sin romper el flujo)."""
    if not to:
        return False
    # evitar ruido con direcciones de prueba / seed
    test_domains = ("example.com", "email.com", "test.com")
    if any(to.lower().endswith("@" + d) for d in test_domains):
        return False
    if not emailer.is_configured():
        await log_event("email", "warning", f"Email NO enviado (Resend sin configurar): {subject}", {"to": to})
        return False
    try:
        await emailer.send_email(to, subject, html, attachments=attachments)
        return True
    except Exception as e:  # noqa
        await log_event("email", "error", f"Error al enviar email «{subject}»: {str(e)[:120]}", {"to": to})
        return False


# ------------------------- email templates -------------------------
def _mail_payment_reminder(name, amount, days, period):
    return emailer.base_template(
        f"Recordatorio de pago · {period}",
        f"Hola {name},<br><br>Te recordamos que en <b>{days} día(s)</b> se cargará en tu cuenta "
        f"la cuota de <b>{amount:.2f} €</b> correspondiente al periodo <b>{period}</b> mediante "
        "domiciliación SEPA.<br><br>Asegúrate de disponer de saldo suficiente. "
        "No necesitas hacer nada, el cobro es automático.<br><br>Gracias por confiar en GoRoky.")


def _mail_payment_success(name, amount, invoice_number, period):
    return emailer.base_template(
        "Pago recibido correctamente",
        f"Hola {name},<br><br>Hemos recibido el pago de <b>{amount:.2f} €</b> correspondiente al periodo "
        f"<b>{period}</b>.<br><br>Tu factura <b>{invoice_number}</b> ya está disponible en tu área de clientes.<br><br>"
        "Gracias por confiar en GoRoky. 🎉")


def _mail_payment_failed(name, amount, attempt, max_attempts):
    return emailer.base_template(
        "No hemos podido cobrar tu cuota",
        f"Hola {name},<br><br>No hemos podido cobrar la cuota de <b>{amount:.2f} €</b> mediante domiciliación SEPA "
        f"(intento <b>{attempt}</b> de {max_attempts}).<br><br>Por favor, revisa que tu cuenta bancaria tenga saldo. "
        "Volveremos a intentar el cobro automáticamente.<br><br>Si el problema persiste, contacta con soporte.")


def _mail_suspension_warning(name, amount):
    return emailer.base_template(
        "⚠️ Mañana tu línea será suspendida",
        f"Hola {name},<br><br><b>Mañana tu línea será suspendida si no se recibe el pago</b> de "
        f"<b>{amount:.2f} €</b>.<br><br>Han fallado varios intentos de cobro por domiciliación SEPA. "
        "Regulariza el pago hoy para evitar la suspensión del servicio.<br><br>"
        "Si ya has realizado el pago, ignora este mensaje.")


def _mail_suspended(name, amount):
    return emailer.base_template(
        "Tu línea ha sido suspendida por impago",
        f"Hola {name},<br><br>Lamentamos informarte de que tus líneas han sido <b>suspendidas</b> tras varios "
        f"intentos fallidos de cobro de <b>{amount:.2f} €</b>.<br><br>Para reactivar tu servicio, regulariza el "
        "pago pendiente. En cuanto recibamos el cobro, tus líneas se reactivarán automáticamente.<br><br>"
        "Contacta con soporte si necesitas ayuda.")


# ------------------------- models -------------------------
class CustomerCreate(BaseModel):
    fiscalId: str
    customerType: str = "Residential"
    name: str
    firstSurname: Optional[str] = ""
    lastSurname: Optional[str] = ""
    email: str
    contactPhone: str
    iban: Optional[str] = ""
    paymentMethod: Optional[str] = "NO"
    street: Optional[str] = ""
    streetNumber: Optional[str] = ""
    postalCode: Optional[str] = ""
    cityName: Optional[str] = ""
    provinceName: Optional[str] = ""
    createPortalAccess: bool = False
    portalPassword: Optional[str] = None


class OrderCreate(BaseModel):
    fiscalId: str
    productId: str
    portability: bool = False
    donorOperatorId: Optional[str] = None
    lineNumber: Optional[str] = None
    charge: bool = True


class TariffChange(BaseModel):
    subscriptionId: str
    newProductId: str


class SvaUpdate(BaseModel):
    svas: List[dict]


class TicketCreate(BaseModel):
    category: str
    typology: str
    description: str = ""
    fiscalIds: Optional[List[str]] = None
    lineNumbers: Optional[List[str]] = None


class CheckoutRequest(BaseModel):
    invoiceId: str
    origin_url: str


class TariffBody(BaseModel):
    productId: Optional[str] = None
    productName: str
    family: str = "Mobile"
    type: str = "Main"
    price: float                       # precio de VENTA final CON IVA (21%)
    costPrice: Optional[float] = 0     # precio de COSTE / cesión (Likes) SIN IVA (Tramo 1)
    features: Optional[List[str]] = None
    active: bool = True


class CoverageRequest(BaseModel):
    address: str


class EmailTest(BaseModel):
    email: str


class SpnUpdate(BaseModel):
    spn: str


class CreditLimitBody(BaseModel):
    creditLimit: float


class ChangeTitular(BaseModel):
    subscriptionId: str
    newFiscalId: str


class OptionalProductBody(BaseModel):
    subscriptionId: str
    productId: str


class CancelBody(BaseModel):
    reason: str


class AddressSearch(BaseModel):
    label: str


class DocUpload(BaseModel):
    type: str
    filename: str
    contentBase64: str


class ApplicationCreate(BaseModel):
    productId: str
    docType: str = "DNI"
    fiscalId: str
    name: str
    firstSurname: Optional[str] = ""
    lastSurname: Optional[str] = ""
    dob: Optional[str] = ""
    address: str
    city: str
    postalCode: str
    province: Optional[str] = ""
    iban: Optional[str] = ""
    bank: Optional[str] = ""
    contactPhone: str
    email: str
    acceptedTerms: bool = False
    docFront: Optional[str] = None
    docBack: Optional[str] = None
    selfie: Optional[str] = None
    paymentMethod: str = "sepa"  # "sepa" | "card"
    simType: str = "esim"        # "esim" | "physical" | "ship"
    simIcc: Optional[str] = None             # ICC de la SIM física (si simType=physical)
    # Portabilidad (móvil / fijo)
    lineType: str = "new"        # "new" | "portability" | "portability_prepaid"
    donorOperatorId: Optional[str] = None   # código operador donante (Likes)
    portMsisdn: Optional[str] = None         # número a portar
    portIcc: Optional[str] = None            # ICC de la SIM actual (opcional)
    currentHolderName: Optional[str] = None  # titular actual del número
    currentHolderFiscalId: Optional[str] = None
    changeHolder: bool = False               # el número está a nombre de otra persona


class SignBody(BaseModel):
    signatureType: str = "draw"
    signerName: Optional[str] = ""
    signatureImage: Optional[str] = None


class RecurringCheckoutBody(BaseModel):
    method: str = "sepa"  # "sepa" | "card"
    origin_url: str


class ServiceChargeBody(BaseModel):
    concept: str
    amount: float                       # importe total CON IVA a cobrar
    method: Optional[str] = None        # "card" | "sepa" (por defecto: el guardado del cliente)
    origin_url: Optional[str] = None    # necesario para link de pago (SEPA / sin tarjeta guardada)


class AppSettingsBody(BaseModel):
    autoApprove: Optional[bool] = None
    setupFee: Optional[float] = None
    reminderDays: Optional[List[int]] = None
    maxFailed: Optional[int] = None
    stripeSecretKey: Optional[str] = None
    stripePublishableKey: Optional[str] = None
    stripeWebhookSecret: Optional[str] = None
    stripeMode: Optional[str] = None  # "test" | "live"


class RejectBody(BaseModel):
    reason: Optional[str] = ""
    category: Optional[str] = ""


class ResubmitBody(BaseModel):
    docFront: Optional[str] = None
    docBack: Optional[str] = None
    selfie: Optional[str] = None
    iban: Optional[str] = None
    contactPhone: Optional[str] = None
    email: Optional[str] = None


class SimulateBody(BaseModel):
    outcome: str = "failed"  # "failed" | "success"


class ShipmentUpdate(BaseModel):
    status: Optional[str] = None       # PENDING | SHIPPED | DELIVERED
    carrier: Optional[str] = None
    tracking: Optional[str] = None


class PromotionBody(BaseModel):
    title: str
    subtitle: Optional[str] = ""
    imageUrl: Optional[str] = ""
    imageData: Optional[str] = None     # data URL para subir imagen
    ctaText: Optional[str] = "Ver más"
    ctaLink: Optional[str] = ""
    placement: str = "banner"           # banner | popup | offer
    audience: str = "all"               # all | specific | service
    audienceFiscalIds: Optional[List[str]] = []
    audienceService: Optional[str] = ""  # Mobile | Fiber | Satellite | TV
    priceBadge: Optional[str] = ""
    active: bool = True


# ------------------------- catalog / utility -------------------------
@api.get("/products")
async def products(family: Optional[str] = None, request: Request = None):
    await current_user(request)
    q = {"active": True}
    if family:
        q["family"] = family
    items = await db.tariffs.find(q).sort("price", 1).to_list(500)
    return [clean(t) for t in items]


async def _get_tariff(product_id):
    return await db.tariffs.find_one({"productId": product_id})


@api.get("/tariffs")
async def list_tariffs(request: Request):
    await require_admin(request)
    items = await db.tariffs.find().sort("family", 1).to_list(500)
    return [clean(t) for t in items]


@api.post("/tariffs")
async def create_tariff(body: TariffBody, request: Request):
    await require_admin(request)
    pid = body.productId or str(uuid.uuid4().int)[:4]
    if await db.tariffs.find_one({"productId": pid}):
        raise HTTPException(status_code=400, detail="Ya existe una tarifa con ese ID")
    doc = {"productId": pid, "productName": body.productName, "family": body.family,
           "type": body.type, "price": body.price, "costPrice": round(body.costPrice or 0, 2),
           "isRecurringPrice": True,
           "marketingText": [{"title": "Incluye", "value": f} for f in (body.features or [])],
           "active": body.active, "created": now_iso()}
    await db.tariffs.insert_one(doc)
    return clean(doc)


@api.put("/tariffs/{product_id}")
async def update_tariff(product_id: str, body: TariffBody, request: Request):
    await require_admin(request)
    existing = await db.tariffs.find_one({"productId": product_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Tarifa no encontrada")
    upd = {"productName": body.productName, "family": body.family, "type": body.type,
           "price": body.price, "costPrice": round(body.costPrice or 0, 2), "active": body.active,
           "marketingText": [{"title": "Incluye", "value": f} for f in (body.features or [])]}
    await db.tariffs.update_one({"productId": product_id}, {"$set": upd})
    return clean(await db.tariffs.find_one({"productId": product_id}))


@api.delete("/tariffs/{product_id}")
async def delete_tariff(product_id: str, request: Request):
    await require_admin(request)
    res = await db.tariffs.delete_one({"productId": product_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tarifa no encontrada")
    return {"ok": True}


@api.get("/donor-operators")
async def donor_operators(request: Request):
    await current_user(request)
    return likes_client.get_donor_operators()


@api.get("/public/donor-operators")
async def public_donor_operators():
    """Operadores donantes para el asistente de alta público (portabilidad)."""
    return likes_client.get_donor_operators()


@api.get("/ticket-typologies")
async def ticket_typologies(request: Request):
    await current_user(request)
    return likes_client.get_ticket_typologies()


@api.post("/coverage")
async def coverage(body: CoverageRequest, request: Request):
    await current_user(request)
    return likes_client.check_coverage(address=body.address)


# ------------------------- cobertura de fibra (flujo real Likes) -------------------------
class CoverageCheckBody(BaseModel):
    gescal37: str
    sessionId: Optional[str] = None


async def _coverage_search(label):
    return likes_client.search_address(label)


async def _coverage_buildings(gescal, session_id):
    return likes_client.get_buildings(gescal, session_id)


async def _coverage_check(gescal37, session_id):
    res = likes_client.check_coverage(gescal37=gescal37, session_id=session_id)
    # Likes devuelve una lista de opciones (FTTH/NEBA...); normalizamos a un objeto
    if isinstance(res, list):
        options = res
        chosen = next((o for o in res if o.get("valid")), (res[0] if res else {}))
    else:
        options = [res] if res else []
        chosen = res or {}
    cov = chosen.get("coverage") or {}
    if not cov.get("label"):
        parts = [cov.get("streetType", ""), cov.get("street", ""), cov.get("streetNumber", "")]
        addr = " ".join(p for p in parts if p).strip()
        loc = " ".join(p for p in [cov.get("postalCode", ""), cov.get("city", "")] if p).strip()
        cov["label"] = ", ".join(p for p in [addr, loc] if p)
    return {"valid": bool(chosen.get("valid")), "products": chosen.get("products") or [],
            "coverage": cov, "options": options}


@api.get("/coverage/search")
async def coverage_search(label: str, request: Request):
    await current_user(request)
    return await _coverage_search(label)


@api.get("/coverage/buildings")
async def coverage_buildings(gescal: str, request: Request, sessionId: str = None):
    await current_user(request)
    return await _coverage_buildings(gescal, sessionId)


@api.post("/coverage/check")
async def coverage_check(body: CoverageCheckBody, request: Request):
    await current_user(request)
    return await _coverage_check(body.gescal37, body.sessionId)


@api.get("/public/coverage/search")
async def public_coverage_search(label: str):
    return await _coverage_search(label)


@api.get("/public/coverage/buildings")
async def public_coverage_buildings(gescal: str, sessionId: str = None):
    return await _coverage_buildings(gescal, sessionId)


@api.post("/public/coverage/check")
async def public_coverage_check(body: CoverageCheckBody):
    return await _coverage_check(body.gescal37, body.sessionId)


# ------------------------- acceso de clientes a la app -------------------------
class SetPwBody(BaseModel):
    password: str


class BlockBody(BaseModel):
    blocked: bool


def _gen_password(n: int = 10):
    import secrets as _s
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
    return "".join(_s.choice(alphabet) for _ in range(n))


async def _send_app_credentials(email, name, password, reset=False):
    if not email:
        return
    app_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    login_url = f"{app_url}/login" if app_url else "la app de GoRoky"
    title = "Contraseña de la app restablecida" if reset else "Ya tienes acceso a la app de GoRoky"
    intro = ("Hemos restablecido la contraseña de acceso a tu app. Estos son tus nuevos datos de acceso:"
             if reset else
             "¡Bienvenido! Ya puedes acceder a la app de GoRoky para gestionar tus servicios, "
             "ver tu consumo y descargar tus facturas. Estos son tus datos de acceso:")
    body = (f"Hola {name or ''},<br><br>{intro}<br><br>"
            "<b>Tus datos de acceso a la app:</b><br>"
            f"• App: <a href='{login_url}'>{login_url}</a><br>"
            f"• Usuario: <b>{email}</b><br>"
            f"• Contraseña: <b>{password}</b><br><br>"
            "Por tu seguridad, te recomendamos cambiar la contraseña tras el primer acceso.")
    await _send_mail_safe("email", email, f"{title} · GoRoky", emailer.base_template(title, body))


async def _ensure_client_access(cust):
    """Crea el usuario de app del cliente (si no existe) y le envía sus credenciales."""
    if not cust or not cust.get("email"):
        return
    email = cust["email"].lower()
    if await db.users.find_one({"email": email}):
        return
    pw = _gen_password()
    name = f"{cust.get('name', '')} {cust.get('firstSurname', '')}".strip()
    await db.users.insert_one({
        "email": email, "password_hash": hash_password(pw), "name": name,
        "role": "client", "fiscalId": cust.get("fiscalId"),
        "appBlocked": False, "sessionEpoch": 0, "created_at": now_iso()})
    await _send_app_credentials(email, name, pw, reset=False)
    await log_event("system", "info", f"Acceso a la app creado para {email}")


@api.get("/admin/app-users")
async def admin_app_users(request: Request):
    await require_admin(request)
    users = await db.users.find({"role": "client"}).to_list(3000)
    out = []
    for u in users:
        fid = u.get("fiscalId")
        active = await db.lines.count_documents({"fiscalId": fid, "status": "ACTIVE"}) if fid else 0
        total = await db.lines.count_documents({"fiscalId": fid}) if fid else 0
        out.append({"id": str(u["_id"]), "email": u["email"], "name": u.get("name"),
                    "fiscalId": fid, "lastLogin": u.get("lastLogin"),
                    "appBlocked": bool(u.get("appBlocked")), "activeServices": active,
                    "totalServices": total, "createdAt": u.get("created_at")})
    out.sort(key=lambda x: (x.get("lastLogin") or ""), reverse=True)
    return out


@api.post("/admin/app-users/{uid}/reset-password")
async def admin_reset_app_pw(uid: str, request: Request):
    await require_admin(request)
    u = await db.users.find_one({"_id": _OID(uid), "role": "client"})
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    pw = _gen_password()
    await db.users.update_one({"_id": u["_id"]},
                              {"$set": {"password_hash": hash_password(pw)}, "$inc": {"sessionEpoch": 1}})
    await _send_app_credentials(u["email"], u.get("name"), pw, reset=True)
    await log_event("system", "info", f"Contraseña de app restablecida · {u['email']}")
    return {"ok": True, "emailed": bool(u.get("email"))}


@api.post("/admin/app-users/{uid}/set-password")
async def admin_set_app_pw(uid: str, body: SetPwBody, request: Request):
    await require_admin(request)
    if len((body.password or "").strip()) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")
    u = await db.users.find_one({"_id": _OID(uid), "role": "client"})
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    await db.users.update_one({"_id": u["_id"]},
                              {"$set": {"password_hash": hash_password(body.password.strip())}, "$inc": {"sessionEpoch": 1}})
    await log_event("system", "info", f"Contraseña de app cambiada manualmente · {u['email']}")
    return {"ok": True}


@api.post("/admin/app-users/{uid}/logout")
async def admin_logout_app_user(uid: str, request: Request):
    await require_admin(request)
    r = await db.users.update_one({"_id": _OID(uid), "role": "client"}, {"$inc": {"sessionEpoch": 1}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"ok": True}


@api.post("/admin/app-users/{uid}/block")
async def admin_block_app_user(uid: str, body: BlockBody, request: Request):
    await require_admin(request)
    op = {"$set": {"appBlocked": bool(body.blocked)}}
    if body.blocked:
        op["$inc"] = {"sessionEpoch": 1}
    r = await db.users.update_one({"_id": _OID(uid), "role": "client"}, op)
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    await log_event("system", "warning" if body.blocked else "info",
                    f"Acceso a la app {'bloqueado' if body.blocked else 'desbloqueado'} · usuario {uid}")
    return {"ok": True, "appBlocked": bool(body.blocked)}


# ------------------------- dashboard -------------------------
@api.get("/dashboard/stats")
async def dashboard_stats(request: Request):
    user = await require_perm(request, "dashboard.view")
    is_reseller = user.get("role") == "reseller"
    if is_reseller:
        owned = await db.customers.find({"ownerId": str(user["_id"])}).to_list(3000)
        fids = [c["fiscalId"] for c in owned]
        cust_q = {"ownerId": str(user["_id"])}
        line_q = {"fiscalId": {"$in": fids}}
        order_q = {"ownerId": str(user["_id"])}
    else:
        cust_q, line_q, order_q = {}, {}, {}
    customers = await db.customers.count_documents(cust_q)
    active_lines = await db.lines.count_documents({**line_q, "status": "ACTIVE"})
    total_lines = await db.lines.count_documents(line_q)
    open_tickets = await db.tickets.count_documents({"status": {"$ne": "CLOSED"}}) if not is_reseller else 0
    recent_orders = await db.orders.find(order_q).sort("created", -1).to_list(6)
    if is_reseller:
        comms = await db.commissions.find({"resellerId": str(user["_id"])}).to_list(5000)
        revenue = round(sum(c.get("amount", 0) for c in comms), 2)
        pending_inv = 0
    else:
        paid = await db.invoices.find({"status": "paid"}).to_list(1000)
        revenue = round(sum(i["total"] for i in paid), 2)
        pending_inv = await db.invoices.count_documents({"status": "pending"})
    lines = await db.lines.find(line_q).to_list(2000)
    by_family = {}
    for l in lines:
        by_family[l["family"]] = by_family.get(l["family"], 0) + 1
    return {
        "customers": customers,
        "activeLines": active_lines,
        "totalLines": total_lines,
        "openTickets": open_tickets,
        "revenue": revenue,
        "revenueLabel": "Comisiones" if is_reseller else "Ingresos",
        "pendingInvoices": pending_inv,
        "recentOrders": [clean(o) for o in recent_orders],
        "linesByFamily": [{"name": k, "value": v} for k, v in by_family.items()],
        "connection": {"live": likes_client.CONNECTION_STATE["live"],
                       "error": likes_client.CONNECTION_STATE["last_error"]},
    }


# ------------------------- customers -------------------------
@api.get("/customers")
async def list_customers(request: Request, q: Optional[str] = None):
    user = await require_perm(request, "customers.view")
    query = dict(_scope(user))
    if q:
        query["$or"] = [{"name": {"$regex": q, "$options": "i"}},
                        {"fiscalId": {"$regex": q, "$options": "i"}},
                        {"email": {"$regex": q, "$options": "i"}}]
    customers = await db.customers.find(query).sort("created", -1).to_list(500)
    out = []
    for c in customers:
        c = clean(c)
        c["linesCount"] = await db.lines.count_documents({"fiscalId": c["fiscalId"]})
        out.append(c)
    return out


@api.post("/customers")
async def create_customer(body: CustomerCreate, request: Request):
    user = await require_perm(request, "customers.edit")
    if await db.customers.find_one({"fiscalId": body.fiscalId}):
        raise HTTPException(status_code=400, detail="Ya existe un cliente con ese NIF/NIE")
    doc = {
        "fiscalId": body.fiscalId, "customerType": body.customerType, "name": body.name,
        "firstSurname": body.firstSurname, "lastSurname": body.lastSurname,
        "email": body.email.lower(), "contactPhone": body.contactPhone,
        "iban": body.iban, "paymentMethod": body.paymentMethod,
        "billingAddress": {"street": body.street, "streetNumber": body.streetNumber,
                           "postalCode": body.postalCode, "cityName": body.cityName,
                           "provinceName": body.provinceName},
        "ownerId": str(user["_id"]) if user.get("role") == "reseller" else None,
        "created": now_iso(),
    }
    await db.customers.insert_one(doc)
    # portal access
    if body.createPortalAccess and body.portalPassword:
        if not await db.users.find_one({"email": body.email.lower()}):
            await db.users.insert_one({
                "email": body.email.lower(), "password_hash": hash_password(body.portalPassword),
                "name": f"{body.name} {body.firstSurname}".strip(), "role": "client",
                "fiscalId": body.fiscalId, "created_at": now_iso()})
    return clean(doc)


@api.get("/customers/{fiscalId}")
async def get_customer(fiscalId: str, request: Request):
    user = await current_user(request)
    fid = await scope_fiscal(user, fiscalId)
    if user.get("role") == "client" and fid != fiscalId:
        raise HTTPException(status_code=403, detail="No autorizado")
    cust = await db.customers.find_one({"fiscalId": fiscalId})
    if not cust:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    lines = await db.lines.find({"fiscalId": fiscalId}).to_list(200)
    subs = await db.subscriptions.find({"fiscalId": fiscalId}).to_list(200)
    invs = await db.invoices.find({"fiscalId": fiscalId}).sort("date", -1).to_list(200)
    return {"customer": clean(cust), "lines": [clean(_enrich_line(l)) for l in lines],
            "subscriptions": [clean(s) for s in subs], "invoices": [clean(i) for i in invs]}


# ------------------------- lines -------------------------
@api.get("/lines")
async def list_lines(request: Request):
    user = await require_perm(request, "lines.view")
    query = {}
    if user.get("role") == "reseller":
        owned = await db.customers.find({"ownerId": str(user["_id"])}).to_list(2000)
        query = {"fiscalId": {"$in": [c["fiscalId"] for c in owned]}}
    lines = await db.lines.find(query).sort("created", -1).to_list(1000)
    return [clean(l) for l in lines]


@api.get("/lines/{lineNumber}")
async def get_line(lineNumber: str, request: Request):
    user = await current_user(request)
    line = await db.lines.find_one({"lineNumber": lineNumber})
    if not line:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    if user.get("role") == "client" and line["fiscalId"] != user.get("fiscalId"):
        raise HTTPException(status_code=403, detail="No autorizado")
    line = await _refresh_line_live(line)
    line = _enrich_line(line)
    cust = await db.customers.find_one({"fiscalId": line.get("fiscalId")})
    if cust:
        full_name = " ".join(filter(None, [cust.get("name"), cust.get("firstSurname"),
                                            cust.get("lastSurname")])).strip()
        line["titular"] = {
            "name": full_name or line.get("titularName"),
            "fiscalId": cust.get("fiscalId"), "customerType": cust.get("customerType"),
            "email": cust.get("email"), "phone": cust.get("contactPhone"),
        }
    elif line.get("titularName"):
        line["titular"] = {"name": line.get("titularName"), "fiscalId": line.get("fiscalId")}
    line["activationDate"] = line.get("activationDate") or line.get("created")
    return clean(line)


@api.post("/lines/{lineNumber}/toggle-block")
async def toggle_block(lineNumber: str, request: Request):
    user = await current_user(request)
    line = await db.lines.find_one({"lineNumber": lineNumber})
    if not line:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    if user.get("role") == "client" and line["fiscalId"] != user.get("fiscalId"):
        raise HTTPException(status_code=403, detail="No autorizado")
    new_status = "SUSPENDED" if line["status"] == "ACTIVE" else "ACTIVE"
    await db.lines.update_one({"lineNumber": lineNumber}, {"$set": {"status": new_status}})
    likes_sync = None
    if likes_client.get_token():
        _d, err = likes_client.block_line_remote(lineNumber, block=(new_status == "SUSPENDED"))
        likes_sync = {"synced": err is None, "error": err}
        if err:
            logger.warning("Likes toggle-block %s: %s", lineNumber, err)
    return {"lineNumber": lineNumber, "status": new_status, "likesSync": likes_sync}


@api.put("/lines/{lineNumber}/svas")
async def update_svas(lineNumber: str, body: SvaUpdate, request: Request):
    user = await current_user(request)
    line = await db.lines.find_one({"lineNumber": lineNumber})
    if not line:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    if user.get("role") == "client" and line.get("fiscalId") != user.get("fiscalId"):
        raise HTTPException(status_code=403, detail="No autorizado")
    svas = line.get("svas") or []
    updates = {s.get("code"): s.get("status") for s in body.svas if s.get("code") is not None}
    seen = set()
    for s in svas:
        c = s.get("code")
        seen.add(c)
        if c in updates:
            s["status"] = bool(updates[c])
    for code, status in updates.items():
        if code not in seen:
            svas.append({"code": code, "status": bool(status)})
    await db.lines.update_one({"lineNumber": lineNumber}, {"$set": {"svas": svas}})
    # Sincronizar con Likes (fail-safe: si falla, el cambio local queda igual)
    likes_sync = None
    if updates and likes_client.get_token():
        payload = [{"code": c, "status": bool(st)} for c, st in updates.items()]
        _data, err = likes_client.set_line_svas(lineNumber, payload)
        likes_sync = {"synced": err is None, "error": err}
        if err:
            logger.warning("Likes set_line_svas %s: %s", lineNumber, err)
    return {"success": True, "svas": svas, "likesSync": likes_sync}


# ------------------------- gestión avanzada de líneas (admin/agente) -------------------------
async def _get_line_admin(lineNumber, request, perm="lines.support"):
    await require_perm(request, perm)
    line = await db.lines.find_one({"lineNumber": lineNumber})
    if not line:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    return line


@api.post("/lines/{lineNumber}/bono")
async def add_bono(lineNumber: str, body: dict, request: Request):
    line = await _get_line_admin(lineNumber, request)
    gb = float(body.get("gb", 0))
    if gb <= 0:
        raise HTTPException(status_code=400, detail="Indica los GB del bono")
    new_total = (line.get("totalGB") or 0) + gb
    bonos = line.get("bonos", [])
    bonos.append({"gb": gb, "date": now_iso()})
    await db.lines.update_one({"lineNumber": lineNumber}, {"$set": {"totalGB": new_total, "bonos": bonos}})
    await log_event("order", "success", f"Bono de {gb:.0f}GB añadido a la línea {lineNumber}")
    return {"lineNumber": lineNumber, "totalGB": new_total}


@api.put("/lines/{lineNumber}/spend-limit")
async def set_spend_limit(lineNumber: str, body: dict, request: Request):
    await _get_line_admin(lineNumber, request)
    limit = float(body.get("limit", 0))
    auto_cut = bool(body.get("autoCut", False))
    await db.lines.update_one({"lineNumber": lineNumber},
                              {"$set": {"spendLimit": limit, "autoCut": auto_cut, "creditLimit": limit}})
    likes_sync = None
    if likes_client.get_token():
        _d, err = likes_client.set_credit_limit_remote(lineNumber, limit)
        likes_sync = {"synced": err is None, "error": err}
        if err:
            logger.warning("Likes credit-limit %s: %s", lineNumber, err)
    return {"lineNumber": lineNumber, "spendLimit": limit, "autoCut": auto_cut, "likesSync": likes_sync}


@api.put("/lines/{lineNumber}/roaming")
async def set_roaming(lineNumber: str, body: dict, request: Request):
    await _get_line_admin(lineNumber, request)
    enabled = bool(body.get("enabled", False))
    await db.lines.update_one({"lineNumber": lineNumber}, {"$set": {"roaming": enabled}})
    likes_sync = None
    if likes_client.get_token():
        _d, err = likes_client.set_line_svas(lineNumber, [{"code": "ROAMING", "status": enabled}])
        likes_sync = {"synced": err is None, "error": err}
        if err:
            logger.warning("Likes roaming %s: %s", lineNumber, err)
    await log_event("order", "info", f"Roaming {'activado' if enabled else 'desactivado'} · línea {lineNumber}")
    return {"lineNumber": lineNumber, "roaming": enabled, "likesSync": likes_sync}


@api.put("/lines/{lineNumber}/barring")
async def set_barring(lineNumber: str, body: dict, request: Request):
    await _get_line_admin(lineNumber, request)
    barrings = {"premium": bool(body.get("premium", False)),
                "international": bool(body.get("international", False)),
                "dataRoaming": bool(body.get("dataRoaming", False)),
                "voicemail": bool(body.get("voicemail", False))}
    await db.lines.update_one({"lineNumber": lineNumber}, {"$set": {"barrings": barrings}})
    # Un "barring" activo = desactivar el SVA correspondiente en Likes
    likes_sync = None
    if likes_client.get_token():
        svas = [{"code": "OUTBOUND_PREMIUM_CALLS", "status": not barrings["premium"]},
                {"code": "INTERNATIONAL_OUTBOUND_CALLS", "status": not barrings["international"]},
                {"code": "ROAMING", "status": not barrings["dataRoaming"]},
                {"code": "VOICEMAIL", "status": not barrings["voicemail"]}]
        _d, err = likes_client.set_line_svas(lineNumber, svas)
        likes_sync = {"synced": err is None, "error": err}
        if err:
            logger.warning("Likes barring %s: %s", lineNumber, err)
    return {"lineNumber": lineNumber, "barrings": barrings, "likesSync": likes_sync}


@api.put("/lines/{lineNumber}/call-forward")
async def set_call_forward(lineNumber: str, body: dict, request: Request):
    await _get_line_admin(lineNumber, request)
    cf = {"enabled": bool(body.get("enabled", False)), "number": body.get("number", ""),
          "voicemail": bool(body.get("voicemail", False))}
    await db.lines.update_one({"lineNumber": lineNumber}, {"$set": {"callForward": cf}})
    likes_sync = None
    if likes_client.get_token():
        svas = [{"code": "FORWARD_UNCONDITIONAL", "status": cf["enabled"]},
                {"code": "VOICEMAIL", "status": cf["voicemail"]}]
        _d, err = likes_client.set_line_svas(lineNumber, svas)
        likes_sync = {"synced": err is None, "error": err}
        if err:
            logger.warning("Likes call-forward %s: %s", lineNumber, err)
    return {"lineNumber": lineNumber, "callForward": cf, "likesSync": likes_sync}


@api.post("/lines/{lineNumber}/suspend")
async def suspend_line(lineNumber: str, body: dict, request: Request):
    await _get_line_admin(lineNumber, request)
    reason = body.get("reason", "temporal")
    await db.lines.update_one({"lineNumber": lineNumber},
                              {"$set": {"status": "SUSPENDED", "suspendReason": reason}})
    likes_sync = None
    if likes_client.get_token():
        _d, err = likes_client.block_line_remote(lineNumber, block=True)
        likes_sync = {"synced": err is None, "error": err}
        if err:
            logger.warning("Likes block %s: %s", lineNumber, err)
    await log_event("order", "warning", f"Línea {lineNumber} suspendida ({reason})")
    return {"lineNumber": lineNumber, "status": "SUSPENDED", "likesSync": likes_sync}


@api.post("/lines/{lineNumber}/reactivate")
async def reactivate_line(lineNumber: str, request: Request):
    await _get_line_admin(lineNumber, request)
    await db.lines.update_one({"lineNumber": lineNumber},
                              {"$set": {"status": "ACTIVE"}, "$unset": {"suspendReason": ""}})
    likes_sync = None
    if likes_client.get_token():
        _d, err = likes_client.block_line_remote(lineNumber, block=False)
        likes_sync = {"synced": err is None, "error": err}
        if err:
            logger.warning("Likes unblock %s: %s", lineNumber, err)
    await log_event("order", "success", f"Línea {lineNumber} reactivada")
    return {"lineNumber": lineNumber, "status": "ACTIVE", "likesSync": likes_sync}


@api.post("/lines/{lineNumber}/terminate")
async def terminate_line(lineNumber: str, body: dict, request: Request):
    line = await _get_line_admin(lineNumber, request)
    likes_sync = None
    # Likes no expone baja definitiva de línea main: bloqueamos en Likes para cortar servicio.
    if likes_client.get_token():
        _d, err = likes_client.block_line_remote(lineNumber, block=True)
        likes_sync = {"synced": err is None, "error": err,
                      "note": "Baja definitiva requiere ticket en Likes; línea bloqueada."}
        if err:
            logger.warning("Likes terminate/block %s: %s", lineNumber, err)
    await db.lines.update_one({"lineNumber": lineNumber},
                              {"$set": {"status": "TERMINATED", "terminateReason": body.get("reason", ""),
                                        "terminatedAt": now_iso()}})
    await log_event("order", "warning", f"Baja de línea {lineNumber}")
    return {"lineNumber": lineNumber, "status": "TERMINATED", "likesSync": likes_sync}


@api.post("/lines/{lineNumber}/transfer")
async def transfer_line(lineNumber: str, body: dict, request: Request):
    line = await _get_line_admin(lineNumber, request)
    new_fiscal = body.get("newFiscalId", "").strip()
    dest = await db.customers.find_one({"fiscalId": new_fiscal})
    if not dest:
        raise HTTPException(status_code=404, detail="El nuevo titular no existe como cliente")
    actual_fiscal = line.get("fiscalId")
    subs = await db.subscriptions.find({"products.lineNumber": lineNumber}).to_list(50)
    sub_ids = [s.get("subscriptionId") for s in subs if s.get("subscriptionId")]
    likes_sync = None
    if likes_client.get_token() and sub_ids:
        _d, err = likes_client.change_titular_remote(sub_ids, actual_fiscal, new_fiscal)
        likes_sync = {"synced": err is None, "error": err}
        if err:
            logger.warning("Likes changeTitular %s: %s", lineNumber, err)
    await db.lines.update_one({"lineNumber": lineNumber}, {"$set": {"fiscalId": new_fiscal}})
    await db.subscriptions.update_many({"products.lineNumber": lineNumber}, {"$set": {"fiscalId": new_fiscal}})
    await log_event("order", "info", f"Cambio de titular línea {lineNumber} → {new_fiscal}")
    return {"lineNumber": lineNumber, "fiscalId": new_fiscal, "likesSync": likes_sync}


@api.post("/lines/{lineNumber}/change-number")
async def change_number(lineNumber: str, request: Request):
    line = await _get_line_admin(lineNumber, request)
    is_mobile = line.get("family") == "Mobile"
    new_number = ("6" if is_mobile else "9") + str(uuid.uuid4().int)[:8]
    await db.lines.update_one({"lineNumber": lineNumber}, {"$set": {"lineNumber": new_number}})
    await db.subscriptions.update_many({"products.lineNumber": lineNumber},
                                       {"$set": {"products.$[e].lineNumber": new_number}},
                                       array_filters=[{"e.lineNumber": lineNumber}])
    await log_event("order", "info", f"Cambio de número {lineNumber} → {new_number}")
    return {"oldNumber": lineNumber, "lineNumber": new_number}


# ------------------------- subscriptions -------------------------
@api.get("/subscriptions")
async def list_subscriptions(request: Request, fiscalId: Optional[str] = None):
    user = await current_user(request)
    fid = await scope_fiscal(user, fiscalId)
    query = {"fiscalId": fid} if fid else {}
    subs = await db.subscriptions.find(query).to_list(500)
    return [clean(s) for s in subs]


@api.post("/subscriptions/change-tariff")
async def change_tariff(body: TariffChange, request: Request):
    user = await current_user(request)
    sub = await db.subscriptions.find_one({"subscriptionId": body.subscriptionId})
    if not sub:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")
    if user.get("role") == "client" and sub["fiscalId"] != user.get("fiscalId"):
        raise HTTPException(status_code=403, detail="No autorizado")
    prod = await _get_tariff(body.newProductId)
    if not prod:
        raise HTTPException(status_code=400, detail="Producto no válido")
    products = sub.get("products", [])
    if products:
        products[0].update({"productId": prod["productId"], "productName": prod["productName"],
                            "price": prod["price"], "finalPrice": round(prod["price"] * 1.21, 2)})
    await db.subscriptions.update_one({"subscriptionId": body.subscriptionId},
                                      {"$set": {"products": products, "pendingChange": False}})
    # actualizar línea asociada
    ln = products[0].get("lineNumber") if products else None
    if ln:
        await db.lines.update_one({"lineNumber": ln},
                                  {"$set": {"productId": prod["productId"], "productName": prod["productName"],
                                            "price": prod["price"]}})
    likes_sync = None
    if likes_client.get_token():
        likes_pid = prod.get("likesProductId") or prod["productId"]
        _d, err = likes_client.change_product_remote(
            body.subscriptionId, sub.get("fiscalId"), likes_pid,
            sub.get("family") or prod.get("family"), line_number=ln)
        likes_sync = {"synced": err is None, "error": err}
        if err:
            logger.warning("Likes changeProduct %s: %s", body.subscriptionId, err)
    return {"success": True, "productName": prod["productName"], "likesSync": likes_sync}


# ------------------------- orders / service creation -------------------------
async def _next_invoice_number():
    counter = await db.counters.find_one_and_update(
        {"_id": "invoice"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    seq = counter["seq"] if counter and "seq" in counter else 1
    return f"GRK-{datetime.now().year}-{seq:05d}"


async def _next_contract_number():
    counter = await db.counters.find_one_and_update(
        {"_id": "contract"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    seq = counter["seq"] if counter and "seq" in counter else 1
    return f"CTR-{datetime.now().year}-{seq:05d}"


async def _create_invoice(customer, product, status="pending"):
    subtotal = round(product["price"] / 1.21, 2)
    tax = round(product["price"] - subtotal, 2)
    number = await _next_invoice_number()
    ba = customer.get("billingAddress", {}) or {}
    address = f"{ba.get('street', '')} {ba.get('streetNumber', '')}, {ba.get('postalCode', '')} {ba.get('cityName', '')} ({ba.get('provinceName', '')})".strip()
    mobile_lines = await db.lines.find({"fiscalId": customer["fiscalId"], "family": "Mobile"}).to_list(50)
    consumption = [_line_usage(l) for l in mobile_lines]
    now = datetime.now(timezone.utc)
    inv = {
        "invoiceNumber": number, "fiscalId": customer["fiscalId"],
        "customerName": f"{customer['name']} {customer.get('firstSurname', '')}".strip().upper(),
        "customerEmail": customer.get("email"), "customerAddress": address,
        "items": [{"description": product["productName"], "detail": "Alta de servicio",
                   "quantity": 1, "amount": product["price"]}],
        "subtotal": subtotal, "tax": tax, "total": product["price"],
        "status": status, "date": now.isoformat(),
        "period": _period_label(now), "dueDate": (now + timedelta(days=30)).isoformat(),
        "paymentMethod": customer.get("paymentMethod", "NO"),
        "consumption": consumption,
    }
    res = await db.invoices.insert_one(inv)
    inv["_id"] = res.inserted_id
    await _email_invoice(inv)
    return inv


def _mail_invoice_body(inv):
    paid = inv.get("status") == "paid"
    name = (inv.get("customerName") or "").title()
    if paid:
        title = f"Tu factura {inv['invoiceNumber']} (pagada)"
        intro = (f"Hola {name},<br><br>Adjuntamos tu factura <b>{inv['invoiceNumber']}</b> "
                 f"por importe de <b>{inv['total']:.2f} €</b> (periodo {inv.get('period','')}), "
                 "que ha sido <b>abonada correctamente</b>. Gracias por confiar en GoRoky.")
    else:
        title = f"Nueva factura {inv['invoiceNumber']}"
        intro = (f"Hola {name},<br><br>Se ha emitido tu factura <b>{inv['invoiceNumber']}</b> "
                 f"por importe de <b>{inv['total']:.2f} €</b> (periodo {inv.get('period','')}). "
                 "La tienes adjunta en este email y disponible en tu área de clientes.")
    return emailer.base_template(title, intro)


async def _email_invoice(inv):
    """Envía la factura al cliente por email con el PDF adjunto (en toda creación de factura)."""
    to = inv.get("customerEmail")
    if not to:
        return False
    try:
        pdf_bytes = generate_invoice_pdf(inv)
        attachment = {"filename": f"{inv['invoiceNumber']}.pdf",
                      "content": base64.b64encode(pdf_bytes).decode("utf-8")}
    except Exception as e:  # noqa
        await log_event("email", "error", f"No se pudo generar el PDF de {inv.get('invoiceNumber')}: {str(e)[:100]}")
        attachment = None
    subject = (f"Factura {inv['invoiceNumber']} pagada · GoRoky" if inv.get("status") == "paid"
               else f"Nueva factura {inv['invoiceNumber']} · GoRoky")
    ok = await _send_mail_safe("email", to, subject, _mail_invoice_body(inv),
                               attachments=[attachment] if attachment else None)
    if ok:
        await db.invoices.update_one({"_id": inv["_id"]}, {"$set": {"emailedAt": now_iso()}})
    return ok


@api.get("/orders")
async def list_orders(request: Request):
    user = await require_perm(request, "orders.manage")
    orders = await db.orders.find(dict(_scope(user))).sort("created", -1).to_list(500)
    return [clean(o) for o in orders]


@api.post("/orders")
async def create_order(body: OrderCreate, request: Request):
    user = await require_perm(request, "orders.manage")
    is_reseller = user.get("role") == "reseller"
    customer = await db.customers.find_one({"fiscalId": body.fiscalId})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    product = await _get_tariff(body.productId)
    if not product:
        raise HTTPException(status_code=400, detail="Producto no válido")

    if not likes_client.get_token():
        raise HTTPException(status_code=503,
            detail="Likes no está conectado. No se pueden crear altas con datos reales sin conexión con Likes.")

    is_mobile = product["family"] == "Mobile"
    likes_pid = product.get("likesProductId") or product["productId"]
    # 1) Crear el alta REAL en Likes (signupv2). Nada de datos ficticios.
    prod_payload = {"family": product["family"], "productId": likes_pid, "portability": bool(body.portability)}
    if is_mobile:
        prod_payload["eSim"] = True
        if customer.get("email"):
            prod_payload["eSimEmail"] = customer["email"]
    if body.portability:
        prod_payload["donorOperatorId"] = body.donorOperatorId
        if body.lineNumber:
            prod_payload["lineNumber"] = body.lineNumber
    odata, oerr = likes_client.create_order(
        {"digitalSignature": True, "fiscalId": body.fiscalId, "products": [prod_payload]})
    if oerr:
        raise HTTPException(status_code=502, detail=f"No se pudo crear el alta en Likes: {oerr}")
    likes_order_id = (odata or {}).get("orderId")

    # 2) Espejar los datos REALES desde Likes (nº línea, ICC, PIN/PUK, SVAs, GB, estado…)
    try:
        await likes_reconcile.reconcile_customer(db, body.fiscalId)
    except Exception as e:  # noqa
        logger.warning("reconcile create_order %s: %s", body.fiscalId, e)
    line = await db.lines.find_one(
        {"fiscalId": body.fiscalId, "productId": {"$in": [likes_pid, product["productId"]]}, "source": "likes"},
        sort=[("likesSyncedAt", -1)])
    if not line:
        line = await db.lines.find_one({"fiscalId": body.fiscalId, "source": "likes"}, sort=[("likesSyncedAt", -1)])
    line_number = (line or {}).get("lineNumber")

    invoice = await _create_invoice(customer, product, status="pending")
    contract_number = await _next_contract_number()

    order_id = likes_order_id or str(uuid.uuid4())
    order = {
        "orderId": order_id, "likesOrderId": likes_order_id, "fiscalId": body.fiscalId,
        "customerName": f"{customer['name']} {customer.get('firstSurname', '')}".strip(),
        "status": (line or {}).get("status") or "PROVISIONING", "channel": "WD", "price": product["price"],
        "productName": product["productName"], "family": product["family"], "productId": product["productId"],
        "lineNumber": line_number, "portability": body.portability,
        "donorOperatorId": body.donorOperatorId,
        "invoiceNumber": invoice["invoiceNumber"], "invoiceId": str(invoice["_id"]),
        "contractNumber": contract_number, "signed": False, "source": "likes",
        "ownerId": str(user["_id"]) if is_reseller else None,
        "created": now_iso(),
    }
    await db.orders.insert_one(order)

    await log_event("order", "success",
                    f"Alta creada en Likes · {order['customerName']} · {product['productName']} · Likes {likes_order_id} · línea {line_number or 'pendiente'}",
                    {"orderId": order_id, "channel": "WD"})
    if is_reseller and (user.get("commissionPerSim") or 0) > 0 and line_number:
        await db.commissions.insert_one({
            "commissionId": str(uuid.uuid4().int)[:10], "resellerId": str(user["_id"]),
            "resellerName": user.get("name"), "lineNumber": line_number,
            "customerName": order["customerName"], "amount": user["commissionPerSim"],
            "created": now_iso()})
    # instalación (fibra) o portabilidad (si aplica) — se espeja el estado real de Likes en reconciliaciones
    if product["family"] in ("Fiber", "TV") and line_number:
        await db.installations.insert_one({
            "installationId": str(uuid.uuid4().int)[:12], "fiscalId": body.fiscalId,
            "customerName": order["customerName"], "lineNumber": line_number,
            "productName": product["productName"], "status": "PENDING_APPOINTMENT",
            "address": (customer.get("billingAddress") or {}).get("street", ""),
            "appointment": None, "created": now_iso()})
    if body.portability and line_number:
        await db.portabilities.insert_one({
            "portabilityId": str(uuid.uuid4().int)[:12], "fiscalId": body.fiscalId,
            "customerName": order["customerName"], "lineNumber": line_number,
            "type": "IN", "donorOperatorId": body.donorOperatorId,
            "status": "IN_PROGRESS", "created": now_iso()})

    return {"order": clean(order), "invoiceId": str(invoice["_id"]),
            "invoiceNumber": invoice["invoiceNumber"], "contractNumber": contract_number,
            "likesOrderId": likes_order_id, "lineNumber": line_number}


async def _build_contract(order):
    customer = await db.customers.find_one({"fiscalId": order["fiscalId"]})
    ba = (customer.get("billingAddress", {}) if customer else {}) or {}
    address = f"{ba.get('street', '')} {ba.get('streetNumber', '')}, {ba.get('postalCode', '')} {ba.get('cityName', '')} ({ba.get('provinceName', '')})".strip()
    donor = None
    if order.get("donorOperatorId"):
        donor = next((d["Name"] for d in likes_client.get_donor_operators() if d.get("Code") == order["donorOperatorId"]), order["donorOperatorId"])
    # Firma: recuperar de la solicitud (application) asociada al nº de contrato
    sig_img, signer = None, None
    app_doc = await db.applications.find_one({"contractCode": order.get("contractNumber")})
    if app_doc:
        sig_img = app_doc.get("signatureImage")
        signer = app_doc.get("signerName")
    if signer is None and customer:
        signer = (customer.get("kyc") or {}).get("signerName")
    return {
        "contractNumber": order.get("contractNumber", order["orderId"]),
        "date": order.get("signedAt") or order.get("created"), "customerName": order.get("customerName"),
        "fiscalId": order["fiscalId"], "customerAddress": address,
        "customerEmail": customer.get("email") if customer else "",
        "customerPhone": customer.get("contactPhone") if customer else "",
        "productName": order.get("productName"), "family": order.get("family"),
        "lineNumber": order.get("lineNumber"), "price": order.get("price", 0),
        "portability": order.get("portability", False), "donorOperator": donor,
        "signed": order.get("signed", False),
        "signerName": signer, "signatureImage": sig_img,
    }


# ------------------------- plantilla de contrato (editable) -------------------------
class ClauseItem(BaseModel):
    title: str = ""
    body: str = ""


class ContractTemplateBody(BaseModel):
    title: str
    subtitle: str = ""
    issuerBrand: str
    issuerLegal: str
    issuerCif: str
    issuerAddr: str
    reunidosOperator: str
    reunidosClient: str
    clauses: List[ClauseItem]


async def _get_contract_template():
    doc = await db.contract_template.find_one({"_id": "main"})
    if not doc:
        return dict(DEFAULT_CONTRACT_TEMPLATE)
    doc.pop("_id", None)
    return doc


async def _trigger_likes_sync(contract_code):
    """Sincroniza un alta (por su nº de contrato) con Likes: cliente + DNI + orden + contrato."""
    order = await db.orders.find_one({"contractNumber": contract_code})
    if not order:
        return {"synced": False, "reason": "order_not_found"}
    app_doc = await db.applications.find_one({"contractCode": contract_code})
    customer = await db.customers.find_one({"fiscalId": order["fiscalId"]})
    if not customer:
        return {"synced": False, "reason": "customer_not_found"}
    tariff = await db.tariffs.find_one({"productId": order.get("productId")})
    likes_product_id = (tariff or {}).get("likesProductId") or order.get("productId")
    # Generar el contrato firmado (PDF) con la plantilla editable
    tpl = await _get_contract_template()
    try:
        ct = _app_to_contract(app_doc) if app_doc else await _build_contract(order)
        contract_pdf = generate_contract_pdf(ct, tpl)
    except Exception:  # noqa
        contract_pdf = None
    result = await likes_sync.sync_alta_to_likes(db, app_doc or {}, customer, order, contract_pdf, likes_product_id)
    await db.orders.update_one({"orderId": order["orderId"]}, {"$set": {
        "likesSync": {"synced": result.get("synced"), "likesOrderId": result.get("likesOrderId"),
                      "log": result.get("log", []), "at": now_iso(), "reason": result.get("reason")}}})
    if result.get("likesOrderId"):
        await db.customers.update_one({"fiscalId": customer["fiscalId"]},
                                      {"$set": {"likesOrderId": result["likesOrderId"], "likesSynced": True}})
    await log_event("likes", "success" if result.get("synced") else "warning",
                    f"Sync Likes alta {contract_code}: {'OK' if result.get('synced') else result.get('reason')}",
                    {"fiscalId": order["fiscalId"]})
    return result


@api.post("/customers/{fiscalId}/sync-likes")
async def sync_customer_likes(fiscalId: str, request: Request):
    await require_perm(request, "orders.manage")
    order = await db.orders.find_one({"fiscalId": fiscalId, "contractNumber": {"$exists": True}},
                                     sort=[("created", -1)])
    if not order:
        raise HTTPException(status_code=404, detail="El cliente no tiene ningún alta con contrato")
    result = await _trigger_likes_sync(order["contractNumber"])
    if not result.get("synced") and result.get("reason") == "not_connected":
        raise HTTPException(status_code=503, detail="Likes no está conectado (IP no autorizada / entorno preview)")
    return result


@api.get("/likes/status")
async def likes_status(request: Request):
    await current_user(request)
    likes_client.get_token()  # refresca estado
    return {"live": likes_client.CONNECTION_STATE.get("live"),
            "lastError": likes_client.CONNECTION_STATE.get("last_error")}


@api.post("/customers/{fiscalId}/reconcile")
async def reconcile_customer_ep(fiscalId: str, request: Request):
    """Trae de Likes el estado real del cliente (órdenes, líneas, consumos, SVAs, portabilidades)."""
    await require_perm(request, "customers.view")
    result = await likes_reconcile.reconcile_customer(db, fiscalId)
    if not result.get("reconciled") and result.get("reason") == "not_connected":
        raise HTTPException(status_code=503, detail="Likes no está conectado (IP no autorizada / preview)")
    return result


@api.post("/likes/reconcile-all")
async def reconcile_all_ep(request: Request):
    await require_perm(request, "orders.manage")
    result = await likes_reconcile.reconcile_all(db)
    if not result.get("reconciled") and result.get("reason") == "not_connected":
        raise HTTPException(status_code=503, detail="Likes no está conectado (IP no autorizada / preview)")
    return result


@api.post("/orders/{order_id}/sync-likes")
async def sync_order_likes(order_id: str, request: Request):
    await require_perm(request, "orders.manage")
    order = await db.orders.find_one({"orderId": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if not order.get("contractNumber"):
        raise HTTPException(status_code=400, detail="La orden no tiene contrato asociado")
    result = await _trigger_likes_sync(order["contractNumber"])
    if not result.get("synced") and result.get("reason") == "not_connected":
        raise HTTPException(status_code=503, detail="Likes no está conectado (IP no autorizada / entorno preview)")
    return result


@api.get("/customers/{fiscalId}/likes")
async def customer_likes_mirror(fiscalId: str, request: Request):
    """Vista espejo en vivo desde Likes: órdenes, suscripciones y portabilidades del cliente."""
    await require_perm(request, "customers.view")
    if not likes_client.get_token():
        return {"live": False, "orders": [], "subscriptions": [], "portabilities": []}
    subs = likes_client.get_subscriptions(fiscalId)
    orders = likes_client.get_customer_orders(fiscalId)
    ports = [p for p in likes_client.get_portabilities() if p.get("fiscalId") == fiscalId]
    return {"live": True, "orders": orders, "subscriptions": subs, "portabilities": ports}


@api.post("/likes/sync-catalog")
async def sync_catalog_from_likes(request: Request):
    """Trae los productos reales de Likes y los upserta en tarifas, conservando coste/precio editados."""
    await require_perm(request, "tariffs.manage")
    if not likes_client.get_token():
        raise HTTPException(status_code=503, detail="Likes no conectado (IP no autorizada / preview)")
    real = likes_client.get_products()
    n = 0
    for p in real:
        pid = p.get("productId")
        if not pid:
            continue
        existing = await db.tariffs.find_one({"likesProductId": pid}) or await db.tariffs.find_one({"productId": pid})
        base = {"likesProductId": pid, "productName": p.get("productName"),
                "family": p.get("family"), "type": p.get("type", "Main"),
                "marketingText": p.get("marketingText", []), "pvpr": p.get("price"),
                "imageUrl": p.get("imageUrl")}
        if existing:
            await db.tariffs.update_one({"_id": existing["_id"]}, {"$set": base})
        else:
            base.update({"productId": pid, "price": round((p.get("price") or 0) * 1.21, 2),
                         "costPrice": p.get("price") or 0, "active": True, "created": now_iso()})
            await db.tariffs.insert_one(base)
        n += 1
    await log_event("likes", "success", f"Catálogo sincronizado desde Likes: {n} productos")
    return {"synced": n}


@api.get("/contract-template")
async def get_contract_template(request: Request):
    await require_admin(request)
    return await _get_contract_template()


@api.put("/contract-template")
async def put_contract_template(body: ContractTemplateBody, request: Request):
    await require_admin(request)
    doc = body.model_dump()
    await db.contract_template.update_one({"_id": "main"}, {"$set": doc}, upsert=True)
    return doc


@api.post("/contract-template/reset")
async def reset_contract_template(request: Request):
    await require_admin(request)
    await db.contract_template.delete_one({"_id": "main"})
    return dict(DEFAULT_CONTRACT_TEMPLATE)


@api.get("/orders/{order_id}/contract/pdf")
async def order_contract_pdf(order_id: str, request: Request):
    user = await current_user(request)
    order = await db.orders.find_one({"orderId": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if user.get("role") == "client" and order["fiscalId"] != user.get("fiscalId"):
        raise HTTPException(status_code=403, detail="No autorizado")
    ct = await _build_contract(order)
    tpl = await _get_contract_template()
    pdf_bytes = generate_contract_pdf(ct, tpl)
    return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf",
                             headers={"Content-Disposition": f"inline; filename={ct['contractNumber']}.pdf"})


@api.post("/orders/{order_id}/contract/sign")
async def sign_contract(order_id: str, request: Request):
    await require_admin(request)
    r = await db.orders.update_one({"orderId": order_id}, {"$set": {"signed": True, "signedAt": now_iso()}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return {"ok": True}


@api.post("/orders/{order_id}/activate")
async def activate_order(order_id: str, request: Request):
    await require_admin(request)
    order = await db.orders.find_one({"orderId": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    await db.orders.update_one({"orderId": order_id}, {"$set": {"status": "COMPLETED", "activatedAt": now_iso()}})
    line = await db.lines.find_one({"lineNumber": order.get("lineNumber")})
    if line:
        await db.lines.update_one({"lineNumber": order["lineNumber"]}, {"$set": {"status": "ACTIVE"}})
    if emailer.is_configured():
        cust = await db.customers.find_one({"fiscalId": order["fiscalId"]})
        to = cust.get("email") if cust else None
        pins = (line or {}).get("pins") or {}
        if to:
            try:
                html = emailer.base_template("¡Bienvenido a GoRoky! Tu línea ya está activada",
                    f"Hola {order.get('customerName', '')},<br><br>¡Tu línea ya está <b>activada</b>! "
                    f"Ya puedes disfrutar de <b>{order.get('productName', '')}</b>.<br><br>"
                    "<b>Datos de tu línea:</b><br>"
                    f"• Número: <b>{order.get('lineNumber', '')}</b><br>"
                    f"• PIN: <b>{pins.get('pin', '—')}</b> · PUK: <b>{pins.get('puk', '—')}</b><br>"
                    f"• PIN2: {pins.get('pin2', '—')} · PUK2: {pins.get('puk2', '—')}<br>"
                    f"• ICC (SIM): {(line or {}).get('icc', '—')}<br><br>"
                    "Gracias por confiar en GoRoky. Estamos encantados de tenerte con nosotros. 🎉")
                await emailer.send_email(to, "¡Bienvenido a GoRoky! Tu línea está activada", html)
            except Exception:
                pass
    return {"ok": True, "status": "COMPLETED"}


@api.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: str, request: Request):
    await require_admin(request)
    order = await db.orders.find_one({"orderId": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    await db.orders.update_one({"orderId": order_id}, {"$set": {"status": "CANCELLED", "cancelledAt": now_iso()}})
    if order.get("lineNumber"):
        await db.lines.update_one({"lineNumber": order["lineNumber"]}, {"$set": {"status": "SUSPENDED"}})
    return {"ok": True, "status": "CANCELLED"}


@api.get("/me/orders")
async def my_orders(request: Request):
    user = await current_user(request)
    fid = user.get("fiscalId")
    if not fid:
        return []
    orders = await db.orders.find({"fiscalId": fid}).sort("created", -1).to_list(200)
    return [clean(o) for o in orders]


def _sim_pins():
    import random
    return {"pin": f"{random.randint(0,9999):04d}", "puk": f"{random.randint(0,99999999):08d}",
            "pin2": f"{random.randint(0,9999):04d}", "puk2": f"{random.randint(0,99999999):08d}"}


def _gen_cdrs():
    import random
    now = datetime.now(timezone.utc)
    out = []
    for _ in range(random.randint(10, 18)):
        r = random.random()
        day = random.randint(1, max(1, now.day))
        date = now.replace(day=day, hour=random.randint(8, 21), minute=random.randint(0, 59), second=0, microsecond=0)
        number = "6" + str(random.randint(10000000, 99999999))
        if r < 0.55:
            out.append({"type": "VOICE", "destination": "Llamada nacional", "calledNumber": number,
                        "duration": random.randint(20, 1500), "date": date.isoformat(), "price": 0.0, "bytes": 0})
        elif r < 0.8:
            out.append({"type": "SMS", "destination": "SMS nacional", "calledNumber": number,
                        "duration": 0, "date": date.isoformat(), "price": 0.0, "bytes": 0})
        else:
            out.append({"type": "DATA", "destination": "Datos", "calledNumber": None,
                        "duration": 0, "date": date.isoformat(), "price": 0.0, "bytes": random.randint(1000000, 900000000)})
    out.sort(key=lambda c: c["date"], reverse=True)
    return out


# ------------------------- invoices -------------------------
@api.get("/invoices")
async def list_invoices(request: Request, fiscalId: Optional[str] = None):
    user = await current_user(request)
    fid = await scope_fiscal(user, fiscalId)
    query = {"fiscalId": fid} if fid else {}
    invs = await db.invoices.find(query).sort("date", -1).to_list(500)
    return [clean(i) for i in invs]


@api.get("/invoices/{invoice_id}/pdf")
async def invoice_pdf(invoice_id: str, request: Request):
    from bson import ObjectId
    user = await current_user(request)
    try:
        inv = await db.invoices.find_one({"_id": ObjectId(invoice_id)})
    except Exception:
        inv = None
    if not inv:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    if user.get("role") == "client" and inv["fiscalId"] != user.get("fiscalId"):
        raise HTTPException(status_code=403, detail="No autorizado")
    pdf_bytes = generate_invoice_pdf(inv)
    return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf",
                             headers={"Content-Disposition": f"inline; filename={inv['invoiceNumber']}.pdf"})


# ------------------------- tickets -------------------------
@api.get("/tickets")
async def list_tickets(request: Request, fiscalId: Optional[str] = None):
    user = await current_user(request)
    if user.get("role") == "client":
        fid = user.get("fiscalId")
        query = {"fiscalIds": fid}
    else:
        query = {"fiscalIds": fiscalId} if fiscalId else {}
    tickets = await db.tickets.find(query).sort("created", -1).to_list(500)
    return [clean(t) for t in tickets]


@api.post("/tickets")
async def create_ticket(body: TicketCreate, request: Request):
    user = await current_user(request)
    fiscal_ids = body.fiscalIds or []
    if user.get("role") == "client" and user.get("fiscalId"):
        fiscal_ids = [user["fiscalId"]]
    ticket = {
        "ticketId": str(uuid.uuid4().int)[:16], "category": body.category, "typology": body.typology,
        "description": body.description, "fiscalIds": fiscal_ids,
        "lineNumbers": body.lineNumbers or [], "status": "OPEN",
        "createdBy": user["email"], "created": now_iso(),
    }
    await db.tickets.insert_one(ticket)
    return clean(ticket)


# ------------------------- client portal summary -------------------------
@api.get("/me/summary")
async def me_summary(request: Request):
    user = await current_user(request)
    fid = user.get("fiscalId")
    if not fid:
        raise HTTPException(status_code=400, detail="Cuenta sin cliente asociado")
    cust = await db.customers.find_one({"fiscalId": fid})
    lines = await db.lines.find({"fiscalId": fid}).to_list(100)
    subs = await db.subscriptions.find({"fiscalId": fid}).to_list(100)
    invs = await db.invoices.find({"fiscalId": fid}).sort("date", -1).to_list(100)
    tickets = await db.tickets.find({"fiscalIds": fid}).sort("created", -1).to_list(100)
    monthly = round(sum(l.get("price", 0) for l in lines), 2)
    pending = sum(1 for i in invs if i["status"] == "pending")
    # contrato firmado disponible para el cliente
    contract = None
    appc = await db.applications.find_one({"fiscalId": fid, "status": "COMPLETED"}, sort=[("signedAt", -1)])
    if appc:
        contract = {"code": appc.get("contractCode"), "signedAt": appc.get("signedAt"), "signed": True}
    else:
        order = await db.orders.find_one({"fiscalId": fid, "contractNumber": {"$exists": True}}, sort=[("created", -1)])
        if order:
            contract = {"code": order.get("contractNumber"), "signedAt": order.get("signedAt"),
                        "signed": bool(order.get("signed"))}
    return {"customer": clean(cust) if cust else None,
            "lines": [clean(_enrich_line(l)) for l in lines], "subscriptions": [clean(s) for s in subs],
            "invoices": [clean(i) for i in invs], "tickets": [clean(t) for t in tickets],
            "monthlyTotal": monthly, "pendingInvoices": pending, "contract": contract}


@api.get("/me/contract.pdf")
async def my_contract_pdf(request: Request):
    user = await current_user(request)
    fid = user.get("fiscalId")
    if not fid:
        raise HTTPException(status_code=400, detail="Cuenta sin cliente asociado")
    tpl = await _get_contract_template()
    appc = await db.applications.find_one({"fiscalId": fid, "status": "COMPLETED"}, sort=[("signedAt", -1)])
    if appc:
        ct = _app_to_contract(appc)
        code = appc.get("contractCode", "contrato")
    else:
        order = await db.orders.find_one({"fiscalId": fid, "contractNumber": {"$exists": True}}, sort=[("created", -1)])
        if not order:
            raise HTTPException(status_code=404, detail="No tienes ningún contrato disponible todavía")
        ct = await _build_contract(order)
        code = order.get("contractNumber", "contrato")
    pdf_bytes = generate_contract_pdf(ct, tpl)
    return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf",
                             headers={"Content-Disposition": f"inline; filename={code}.pdf"})


# ------------------------- payments (Stripe) -------------------------
@api.post("/payments/checkout")
async def create_checkout(body: CheckoutRequest, request: Request):
    from bson import ObjectId
    user = await current_user(request)
    try:
        inv = await db.invoices.find_one({"_id": ObjectId(body.invoiceId)})
    except Exception:
        inv = None
    if not inv:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    if user.get("role") == "client" and inv["fiscalId"] != user.get("fiscalId"):
        raise HTTPException(status_code=403, detail="No autorizado")
    await _stripe_apply()
    amount = int(round(inv["total"] * 100))
    session = stripe.checkout.Session.create(
        line_items=[{
            "price_data": {"currency": "eur", "unit_amount": amount,
                           "product_data": {"name": f"Factura {inv['invoiceNumber']}"}},
            "quantity": 1,
        }],
        mode="payment",
        success_url=f"{body.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{body.origin_url}/payment/cancel",
        metadata={"invoice_id": str(inv["_id"]), "invoice_number": inv["invoiceNumber"]},
    )
    await db.payment_transactions.insert_one({
        "session_id": session.id, "invoice_id": str(inv["_id"]),
        "invoice_number": inv["invoiceNumber"], "amount": inv["total"], "currency": "eur",
        "status": "initiated", "payment_status": "pending",
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    return {"checkout_url": session.url, "session_id": session.id}


@api.get("/payments/status/{session_id}")
async def payment_status(session_id: str):
    from bson import ObjectId
    record = await db.payment_transactions.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    if record.get("payment_status") != "paid":
        try:
            await _stripe_apply()
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"status": "completed", "payment_status": "paid", "updated_at": now_iso()}})
                if record.get("kind") == "subscription":
                    # fallback: configurar cobro recurrente sin esperar al webhook
                    already = await db.subscriptions.find_one(
                        {"billing.stripeSubscriptionId": s.get("subscription")}) if s.get("subscription") else None
                    if not already:
                        await _on_subscription_checkout(dict(s))
                elif record.get("invoice_id"):
                    await db.invoices.update_one({"_id": ObjectId(record["invoice_id"])},
                                                 {"$set": {"status": "paid"}})
                record = await db.payment_transactions.find_one({"session_id": session_id})
        except Exception as e:  # noqa
            logger.warning("stripe status error: %s", e)
    return {"session_id": record["session_id"], "status": record["status"],
            "payment_status": record["payment_status"], "invoice_number": record.get("invoice_number")}


@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    from bson import ObjectId
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    cfg = await _stripe_apply()
    secret = (cfg.get("stripeWebhookSecret") or "").strip() or os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, secret)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature")
    obj, t = event["data"]["object"], event["type"]
    if t == "checkout.session.completed":
        mode = obj.get("mode")
        if mode == "subscription":
            await _on_subscription_checkout(obj)
        else:
            await db.payment_transactions.update_one(
                {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
                {"$set": {"status": "completed", "payment_status": obj.get("payment_status", "paid"),
                          "updated_at": now_iso()}})
            inv_id = obj.get("metadata", {}).get("invoice_id")
            if inv_id:
                await db.invoices.update_one({"_id": ObjectId(inv_id)}, {"$set": {"status": "paid"}})
    elif t == "invoice.payment_succeeded":
        sub_id = obj.get("subscription")
        if sub_id and obj.get("billing_reason") == "subscription_cycle":
            sub = await db.subscriptions.find_one({"billing.stripeSubscriptionId": sub_id})
            if sub:
                await _billing_success(sub)
    elif t == "invoice.payment_failed":
        sub_id = obj.get("subscription")
        if sub_id:
            sub = await db.subscriptions.find_one({"billing.stripeSubscriptionId": sub_id})
            if sub:
                await _billing_failed(sub)
    return {"status": "ok"}


# ------------------------- app settings (DB) -------------------------
async def get_app_settings():
    s = await db.app_settings.find_one({"_id": "config"})
    if not s:
        s = {"_id": "config", "autoApprove": False, "setupFee": 0.0,
             "reminderDays": BILLING_REMINDER_DAYS, "maxFailed": BILLING_MAX_FAILED,
             "created": now_iso()}
        await db.app_settings.insert_one(s)
    return s


async def _stripe_apply():
    """Aplica la clave de Stripe desde la BD (o .env como fallback) antes de cada operación."""
    s = await get_app_settings()
    key = (s.get("stripeSecretKey") or "").strip() or os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
    stripe.api_key = key
    return s


def _mask_secret(v):
    if not v:
        return ""
    return "••••" + v[-4:] if len(v) > 4 else "••••"


@api.get("/admin/settings")
async def admin_settings_get(request: Request):
    await require_admin(request)
    s = await get_app_settings()
    s.pop("_id", None)
    # No exponer secretos completos
    s["stripeSecretKeyMasked"] = _mask_secret(s.get("stripeSecretKey"))
    s["stripeWebhookSecretMasked"] = _mask_secret(s.get("stripeWebhookSecret"))
    s["stripeSecretKeySet"] = bool(s.get("stripeSecretKey"))
    s["stripeWebhookSecretSet"] = bool(s.get("stripeWebhookSecret"))
    s.pop("stripeSecretKey", None)
    s.pop("stripeWebhookSecret", None)
    return s


@api.put("/admin/settings")
async def admin_settings_put(body: AppSettingsBody, request: Request):
    await require_admin(request)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    # No sobrescribir secretos con cadena vacía o el placeholder enmascarado
    for k in ("stripeSecretKey", "stripeWebhookSecret"):
        if k in updates and (not str(updates[k]).strip() or str(updates[k]).startswith("••••")):
            updates.pop(k)
    if updates:
        await db.app_settings.update_one({"_id": "config"}, {"$set": updates}, upsert=True)
    if "stripeSecretKey" in updates:
        await _stripe_apply()
    s = await get_app_settings()
    s.pop("_id", None)
    s.pop("stripeSecretKey", None)
    s.pop("stripeWebhookSecret", None)
    await log_event("system", "info", f"Configuración actualizada: {', '.join(updates.keys())}")
    return s


# ------------------------- system events / alerts -------------------------
@api.get("/events")
async def list_events(request: Request, source: Optional[str] = None,
                      level: Optional[str] = None, unread: Optional[bool] = None):
    await require_admin(request)
    q = {}
    if source:
        q["source"] = source
    if level:
        q["level"] = level
    if unread:
        q["read"] = False
    events = await db.system_events.find(q).sort("created_at", -1).to_list(300)
    unread_count = await db.system_events.count_documents({"read": False})
    return {"events": [clean(e) for e in events], "unreadCount": unread_count}


@api.get("/events/unread-count")
async def events_unread(request: Request):
    await require_admin(request)
    return {"unreadCount": await db.system_events.count_documents({"read": False})}


@api.post("/events/{event_id}/read")
async def mark_event_read(event_id: str, request: Request):
    from bson import ObjectId
    await require_admin(request)
    await db.system_events.update_one({"_id": ObjectId(event_id)}, {"$set": {"read": True}})
    return {"ok": True}


@api.post("/events/read-all")
async def mark_all_read(request: Request):
    await require_admin(request)
    await db.system_events.update_many({"read": False}, {"$set": {"read": True}})
    return {"ok": True}


@api.get("/system/health")
async def system_health(request: Request):
    await require_admin(request)
    active_subs = await db.subscriptions.count_documents({"billing.enabled": True})
    failing = await db.subscriptions.count_documents({"billing.status": "past_due"})
    errors = await db.system_events.count_documents({"level": "error", "read": False})
    return {
        "likes": {"live": likes_client.CONNECTION_STATE["live"],
                  "error": likes_client.CONNECTION_STATE["last_error"],
                  "outboundIpHint": os.environ.get("OUTBOUND_IP_HINT", "")},
        "stripe": {"ok": True, "mode": os.environ.get("STRIPE_MODE", "test")},
        "email": {"configured": emailer.is_configured(), "sender": os.environ.get("SENDER_EMAIL", "")},
        "billing": {"activeSubscriptions": active_subs, "pastDue": failing},
        "unreadErrors": errors,
    }


# ------------------------- Solicitudes (application review) -------------------------
@api.get("/applications")
async def list_applications(request: Request, status: Optional[str] = None):
    await require_admin(request)
    q = {}
    if status:
        q["reviewStatus"] = status
    apps = await db.applications.find(q).sort("createdAt", -1).to_list(500)
    return [{"token": a["token"], "contractCode": a.get("contractCode"),
             "name": f"{a.get('name','')} {a.get('firstSurname','')}".strip(),
             "fiscalId": a.get("fiscalId"), "email": a.get("email"),
             "productName": a.get("productName"), "family": a.get("family"),
             "price": a.get("price"), "status": a.get("status"),
             "reviewStatus": a.get("reviewStatus", "PENDING_REVIEW"),
             "paymentStatus": a.get("paymentStatus", "pending"),
             "paymentMethod": a.get("paymentMethod", "sepa"),
             "simType": a.get("simType", "esim"),
             "lineNumber": a.get("lineNumber"), "createdAt": a.get("createdAt")}
            for a in apps]


@api.get("/applications/{token}/detail")
async def application_detail(token: str, request: Request):
    await require_admin(request)
    a = await db.applications.find_one({"token": token})
    if not a:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    return clean(a)


async def _do_activate_order(order):
    """Activa la línea de una orden, envía email de bienvenida (+QR eSIM) y gestiona envío de SIM física."""
    await db.orders.update_one({"orderId": order["orderId"]},
                               {"$set": {"status": "COMPLETED", "activatedAt": now_iso()}})
    line = await db.lines.find_one({"lineNumber": order.get("lineNumber")}) if order.get("lineNumber") else None
    # No sobrescribir el estado real de una línea espejada de Likes.
    if line and line.get("source") != "likes":
        await db.lines.update_one({"lineNumber": line["lineNumber"]},
                                  {"$set": {"status": "ACTIVE"}})
    cust = await db.customers.find_one({"fiscalId": order["fiscalId"]})
    to = cust.get("email") if cust else None
    pins = (line or {}).get("pins") or {}
    body = (f"Hola {order.get('customerName', '')},<br><br>¡<b>Enhorabuena! Tu pedido se ha procesado correctamente</b> "
            f"y tu línea ya está <b>activada</b>. Ya puedes disfrutar de <b>{order.get('productName', '')}</b>.<br><br>"
            "<b>Datos de tu línea:</b><br>"
            f"• Número: <b>{order.get('lineNumber', '')}</b><br>"
            f"• PIN: <b>{pins.get('pin', '—')}</b> · PUK: <b>{pins.get('puk', '—')}</b><br>"
            f"• PIN2: {pins.get('pin2', '—')} · PUK2: {pins.get('puk2', '—')}<br>"
            f"• ICC (SIM): {(line or {}).get('icc', '—')}<br>")
    if line and line.get("eSim") and line.get("esimData"):
        e = line["esimData"]
        body += ("<br><b>Instalación de tu eSIM:</b><br>"
                 f"Escanea este QR desde tu móvil:<br><br>"
                 f"<img src='{e.get('qrUrl')}' alt='QR eSIM' width='200' height='200' /><br>"
                 f"Código de activación: <b>{e.get('activationCode')}</b><br>"
                 f"SM-DP+: {e.get('smdpAddress')}<br>")
    body += "<br>Gracias por confiar en GoRoky. 🎉"
    await _send_mail_safe("email", to, "¡Enhorabuena! Tu pedido se ha procesado correctamente · GoRoky",
                          emailer.base_template("¡Enhorabuena! Tu pedido se ha procesado correctamente", body))
    # crear acceso a la app + enviar credenciales (si aún no tiene usuario)
    if cust:
        await _ensure_client_access(cust)
    await log_event("order", "success",
                    f"Línea {order.get('lineNumber')} activada · {order.get('customerName')}",
                    {"orderId": order["orderId"]})
    # SIM física → crear envío
    if line and line.get("family") == "Mobile" and not line.get("eSim"):
        exists = await db.shipments.find_one({"lineNumber": line["lineNumber"]})
        if not exists:
            await db.shipments.insert_one({
                "shipmentId": str(uuid.uuid4().int)[:10], "fiscalId": order["fiscalId"],
                "customerName": order.get("customerName"), "lineNumber": line["lineNumber"],
                "address": (cust.get("billingAddress") or {}).get("street", "") if cust else "",
                "status": "PENDING", "carrier": None, "tracking": None, "created": now_iso()})
            await log_event("order", "info",
                            f"Envío de SIM física pendiente · línea {line['lineNumber']}")
    # comisión de revendedor por SIM activada
    owner_id = order.get("ownerId")
    if owner_id:
        owner = await db.users.find_one({"_id": _OID(owner_id)})
        if owner and owner.get("role") == "reseller" and (owner.get("commissionPerSim") or 0) > 0:
            await db.commissions.insert_one({
                "commissionId": str(uuid.uuid4().int)[:10], "resellerId": owner_id,
                "resellerName": owner.get("name"), "lineNumber": order.get("lineNumber"),
                "customerName": order.get("customerName"), "amount": owner["commissionPerSim"],
                "created": now_iso()})
            await log_event("order", "success",
                            f"Comisión {owner['commissionPerSim']:.2f}€ para {owner.get('name')} · línea {order.get('lineNumber')}")


async def _provision_via_likes(a):
    """Aprueba un alta: crea la orden REAL en Likes (cliente + docs + signupv2 + contrato),
    espeja los datos 100% reales (nº línea, ICC, PIN/PUK, SVAs, GB, estado, CDRs) y activa el
    servicio. Lanza HTTPException si Likes no está disponible (no se fabrican datos)."""
    order = await db.orders.find_one({"contractNumber": a.get("contractCode")})
    if not order:
        raise HTTPException(status_code=400, detail="La solicitud aún no tiene orden (contrato sin firmar)")
    # 1) Crear el alta real en Likes
    result = await _trigger_likes_sync(a["contractCode"])
    if not result.get("synced"):
        reason = result.get("reason")
        if reason == "not_connected":
            raise HTTPException(status_code=503,
                detail="Likes no está conectado (IP no autorizada). El alta se crea en Likes al aprobar; no se puede aprobar sin conexión con Likes.")
        raise HTTPException(status_code=502, detail=f"No se pudo crear el alta en Likes: {reason or 'error desconocido'}")
    # 2) Espejar los datos REALES desde Likes
    try:
        await likes_reconcile.reconcile_customer(db, a["fiscalId"])
    except Exception as e:  # noqa
        logger.warning("reconcile tras aprobar %s: %s", a.get("fiscalId"), e)
    # 3) Activar servicio (email de bienvenida con datos reales + acceso a la app)
    order = await db.orders.find_one({"contractNumber": a.get("contractCode")})
    await _do_activate_order(order)
    return result, order


@api.post("/applications/{token}/approve")
async def approve_application(token: str, request: Request):
    await require_admin(request)
    a = await db.applications.find_one({"token": token})
    if not a:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    result, order = await _provision_via_likes(a)
    await db.applications.update_one({"token": token},
        {"$set": {"reviewStatus": "APPROVED", "approvedAt": now_iso(),
                  "likesOrderId": result.get("likesOrderId")}})
    await log_event("order", "success",
                    f"Alta aprobada y creada en Likes · {a.get('name')} ({a.get('fiscalId')}) · Likes orderId {result.get('likesOrderId')}")
    return {"ok": True, "reviewStatus": "APPROVED", "likesOrderId": result.get("likesOrderId")}


REJECT_REASONS = {
    "incomplete_data": "Datos incompletos",
    "doc_quality": "Foto del DNI/Pasaporte con mala resolución o ilegible",
    "doc_mismatch": "Los datos no coinciden con el documento",
    "selfie_issue": "Selfie de verificación no válida",
    "iban_issue": "IBAN / datos bancarios incorrectos",
    "address_issue": "Dirección incorrecta o incompleta",
    "other": "Otro motivo",
}


@api.post("/applications/{token}/reject")
async def reject_application(token: str, body: RejectBody, request: Request):
    await require_admin(request)
    a = await db.applications.find_one({"token": token})
    if not a:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    label = REJECT_REASONS.get(body.category or "", "")
    reason_full = " · ".join([x for x in [label, (body.reason or "").strip()] if x]) or "Documentación incompleta"
    # Se devuelve al cliente para corrección (no es un rechazo terminal): puede reenviar sus datos.
    await db.applications.update_one({"token": token},
        {"$set": {"reviewStatus": "CHANGES_REQUESTED", "rejectReason": body.reason or "",
                  "rejectCategory": body.category or "", "rejectLabel": label, "rejectedAt": now_iso()}})
    order = await db.orders.find_one({"contractNumber": a.get("contractCode")})
    if order:
        await db.orders.update_one({"orderId": order["orderId"]}, {"$set": {"status": "ON_HOLD"}})
    link = f"{os.environ.get('FRONTEND_URL', '').rstrip('/')}/corregir/{token}"
    await _send_mail_safe("email", a.get("email"), "Necesitamos que revises tu solicitud · GoRoky",
        emailer.base_template("Necesitamos que corrijas algunos datos",
            f"Hola {a.get('name','')},<br><br>Para poder completar tu alta necesitamos que revises tu solicitud.<br><br>"
            f"<b>Motivo:</b> {reason_full}<br><br>"
            "Por favor, vuelve a subir tu documentación y reenvía tu solicitud desde este enlace:<br><br>"
            f"<a href='{link}' style='background:#0033ff;color:#fff;padding:11px 20px;border-radius:22px;text-decoration:none;font-weight:bold'>Corregir mi solicitud</a>"
            "<br><br>En cuanto la reenvíes, la revisaremos de nuevo lo antes posible."))
    await log_event("order", "warning",
                    f"Solicitud devuelta al cliente para corrección · {a.get('name')} ({a.get('fiscalId')}): {reason_full}")
    return {"ok": True, "reviewStatus": "CHANGES_REQUESTED"}


# ------------------------- recurring billing (card / SEPA) -------------------------
async def _ensure_stripe_customer(customer):
    await _stripe_apply()
    if customer.get("stripeCustomerId"):
        return customer["stripeCustomerId"]
    sc = stripe.Customer.create(
        name=f"{customer.get('name','')} {customer.get('firstSurname','')}".strip(),
        email=customer.get("email"),
        metadata={"fiscalId": customer["fiscalId"]})
    await db.customers.update_one({"fiscalId": customer["fiscalId"]},
                                 {"$set": {"stripeCustomerId": sc.id}})
    return sc.id


async def _create_recurring_checkout(customer, product, method, origin_url, meta):
    """Crea una sesión de Checkout en modo suscripción (card|sepa) con cuota de alta + mensual."""
    cid = await _ensure_stripe_customer(customer)
    settings = await get_app_settings()
    setup_fee = float(settings.get("setupFee") or 0)
    pm_types = ["sepa_debit"] if method == "sepa" else ["card"]
    monthly = float(product["price"])
    line_items = [{
        "price_data": {"currency": "eur",
                       "product_data": {"name": f"{product['productName']} (cuota mensual)"},
                       "unit_amount": int(round(monthly * 100)),
                       "recurring": {"interval": "month"}},
        "quantity": 1,
    }]
    if setup_fee > 0:
        line_items.append({
            "price_data": {"currency": "eur",
                           "product_data": {"name": "Cuota de alta"},
                           "unit_amount": int(round(setup_fee * 100))},
            "quantity": 1,
        })
    sub_data = {"metadata": meta, "trial_period_days": 30}
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=cid,
        payment_method_types=pm_types,
        line_items=line_items,
        subscription_data=sub_data,
        success_url=f"{origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin_url}/payment/cancel",
        metadata=meta,
    )
    await db.payment_transactions.insert_one({
        "session_id": session.id, "fiscalId": customer["fiscalId"],
        "kind": "subscription", "method": method, "amount": setup_fee + monthly,
        "currency": "eur", "status": "initiated", "payment_status": "pending",
        "meta": meta, "created_at": now_iso(), "updated_at": now_iso()})
    return session


@api.post("/public/applications/{token}/checkout")
async def public_recurring_checkout(token: str, body: RecurringCheckoutBody):
    a = await db.applications.find_one({"token": token})
    if not a:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    customer = await db.customers.find_one({"fiscalId": a["fiscalId"]})
    if not customer:
        raise HTTPException(status_code=400, detail="Firma el contrato antes de pagar")
    product = await _get_tariff(a["productId"])
    meta = {"fiscalId": a["fiscalId"], "applicationToken": token,
            "contractCode": a.get("contractCode", ""), "purpose": "onboarding"}
    session = await _create_recurring_checkout(customer, product, body.method or a.get("paymentMethod", "sepa"),
                                               body.origin_url, meta)
    return {"checkout_url": session.url, "session_id": session.id}


@api.post("/subscriptions/{subscriptionId}/billing-checkout")
async def admin_recurring_checkout(subscriptionId: str, body: RecurringCheckoutBody, request: Request):
    await require_admin(request)
    sub = await db.subscriptions.find_one({"subscriptionId": subscriptionId})
    if not sub:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")
    customer = await db.customers.find_one({"fiscalId": sub["fiscalId"]})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    prod = sub["products"][0]
    product = {"productName": prod["productName"], "price": prod["price"]}
    meta = {"fiscalId": sub["fiscalId"], "subscriptionId": subscriptionId, "purpose": "admin_billing"}
    session = await _create_recurring_checkout(customer, product, body.method, body.origin_url, meta)
    return {"checkout_url": session.url, "session_id": session.id}


async def _get_saved_pm(customer):
    """Devuelve el payment_method de tarjeta guardado del cliente (para cobros off-session)."""
    cid = customer.get("stripeCustomerId")
    rec = customer.get("recurring") or {}
    if rec.get("stripeSubscriptionId"):
        try:
            ss = stripe.Subscription.retrieve(rec["stripeSubscriptionId"])
            pm = getattr(ss, "default_payment_method", None)
            if pm:
                return cid, pm
        except Exception as e:  # noqa
            logger.warning("get_saved_pm sub failed: %s", e)
    if cid:
        try:
            pms = stripe.PaymentMethod.list(customer=cid, type="card")
            if pms and pms.data:
                return cid, pms.data[0].id
        except Exception as e:  # noqa
            logger.warning("get_saved_pm list failed: %s", e)
    return cid, None


async def _create_service_invoice(customer, concept, amount, status):
    number = await _next_invoice_number()
    ba = customer.get("billingAddress", {}) or {}
    address = f"{ba.get('street', '')} {ba.get('streetNumber', '')}, {ba.get('postalCode', '')} {ba.get('cityName', '')} ({ba.get('provinceName', '')})".strip()
    subtotal = round(amount / 1.21, 2)
    tax = round(amount - subtotal, 2)
    now = datetime.now(timezone.utc)
    inv = {
        "invoiceNumber": number, "fiscalId": customer["fiscalId"],
        "customerName": f"{customer['name']} {customer.get('firstSurname', '')}".strip().upper(),
        "customerEmail": customer.get("email"), "customerAddress": address,
        "items": [{"description": concept, "detail": "Servicio adicional", "quantity": 1, "amount": amount}],
        "subtotal": subtotal, "tax": tax, "total": amount,
        "status": status, "date": now.isoformat(), "period": _period_label(now),
        "dueDate": (now + timedelta(days=15)).isoformat(),
        "paymentMethod": customer.get("paymentMethod", "NO"), "consumption": [], "kind": "service",
    }
    res = await db.invoices.insert_one(inv)
    inv["_id"] = res.inserted_id
    await _email_invoice(inv)
    return inv


@api.post("/customers/{fiscalId}/charge")
async def charge_service(fiscalId: str, body: ServiceChargeBody, request: Request):
    """Cobra un servicio adicional. Con tarjeta guardada: cobro inmediato off-session.
    Con SEPA / sin tarjeta: genera un enlace de pago (Checkout) para el cliente."""
    await require_perm(request, "billing.manage")
    customer = await db.customers.find_one({"fiscalId": fiscalId})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="El importe debe ser mayor que 0")
    await _stripe_apply()
    method = body.method or (customer.get("recurring") or {}).get("method") or "card"

    # 1) Tarjeta guardada → cobro inmediato off-session
    if method == "card":
        cid, pm = await _get_saved_pm(customer)
        if cid and pm:
            try:
                pi = stripe.PaymentIntent.create(
                    amount=int(round(body.amount * 100)), currency="eur", customer=cid,
                    payment_method=pm, off_session=True, confirm=True,
                    description=f"Servicio adicional · {body.concept}",
                    metadata={"fiscalId": fiscalId, "concept": body.concept, "kind": "service"})
                if pi.status == "succeeded":
                    inv = await _create_service_invoice(customer, body.concept, body.amount, "paid")
                    await log_event("stripe", "success",
                                    f"Cobro de servicio adicional · {body.concept} · {body.amount:.2f} € · {fiscalId}",
                                    {"fiscalId": fiscalId})
                    return {"status": "paid", "invoiceId": str(inv["_id"]), "invoiceNumber": inv["invoiceNumber"]}
                raise HTTPException(status_code=402, detail=f"El pago quedó en estado {pi.status}")
            except stripe.error.CardError as e:  # noqa
                await log_event("stripe", "error", f"Tarjeta rechazada en cobro adicional · {fiscalId}: {str(e)[:100]}")
                raise HTTPException(status_code=402, detail=f"Tarjeta rechazada: {e.user_message or str(e)}")
            except HTTPException:
                raise
            except Exception as e:  # noqa
                await log_event("stripe", "error", f"Error en cobro adicional · {fiscalId}: {str(e)[:120]}")
                raise HTTPException(status_code=400, detail=f"No se pudo cobrar: {str(e)[:120]}")

    # 2) SEPA o sin tarjeta guardada → enlace de pago (Checkout mode=payment)
    inv = await _create_service_invoice(customer, body.concept, body.amount, "pending")
    origin = body.origin_url or os.environ.get("FRONTEND_URL", "")
    cid = await _ensure_stripe_customer(customer)
    pm_types = ["sepa_debit"] if method == "sepa" else ["card"]
    session = stripe.checkout.Session.create(
        mode="payment", customer=cid, payment_method_types=pm_types,
        line_items=[{"price_data": {"currency": "eur", "unit_amount": int(round(body.amount * 100)),
                                    "product_data": {"name": body.concept}}, "quantity": 1}],
        success_url=f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/payment/cancel",
        metadata={"invoice_id": str(inv["_id"]), "invoice_number": inv["invoiceNumber"],
                  "fiscalId": fiscalId, "kind": "service"})
    await db.payment_transactions.insert_one({
        "session_id": session.id, "invoice_id": str(inv["_id"]), "invoice_number": inv["invoiceNumber"],
        "fiscalId": fiscalId, "amount": body.amount, "currency": "eur", "kind": "service",
        "status": "initiated", "payment_status": "pending", "created_at": now_iso(), "updated_at": now_iso()})
    # avisar al cliente con el enlace de pago
    await _send_mail_safe("email", customer.get("email"), f"Pago pendiente · {body.concept} · GoRoky",
        emailer.base_template("Tienes un pago pendiente",
            f"Hola {customer.get('name','')},<br><br>Se ha emitido una factura de <b>{body.amount:.2f} €</b> "
            f"por <b>{body.concept}</b>. Puedes pagarla de forma segura aquí:<br><br>"
            f"<a href='{session.url}' style='background:#0033ff;color:#fff;padding:10px 18px;border-radius:20px;text-decoration:none'>Pagar ahora</a>"))
    return {"status": "pending", "invoiceId": str(inv["_id"]), "invoiceNumber": inv["invoiceNumber"],
            "checkout_url": session.url}


async def _on_subscription_checkout(obj):
    """Se ejecuta al completar el Checkout de suscripción: guarda datos de cobro recurrente."""
    from bson import ObjectId
    meta = obj.get("metadata", {}) or {}
    fiscalId = meta.get("fiscalId")
    stripe_sub_id = obj.get("subscription")
    method = "sepa" if "sepa_debit" in (obj.get("payment_method_types") or []) else "card"
    await db.payment_transactions.update_one(
        {"session_id": obj["id"]},
        {"$set": {"status": "completed", "payment_status": "paid",
                  "stripe_subscription_id": stripe_sub_id, "updated_at": now_iso()}})
    # obtener método de pago / próxima fecha de cobro
    next_charge = None
    last4 = None
    try:
        ss = stripe.Subscription.retrieve(stripe_sub_id)
        if getattr(ss, "current_period_end", None):
            next_charge = datetime.fromtimestamp(ss.current_period_end, tz=timezone.utc).isoformat()
        elif getattr(ss, "trial_end", None):
            next_charge = datetime.fromtimestamp(ss.trial_end, tz=timezone.utc).isoformat()
        pm_id = getattr(ss, "default_payment_method", None)
        if pm_id:
            pm = stripe.PaymentMethod.retrieve(pm_id)
            if method == "sepa" and getattr(pm, "sepa_debit", None):
                last4 = pm.sepa_debit.last4
            elif getattr(pm, "card", None):
                last4 = pm.card.last4
    except Exception as e:  # noqa
        logger.warning("subscription retrieve failed: %s", e)
    if not next_charge:
        next_charge = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    billing = {"enabled": True, "stripeSubscriptionId": stripe_sub_id, "status": "active",
               "method": method, "last4": last4, "failedAttempts": 0,
               "nextChargeDate": next_charge, "remindersSent": [],
               "amount": (await db.payment_transactions.find_one({"session_id": obj["id"]}) or {}).get("amount")}
    # localizar suscripción
    sub = None
    if meta.get("subscriptionId"):
        sub = await db.subscriptions.find_one({"subscriptionId": meta["subscriptionId"]})
    if not sub and fiscalId:
        sub = await db.subscriptions.find_one({"fiscalId": fiscalId}, sort=[("created", -1)])
    if sub:
        billing["amount"] = sum(p.get("price", 0) for p in sub.get("products", [])) or billing["amount"]
        await db.subscriptions.update_one({"subscriptionId": sub["subscriptionId"]},
                                          {"$set": {"billing": billing}})
    if fiscalId:
        await db.customers.update_one({"fiscalId": fiscalId}, {"$set": {
            "paymentMethod": "SEPA CORE" if method == "sepa" else "CARD",
            "recurring": {"method": method, "last4": last4, "stripeSubscriptionId": stripe_sub_id}}})
    # marcar solicitud como pagada
    token = meta.get("applicationToken")
    if token:
        await db.applications.update_one({"token": token}, {"$set": {"paymentStatus": "paid"}})
    label = "tarjeta" if method == "card" else "domiciliación SEPA"
    await log_event("stripe", "success",
                    f"Cobro recurrente configurado ({label}) · {fiscalId} · próx. cobro {next_charge[:10]}",
                    {"fiscalId": fiscalId})
    # auto-aprobación (crea la orden real en Likes)
    settings = await get_app_settings()
    if settings.get("autoApprove") and token:
        a = await db.applications.find_one({"token": token})
        if a and a.get("contractCode"):
            try:
                result, order = await _provision_via_likes(a)
                await db.applications.update_one({"token": token},
                    {"$set": {"reviewStatus": "APPROVED", "approvedAt": now_iso(),
                              "autoApproved": True, "likesOrderId": result.get("likesOrderId")}})
                await log_event("order", "info", f"Solicitud auto-aprobada y creada en Likes · {fiscalId}")
            except HTTPException as e:
                await log_event("order", "warning",
                                f"Auto-aprobación no completada ({fiscalId}): {getattr(e, 'detail', e)}")


# ------------------------- dunning core (reminders / retries / suspension) -------------------------
async def _billing_success(sub):
    customer = await db.customers.find_one({"fiscalId": sub["fiscalId"]})
    amount = sub.get("billing", {}).get("amount") or sum(p.get("price", 0) for p in sub.get("products", []))
    product = {"productName": sub["products"][0]["productName"], "price": amount}
    inv = await _create_invoice(customer, product, status="paid") if customer else None
    next_charge = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    await db.subscriptions.update_one({"subscriptionId": sub["subscriptionId"]},
        {"$set": {"billing.failedAttempts": 0, "billing.status": "active",
                  "billing.nextChargeDate": next_charge, "billing.remindersSent": []}})
    # reactivar líneas suspendidas por impago
    await db.lines.update_many({"fiscalId": sub["fiscalId"], "suspendReason": "non_payment"},
                              {"$set": {"status": "ACTIVE"}, "$unset": {"suspendReason": ""}})
    name = f"{customer.get('name','')} {customer.get('firstSurname','')}".strip() if customer else sub["fiscalId"]
    await log_event("billing", "success", f"Cobro correcto · {name} · {amount:.2f} €",
                    {"fiscalId": sub["fiscalId"]})
    return {"ok": True}


async def _billing_failed(sub):
    settings = await get_app_settings()
    max_failed = int(settings.get("maxFailed") or BILLING_MAX_FAILED)
    attempts = (sub.get("billing", {}).get("failedAttempts", 0)) + 1
    amount = sub.get("billing", {}).get("amount") or sum(p.get("price", 0) for p in sub.get("products", []))
    customer = await db.customers.find_one({"fiscalId": sub["fiscalId"]})
    name = customer.get("name", "") if customer else sub["fiscalId"]
    await db.subscriptions.update_one({"subscriptionId": sub["subscriptionId"]},
        {"$set": {"billing.failedAttempts": attempts, "billing.status": "past_due"}})
    email = customer.get("email") if customer else None
    if attempts >= max_failed:
        await db.lines.update_many({"fiscalId": sub["fiscalId"], "status": {"$ne": "SUSPENDED"}},
                                  {"$set": {"status": "SUSPENDED", "suspendReason": "non_payment"}})
        await log_event("billing", "error",
                        f"⛔ Líneas SUSPENDIDAS por impago · {name} (intento {attempts}/{max_failed})",
                        {"fiscalId": sub["fiscalId"]})
        await _send_mail_safe("email", email, "Tu línea ha sido suspendida · GoRoky",
                              _mail_suspended(name, amount))
    elif attempts == max_failed - 1:
        await log_event("billing", "warning",
                        f"⚠️ Aviso de suspensión enviado · {name} (intento {attempts}/{max_failed})",
                        {"fiscalId": sub["fiscalId"]})
        await _send_mail_safe("email", email, "⚠️ Mañana tu línea será suspendida · GoRoky",
                              _mail_suspension_warning(name, amount))
    else:
        await log_event("billing", "warning",
                        f"Cobro fallido · {name} (intento {attempts}/{max_failed})",
                        {"fiscalId": sub["fiscalId"]})
        await _send_mail_safe("email", email, "No hemos podido cobrar tu cuota · GoRoky",
                              _mail_payment_failed(name, amount, attempts, max_failed))
    return {"ok": True, "attempts": attempts}


@api.post("/billing/simulate/{subscriptionId}")
async def simulate_charge(subscriptionId: str, body: SimulateBody, request: Request):
    """Simula un cobro (para probar reintentos/suspensión/emails sin esperar a SEPA)."""
    await require_admin(request)
    sub = await db.subscriptions.find_one({"subscriptionId": subscriptionId})
    if not sub:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")
    if not sub.get("billing", {}).get("enabled"):
        raise HTTPException(status_code=400, detail="Esta suscripción no tiene cobro recurrente activo")
    if body.outcome == "success":
        return await _billing_success(sub)
    return await _billing_failed(sub)


@api.get("/billing/subscriptions")
async def billing_subscriptions(request: Request):
    await require_admin(request)
    subs = await db.subscriptions.find({"billing.enabled": True}).to_list(1000)
    out = []
    for s in subs:
        cust = await db.customers.find_one({"fiscalId": s["fiscalId"]})
        b = s.get("billing", {})
        out.append({"subscriptionId": s["subscriptionId"], "fiscalId": s["fiscalId"],
                    "customerName": f"{cust.get('name','')} {cust.get('firstSurname','')}".strip() if cust else s["fiscalId"],
                    "productName": s["products"][0]["productName"] if s.get("products") else "",
                    "method": b.get("method"), "last4": b.get("last4"), "amount": b.get("amount"),
                    "status": b.get("status"), "failedAttempts": b.get("failedAttempts", 0),
                    "nextChargeDate": b.get("nextChargeDate")})
    return out


# ------------------------- SIM shipments -------------------------
@api.get("/shipments")
async def list_shipments(request: Request):
    await require_admin(request)
    ships = await db.shipments.find().sort("created", -1).to_list(500)
    return [clean(s) for s in ships]


@api.put("/shipments/{shipment_id}")
async def update_shipment(shipment_id: str, body: ShipmentUpdate, request: Request):
    await require_admin(request)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    r = await db.shipments.update_one({"shipmentId": shipment_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Envío no encontrado")
    ship = await db.shipments.find_one({"shipmentId": shipment_id})
    if body.status == "SHIPPED":
        cust = await db.customers.find_one({"fiscalId": ship["fiscalId"]})
        await _send_mail_safe("email", cust.get("email") if cust else None,
            "Tu SIM está en camino · GoRoky",
            emailer.base_template("Tu SIM ya ha sido enviada",
                f"Hola {ship.get('customerName','')},<br><br>Tu tarjeta SIM para la línea "
                f"<b>{ship.get('lineNumber')}</b> ya ha sido enviada.<br><br>"
                + (f"Transportista: <b>{ship.get('carrier','')}</b><br>Seguimiento: <b>{ship.get('tracking','')}</b><br>" if ship.get('tracking') else "")
                + "<br>La recibirás en breve."))
        await log_event("order", "info", f"SIM enviada · línea {ship.get('lineNumber')}")
    return clean(ship)


# ------------------------- scheduler jobs -------------------------
_likes_last_live = None


async def likes_health_job():
    global _likes_last_live
    likes_client.get_token()
    live = likes_client.CONNECTION_STATE["live"]
    if live == _likes_last_live:
        return
    _likes_last_live = live
    if live:
        await log_event("likes", "success", "Conexión con Likes Telecom restablecida (datos reales)")
    else:
        # evitar duplicados: no repetir si ya hay un error de Likes en los últimos 60 min
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=60)).isoformat()
        recent = await db.system_events.find_one(
            {"source": "likes", "level": "error", "created_at": {"$gte": cutoff}})
        if not recent:
            await log_event("likes", "error",
                f"Sin conexión con Likes Telecom: {likes_client.CONNECTION_STATE['last_error']}",
                {"hint": "Autoriza la IP de salida en Likes Telecom"})


async def likes_reconcile_job():
    if not likes_client.get_token():
        return
    try:
        res = await likes_reconcile.reconcile_all(db)
        if res.get("reconciled"):
            await log_event("likes", "success", f"Reconciliación Likes: {res.get('totals')}")
    except Exception as e:  # noqa
        logger.warning("likes_reconcile_job failed: %s", e)



async def billing_daily_job():
    settings = await get_app_settings()
    await _stripe_apply()
    reminder_days = settings.get("reminderDays") or BILLING_REMINDER_DAYS
    today = datetime.now(timezone.utc).date()
    subs = await db.subscriptions.find({"billing.enabled": True}).to_list(2000)
    for sub in subs:
        b = sub.get("billing", {})
        ncd = b.get("nextChargeDate")
        if not ncd:
            continue
        try:
            due = datetime.fromisoformat(ncd).date()
        except Exception:
            continue
        days = (due - today).days
        sent = b.get("remindersSent", [])
        if days in reminder_days and days not in sent:
            customer = await db.customers.find_one({"fiscalId": sub["fiscalId"]})
            amount = b.get("amount") or sum(p.get("price", 0) for p in sub.get("products", []))
            if customer:
                await _send_mail_safe("email", customer.get("email"),
                    f"Recordatorio de pago · GoRoky",
                    _mail_payment_reminder(customer.get("name", ""), amount, days,
                                           _period_label(datetime.now(timezone.utc))))
            await db.subscriptions.update_one({"subscriptionId": sub["subscriptionId"]},
                {"$push": {"billing.remindersSent": days}})
            await log_event("billing", "info",
                f"Recordatorio de pago ({days} días) enviado · {sub['fiscalId']}")

    # alertas de consumo de datos (80% / 100%)
    lines = await db.lines.find({"family": "Mobile", "status": "ACTIVE", "totalGB": {"$gt": 0}}).to_list(5000)
    for l in lines:
        pct = round((l.get("usedGB", 0) / l["totalGB"]) * 100) if l["totalGB"] else 0
        sent = l.get("usageAlertsSent", [])
        customer = None
        for threshold in (80, 100):
            if pct >= threshold and threshold not in sent:
                customer = customer or await db.customers.find_one({"fiscalId": l["fiscalId"]})
                if customer:
                    msg = ("Has consumido todos tus datos" if threshold == 100
                           else f"Has consumido el {threshold}% de tus datos")
                    await _send_mail_safe("email", customer.get("email"),
                        f"Aviso de consumo · línea {l['lineNumber']}",
                        emailer.base_template("Aviso de consumo de datos",
                            f"Hola {customer.get('name','')},<br><br>{msg} de la línea "
                            f"<b>{l['lineNumber']}</b> ({l.get('usedGB')}GB de {l['totalGB']}GB).<br><br>"
                            + ("Puedes contratar un bono de datos para seguir navegando." if threshold == 100 else "")))
                await db.lines.update_one({"lineNumber": l["lineNumber"]},
                                          {"$push": {"usageAlertsSent": threshold}})
                await log_event("billing", "info",
                    f"Alerta de consumo {threshold}% enviada · línea {l['lineNumber']}")


@api.post("/billing/run-cycle")
async def run_billing_cycle(request: Request):
    await require_admin(request)
    await billing_daily_job()
    await likes_health_job()
    return {"ok": True}


# ------------------------- promotions (banners / popups / offers) -------------------------
def _promo_out(p):
    d = clean(p)
    d["dismissedBy"] = p.get("dismissedBy", [])
    return d


async def _resolve_promo_image(body: PromotionBody, owner="admin"):
    if body.imageData and body.imageData.startswith("data:"):
        fid = await _save_file("promo", body.imageData, owner)
        return f"/api/public/promo-image/{fid}"
    return body.imageUrl or ""


@api.post("/promotions")
async def create_promotion(body: PromotionBody, request: Request):
    await require_admin(request)
    image = await _resolve_promo_image(body)
    doc = {"promoId": str(uuid.uuid4().int)[:10], "title": body.title, "subtitle": body.subtitle,
           "imageUrl": image, "ctaText": body.ctaText, "ctaLink": body.ctaLink,
           "placement": body.placement, "audience": body.audience,
           "audienceFiscalIds": body.audienceFiscalIds or [], "audienceService": body.audienceService,
           "priceBadge": body.priceBadge, "active": body.active,
           "dismissedBy": [], "created": now_iso()}
    await db.promotions.insert_one(doc)
    await log_event("system", "info", f"Promoción creada: «{body.title}» ({body.placement})")
    return _promo_out(doc)


@api.get("/promotions")
async def list_promotions(request: Request):
    await require_admin(request)
    promos = await db.promotions.find().sort("created", -1).to_list(500)
    return [_promo_out(p) for p in promos]


@api.put("/promotions/{promo_id}")
async def update_promotion(promo_id: str, body: PromotionBody, request: Request):
    await require_admin(request)
    image = await _resolve_promo_image(body)
    updates = {"title": body.title, "subtitle": body.subtitle, "imageUrl": image,
               "ctaText": body.ctaText, "ctaLink": body.ctaLink, "placement": body.placement,
               "audience": body.audience, "audienceFiscalIds": body.audienceFiscalIds or [],
               "audienceService": body.audienceService, "priceBadge": body.priceBadge,
               "active": body.active}
    r = await db.promotions.update_one({"promoId": promo_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Promoción no encontrada")
    p = await db.promotions.find_one({"promoId": promo_id})
    return _promo_out(p)


@api.delete("/promotions/{promo_id}")
async def delete_promotion(promo_id: str, request: Request):
    await require_admin(request)
    await db.promotions.delete_one({"promoId": promo_id})
    return {"ok": True}


@api.get("/public/promo-image/{file_id}")
async def public_promo_image(file_id: str):
    try:
        f = await db.files.find_one({"_id": _OID(file_id)})
    except Exception:
        f = None
    # Seguridad: este endpoint es público, solo puede servir imágenes de promociones.
    # Nunca documentos KYC (DNI/selfie/firma) ni otros ficheros sensibles.
    if not f or f.get("kind") != "promo":
        raise HTTPException(status_code=404, detail="Imagen no encontrada")
    data_url = f["dataUrl"]
    if isinstance(data_url, str) and data_url.startswith("data:"):
        header, b64 = data_url.split(",", 1)
        mime = header.split(";")[0].replace("data:", "") or "image/jpeg"
        return StreamingResponse(io.BytesIO(base64.b64decode(b64)), media_type=mime)
    return {"dataUrl": data_url}


@api.get("/me/promotions")
async def my_promotions(request: Request):
    user = await current_user(request)
    fiscalId = user.get("fiscalId")
    lines = await db.lines.find({"fiscalId": fiscalId}).to_list(100) if fiscalId else []
    services = {l.get("family") for l in lines}
    promos = await db.promotions.find({"active": True}).sort("created", -1).to_list(500)
    out = {"banner": [], "popup": [], "offer": []}
    for p in promos:
        aud = p.get("audience", "all")
        if aud == "specific" and fiscalId not in (p.get("audienceFiscalIds") or []):
            continue
        if aud == "service" and p.get("audienceService") not in services:
            continue
        placement = p.get("placement", "banner")
        if placement == "popup" and fiscalId in (p.get("dismissedBy") or []):
            continue
        if placement in out:
            out[placement].append(_promo_out(p))
    return out


@api.post("/me/promotions/{promo_id}/dismiss")
async def dismiss_promotion(promo_id: str, request: Request):
    user = await current_user(request)
    fiscalId = user.get("fiscalId")
    await db.promotions.update_one({"promoId": promo_id}, {"$addToSet": {"dismissedBy": fiscalId}})
    return {"ok": True}


# ------------------------- RBAC (roles y permisos) -------------------------
ALL_PERMISSIONS = [
    "dashboard.view", "alerts.view", "solicitudes.manage", "customers.view", "customers.edit",
    "lines.view", "lines.support", "lines.activate", "docs.upload", "tariffs.manage",
    "catalog.view", "orders.manage", "billing.manage", "installations.manage",
    "portabilities.manage", "shipments.manage", "promotions.manage", "invoices.view",
    "resources.view", "tickets.manage", "settings.manage", "users.manage", "commissions.view",
]
DEFAULT_ROLE_PERMS = {
    "admin": list(ALL_PERMISSIONS),
    "agent": ["dashboard.view", "alerts.view", "customers.view", "customers.edit", "lines.view",
              "lines.support", "tickets.manage", "invoices.view", "catalog.view"],
    "reseller": ["dashboard.view", "solicitudes.manage", "customers.view", "customers.edit",
                 "lines.view", "lines.activate", "docs.upload", "orders.manage", "catalog.view",
                 "invoices.view", "commissions.view"],
    "client": [],
}


async def seed_roles(db):
    for role, perms in DEFAULT_ROLE_PERMS.items():
        if not await db.role_permissions.find_one({"_id": role}):
            await db.role_permissions.insert_one({"_id": role, "permissions": perms})


async def get_role_perms(role):
    doc = await db.role_permissions.find_one({"_id": role})
    return set(doc["permissions"]) if doc else set(DEFAULT_ROLE_PERMS.get(role, []))


async def require_perm(request, perm):
    user = await current_user(request)
    if user.get("role") == "admin":
        return user
    perms = await get_role_perms(user.get("role"))
    if perm not in perms:
        raise HTTPException(status_code=403, detail="No tienes permiso para esta acción")
    return user


def _scope(user):
    """Filtro de datos: revendedor solo ve lo suyo."""
    if user.get("role") == "reseller":
        return {"ownerId": str(user["_id"])}
    return {}


@api.get("/access/me")
async def access_me(request: Request):
    user = await current_user(request)
    perms = list(ALL_PERMISSIONS) if user.get("role") == "admin" else list(await get_role_perms(user.get("role")))
    return {"role": user.get("role"), "permissions": perms,
            "commissionPerSim": user.get("commissionPerSim", 0), "name": user.get("name")}


@api.get("/roles")
async def list_roles(request: Request):
    await require_perm(request, "users.manage")
    roles = {}
    for r in ["admin", "agent", "reseller", "client"]:
        roles[r] = list(await get_role_perms(r))
    return {"allPermissions": ALL_PERMISSIONS, "roles": roles}


@api.put("/roles/{role}")
async def update_role(role: str, body: dict, request: Request):
    await require_perm(request, "users.manage")
    if role == "admin":
        raise HTTPException(status_code=400, detail="El rol Administrador no se puede modificar")
    perms = [p for p in (body.get("permissions") or []) if p in ALL_PERMISSIONS]
    await db.role_permissions.update_one({"_id": role}, {"$set": {"permissions": perms}}, upsert=True)
    return {"role": role, "permissions": perms}


class StaffCreate(BaseModel):
    email: str
    name: str
    password: str
    role: str
    commissionPerSim: Optional[float] = 0


class StaffUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    commissionPerSim: Optional[float] = None
    active: Optional[bool] = None
    password: Optional[str] = None


@api.get("/users")
async def list_users(request: Request):
    await require_perm(request, "users.manage")
    users = await db.users.find({"role": {"$in": ["admin", "agent", "reseller"]}}).to_list(500)
    return [{"id": str(u["_id"]), "email": u["email"], "name": u.get("name"), "role": u.get("role"),
             "commissionPerSim": u.get("commissionPerSim", 0), "active": u.get("active", True),
             "created_at": u.get("created_at")} for u in users]


@api.post("/users")
async def create_user(body: StaffCreate, request: Request):
    await require_perm(request, "users.manage")
    if body.role not in ["admin", "agent", "reseller"]:
        raise HTTPException(status_code=400, detail="Rol no válido")
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Este email ya existe")
    doc = {"email": email, "password_hash": hash_password(body.password), "name": body.name,
           "role": body.role, "fiscalId": None, "commissionPerSim": body.commissionPerSim or 0,
           "active": True, "created_at": now_iso()}
    res = await db.users.insert_one(doc)
    await log_event("system", "info", f"Usuario staff creado: {body.name} ({body.role})")
    return {"id": str(res.inserted_id), "email": email, "name": body.name, "role": body.role}


@api.put("/users/{user_id}")
async def update_user(user_id: str, body: StaffUpdate, request: Request):
    await require_perm(request, "users.manage")
    updates = {}
    for k in ["name", "role", "commissionPerSim", "active"]:
        v = getattr(body, k)
        if v is not None:
            updates[k] = v
    if body.password:
        updates["password_hash"] = hash_password(body.password)
    await db.users.update_one({"_id": _OID(user_id)}, {"$set": updates})
    return {"ok": True}


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, request: Request):
    await require_perm(request, "users.manage")
    await db.users.delete_one({"_id": _OID(user_id), "role": {"$ne": "admin"}})
    return {"ok": True}


# ------------------------- comisiones de revendedores -------------------------
@api.get("/commissions")
async def list_commissions(request: Request):
    user = await require_perm(request, "commissions.view")
    q = {} if user.get("role") == "admin" else {"resellerId": str(user["_id"])}
    comms = await db.commissions.find(q).sort("created", -1).to_list(1000)
    total = sum(c.get("amount", 0) for c in comms)
    return {"total": round(total, 2), "count": len(comms), "commissions": [clean(c) for c in comms]}


# ------------------------- settings & email -------------------------
@api.get("/settings")
async def get_settings(request: Request):
    await require_admin(request)
    cfg = await get_app_settings()
    stripe_key = (cfg.get("stripeSecretKey") or "").strip() or os.environ.get("STRIPE_SECRET_KEY", "")
    stripe_mode = cfg.get("stripeMode") or ("live" if stripe_key.startswith("sk_live") else "test")
    return {
        "issuer": {"brand": "GOROKY", "legal": "TRAMILEX GLOBAL SERVICE SL",
                   "cif": "B21796925", "address": "Calle cortina del muelle otr 11, 29015 MALAGA (Málaga)"},
        "likes": {"live": likes_client.CONNECTION_STATE["live"], "error": likes_client.CONNECTION_STATE["last_error"]},
        "emailConfigured": emailer.is_configured(),
        "senderEmail": os.environ.get("SENDER_EMAIL", ""),
        "stripeMode": stripe_mode,
        "stripeConfigured": bool(stripe_key),
        "stripePublishableKey": cfg.get("stripePublishableKey") or "",
        "stripeWebhookConfigured": bool((cfg.get("stripeWebhookSecret") or "").strip() or os.environ.get("STRIPE_WEBHOOK_SECRET", "")),
    }


@api.post("/email/test")
async def email_test(body: EmailTest, request: Request):
    await require_admin(request)
    if not emailer.is_configured():
        raise HTTPException(status_code=400, detail="Email no configurado. Añade tu RESEND_API_KEY.")
    html = emailer.base_template("Email de prueba",
        "Este es un correo de prueba enviado desde tu CRM Goroky Telecom. "
        "Si lo recibes, la integracion de email funciona correctamente.")
    try:
        res = await emailer.send_email(body.email, "Prueba de email - Goroky Telecom", html)
        return {"ok": True, "id": res.get("id") if isinstance(res, dict) else None}
    except Exception as e:  # noqa
        raise HTTPException(status_code=500, detail=f"Error al enviar: {e}")


@api.post("/invoices/{invoice_id}/email")
async def email_invoice(invoice_id: str, request: Request):
    from bson import ObjectId
    user = await current_user(request)
    if not emailer.is_configured():
        raise HTTPException(status_code=400, detail="Email no configurado. Anade tu RESEND_API_KEY.")
    try:
        inv = await db.invoices.find_one({"_id": ObjectId(invoice_id)})
    except Exception:
        inv = None
    if not inv:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    if user.get("role") == "client" and inv["fiscalId"] != user.get("fiscalId"):
        raise HTTPException(status_code=403, detail="No autorizado")
    to = inv.get("customerEmail")
    if not to:
        raise HTTPException(status_code=400, detail="El cliente no tiene email")
    pdf_bytes = generate_invoice_pdf(inv)
    html = emailer.base_template(
        f"Factura {inv['invoiceNumber']}",
        f"Hola {inv.get('customerName', '')},<br><br>Adjuntamos tu factura <b>{inv['invoiceNumber']}</b> "
        f"por importe de <b>{inv['total']:.2f} EUR</b> correspondiente al periodo {inv.get('period', '')}.<br><br>"
        "Gracias por confiar en Goroky Telecom.")
    try:
        await emailer.send_email(to, f"Tu factura {inv['invoiceNumber']} - Goroky Telecom", html,
                                 attachments=[{"filename": f"{inv['invoiceNumber']}.pdf", "content": list(pdf_bytes)}])
        await db.invoices.update_one({"_id": inv["_id"]}, {"$set": {"emailedAt": now_iso()}})
        return {"ok": True, "to": to}
    except Exception as e:  # noqa
        raise HTTPException(status_code=500, detail=f"Error al enviar: {e}")



# ------------------------- eSIM & acciones de SIM/línea -------------------------
@api.get("/lines/{lineNumber}/esim")
async def get_esim(lineNumber: str, request: Request):
    user = await current_user(request)
    line = await db.lines.find_one({"lineNumber": lineNumber})
    if not line:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    if user.get("role") == "client" and line["fiscalId"] != user.get("fiscalId"):
        raise HTTPException(status_code=403, detail="No autorizado")
    if not line.get("eSim"):
        raise HTTPException(status_code=400, detail="Esta línea no es eSIM")
    return line.get("esimData") or likes_client.esim_data(line["icc"])


@api.post("/lines/{lineNumber}/sim-duplicate")
async def sim_duplicate(lineNumber: str, request: Request):
    await require_admin(request)
    line = await db.lines.find_one({"lineNumber": lineNumber})
    if not line:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    is_esim = bool(line.get("eSim"))
    likes_sync = None
    new_icc = None
    if likes_client.get_token():
        data, err = likes_client.change_sim_remote(
            lineNumber, esim=is_esim, esim_email=line.get("eSimEmail"), reason="Others")
        likes_sync = {"synced": err is None, "error": err}
        if err:
            logger.warning("Likes changeSim %s: %s", lineNumber, err)
        else:
            # tras el cambio, refrescar la SIM real desde Likes
            info = likes_client.get_line_info(lineNumber)
            if info and info.get("icc"):
                new_icc = info["icc"]
    if not new_icc:
        import random
        new_icc = "8934" + str(random.randint(10**15, 10**16 - 1))
    upd = {"icc": new_icc}
    if is_esim:
        upd["esimData"] = likes_client.esim_data(new_icc)
    await db.lines.update_one({"lineNumber": lineNumber}, {"$set": upd})
    return {"ok": True, "icc": new_icc, "likesSync": likes_sync}


@api.put("/lines/{lineNumber}/spn")
async def set_spn(lineNumber: str, body: SpnUpdate, request: Request):
    await require_admin(request)
    r = await db.lines.update_one({"lineNumber": lineNumber}, {"$set": {"spn": body.spn}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    likes_sync = None
    if likes_client.get_token():
        _d, err = likes_client.set_spn_remote(lineNumber, body.spn)
        likes_sync = {"synced": err is None, "error": err}
        if err:
            logger.warning("Likes spn %s: %s", lineNumber, err)
    return {"ok": True, "spn": body.spn, "likesSync": likes_sync}


@api.get("/lines/{lineNumber}/sim")
async def sim_info(lineNumber: str, request: Request):
    user = await current_user(request)
    line = await db.lines.find_one({"lineNumber": lineNumber})
    if not line:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    if user.get("role") == "client" and line["fiscalId"] != user.get("fiscalId"):
        raise HTTPException(status_code=403, detail="No autorizado")
    line = await _refresh_line_live(line)
    icc = line.get("icc") or ""
    p = line.get("pins") or {"pin": "3736", "puk": "08792901", "pin2": "5678", "puk2": "12345678"}
    imsi = line.get("imsi") or ("21407" + icc[-10:] if icc else "")
    return {"icc": icc, "imsi": imsi, "pin": p.get("pin"), "pin2": p.get("pin2", ""),
            "puk": p.get("puk"), "puk2": p.get("puk2", ""), "eSim": line.get("eSim", False),
            "spn": line.get("spn", "GOROKY")}


@api.put("/lines/{lineNumber}/credit-limit")
async def set_credit_limit(lineNumber: str, body: CreditLimitBody, request: Request):
    await require_admin(request)
    r = await db.lines.update_one({"lineNumber": lineNumber},
                                  {"$set": {"creditLimit": body.creditLimit, "spendLimit": body.creditLimit}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    likes_sync = None
    if likes_client.get_token():
        _d, err = likes_client.set_credit_limit_remote(lineNumber, body.creditLimit)
        likes_sync = {"synced": err is None, "error": err}
        if err:
            logger.warning("Likes credit-limit %s: %s", lineNumber, err)
    return {"ok": True, "creditLimit": body.creditLimit, "likesSync": likes_sync}


# ------------------------- suscripciones avanzadas -------------------------
@api.post("/subscriptions/change-titular")
async def change_titular(body: ChangeTitular, request: Request):
    await require_admin(request)
    sub = await db.subscriptions.find_one({"subscriptionId": body.subscriptionId})
    if not sub:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")
    newc = await db.customers.find_one({"fiscalId": body.newFiscalId})
    if not newc:
        raise HTTPException(status_code=404, detail="Nuevo titular no encontrado")
    line_numbers = [p.get("lineNumber") for p in sub.get("products", []) if p.get("lineNumber")]
    likes_sync = None
    if likes_client.get_token():
        _d, err = likes_client.change_titular_remote(
            [body.subscriptionId], sub.get("fiscalId"), body.newFiscalId)
        likes_sync = {"synced": err is None, "error": err}
        if err:
            logger.warning("Likes changeTitular sub %s: %s", body.subscriptionId, err)
    await db.subscriptions.update_one({"subscriptionId": body.subscriptionId}, {"$set": {"fiscalId": body.newFiscalId}})
    if line_numbers:
        await db.lines.update_many({"lineNumber": {"$in": line_numbers}}, {"$set": {"fiscalId": body.newFiscalId}})
    return {"ok": True, "newFiscalId": body.newFiscalId, "likesSync": likes_sync}


@api.get("/subscriptions/{subscriptionId}/optional-products")
async def compatible_optionals(subscriptionId: str, request: Request):
    await current_user(request)
    sub = await db.subscriptions.find_one({"subscriptionId": subscriptionId})
    if not sub:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")
    fam = sub.get("family")
    opts = await db.tariffs.find({"type": "Optional", "family": fam, "active": True}).to_list(100)
    return [clean(o) for o in opts]


@api.post("/subscriptions/add-optional")
async def add_optional(body: OptionalProductBody, request: Request):
    await require_admin(request)
    sub = await db.subscriptions.find_one({"subscriptionId": body.subscriptionId})
    if not sub:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")
    prod = await _get_tariff(body.productId)
    if not prod:
        raise HTTPException(status_code=400, detail="Producto no válido")
    products = sub.get("products", [])
    if any(p.get("productId") == body.productId for p in products):
        raise HTTPException(status_code=400, detail="El producto ya está en la suscripción")
    products.append({"productId": prod["productId"], "productName": prod["productName"],
                     "family": prod["family"], "type": "Optional", "status": "ACTIVE",
                     "lineNumber": products[0].get("lineNumber") if products else None,
                     "price": prod["price"], "finalPrice": round(prod["price"] * 1.21, 2)})
    ln = products[0].get("lineNumber") if products else None
    likes_sync = None
    if likes_client.get_token():
        likes_pid = prod.get("likesProductId") or prod["productId"]
        _d, err = likes_client.add_optional_remote(
            body.subscriptionId, sub.get("fiscalId"), likes_pid, prod["family"], line_number=ln)
        likes_sync = {"synced": err is None, "error": err}
        if err:
            logger.warning("Likes addOptional %s: %s", body.subscriptionId, err)
    await db.subscriptions.update_one({"subscriptionId": body.subscriptionId}, {"$set": {"products": products}})
    return {"ok": True, "productName": prod["productName"], "likesSync": likes_sync}


@api.post("/subscriptions/terminate-optional")
async def terminate_optional(body: OptionalProductBody, request: Request):
    await require_admin(request)
    sub = await db.subscriptions.find_one({"subscriptionId": body.subscriptionId})
    if not sub:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")
    target = next((p for p in sub.get("products", [])
                   if p.get("productId") == body.productId and p.get("type") == "Optional"), None)
    likes_sync = None
    if target and likes_client.get_token():
        likes_pid = target.get("likesProductId") or body.productId
        _d, err = likes_client.terminate_optional_remote(
            body.subscriptionId, sub.get("fiscalId"), likes_pid,
            target.get("family") or sub.get("family"), line_number=target.get("lineNumber"))
        likes_sync = {"synced": err is None, "error": err}
        if err:
            logger.warning("Likes terminateOptional %s: %s", body.subscriptionId, err)
    products = [p for p in sub.get("products", []) if not (p.get("productId") == body.productId and p.get("type") == "Optional")]
    await db.subscriptions.update_one({"subscriptionId": body.subscriptionId}, {"$set": {"products": products}})
    return {"ok": True, "likesSync": likes_sync}


# ------------------------- instalaciones -------------------------
@api.get("/installations")
async def list_installations(request: Request):
    await require_admin(request)
    items = await db.installations.find().sort("created", -1).to_list(300)
    return [clean(i) for i in items]


@api.get("/installations/{installation_id}")
async def get_installation(installation_id: str, request: Request):
    await require_admin(request)
    inst = await db.installations.find_one({"installationId": installation_id})
    if not inst:
        raise HTTPException(status_code=404, detail="Instalación no encontrada")
    # citas disponibles (mock)
    now = datetime.now(timezone.utc)
    slots = []
    for d in range(1, 6):
        day = now + timedelta(days=d)
        for h in ["09:00-11:00", "11:00-13:00", "16:00-18:00"]:
            slots.append({"date": day.strftime("%Y-%m-%d"), "slot": h})
    inst = clean(inst)
    inst["availableAppointments"] = slots
    return inst


@api.post("/installations/{installation_id}/appointment")
async def set_appointment(installation_id: str, body: dict, request: Request):
    await require_admin(request)
    r = await db.installations.update_one({"installationId": installation_id},
        {"$set": {"appointment": body, "status": "SCHEDULED"}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Instalación no encontrada")
    return {"ok": True, "appointment": body}


@api.post("/installations/{installation_id}/cancel")
async def cancel_installation(installation_id: str, body: CancelBody, request: Request):
    await require_admin(request)
    r = await db.installations.update_one({"installationId": installation_id},
        {"$set": {"status": "CANCELLED", "cancelReason": body.reason}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Instalación no encontrada")
    return {"ok": True}


# ------------------------- portabilidades -------------------------
@api.get("/portabilities")
async def list_portabilities(request: Request):
    await require_admin(request)
    items = await db.portabilities.find().sort("created", -1).to_list(300)
    return [clean(p) for p in items]


@api.post("/portabilities/{portability_id}/cancel")
async def cancel_portability(portability_id: str, body: CancelBody, request: Request):
    await require_admin(request)
    port = await db.portabilities.find_one({"portabilityId": portability_id})
    if not port:
        raise HTTPException(status_code=404, detail="Portabilidad no encontrada")
    if port.get("type") != "IN":
        raise HTTPException(status_code=400, detail="Solo se pueden cancelar portabilidades entrantes")
    await db.portabilities.update_one({"portabilityId": portability_id},
        {"$set": {"status": "CANCELLED", "cancelReason": body.reason}})
    return {"ok": True}


# ------------------------- recursos de marca -------------------------
@api.get("/resources")
async def list_resources(request: Request):
    await require_admin(request)
    return likes_client.get_brand_resources()


@api.get("/resources/download")
async def download_resource(path: str, name: str, request: Request):
    await require_admin(request)
    # En real: GET /getBrandResources devuelve una presigned URL. Mock: CSV generado.
    content = f"# Recurso Goroky (demo)\n# path: {path}\n# archivo: {name}\nfecha,concepto,importe\n2026-06-01,Cuota mayorista,-1250.00\n2026-06-15,Comisiones,340.50\n"
    return StreamingResponse(io.BytesIO(content.encode()), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={name}"})


# ------------------------- documentación del cliente -------------------------
@api.get("/customers/{fiscalId}/documents")
async def list_documents(fiscalId: str, request: Request):
    await require_admin(request)
    docs = await db.customer_documents.find({"fiscalId": fiscalId}).to_list(50)
    return [{"id": str(d["_id"]), "type": d["type"], "filename": d["filename"],
             "uploadedAt": d["uploadedAt"], "source": d.get("source", "manual")} for d in docs]


@api.get("/customers/{fiscalId}/documents/{doc_id}/download")
async def download_customer_document(fiscalId: str, doc_id: str, request: Request):
    await require_admin(request)
    d = await db.customer_documents.find_one({"_id": _OID(doc_id), "fiscalId": fiscalId})
    if not d:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    raw = base64.b64decode(d.get("content") or "")
    fname = d.get("filename", "documento")
    media = "application/pdf" if fname.lower().endswith(".pdf") else "application/octet-stream"
    return StreamingResponse(io.BytesIO(raw), media_type=media,
                             headers={"Content-Disposition": f'inline; filename="{fname}"'})


@api.post("/customers/{fiscalId}/documents")
async def upload_document(fiscalId: str, body: DocUpload, request: Request):
    await require_admin(request)
    cust = await db.customers.find_one({"fiscalId": fiscalId})
    if not cust:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    doc = {"fiscalId": fiscalId, "type": body.type, "filename": body.filename,
           "content": body.contentBase64, "uploadedAt": now_iso()}
    res = await db.customer_documents.insert_one(doc)
    # En real: PUT del binario a la uploadURL devuelta por Likes.
    return {"id": str(res.inserted_id), "type": body.type, "filename": body.filename, "uploadedAt": doc["uploadedAt"]}


@api.post("/coverage/address")
async def coverage_address(body: AddressSearch, request: Request):
    await current_user(request)
    return likes_client.search_address(body.label)


@api.post("/orders/{order_id}/send-tracking")
async def send_order_tracking(order_id: str, request: Request):
    await require_admin(request)
    order = await db.orders.find_one({"orderId": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    cust = await db.customers.find_one({"fiscalId": order["fiscalId"]})
    to = cust.get("email") if cust else None
    if not emailer.is_configured():
        raise HTTPException(status_code=400, detail="Email no configurado. Añade tu RESEND_API_KEY.")
    if not to:
        raise HTTPException(status_code=400, detail="El cliente no tiene email")
    html = emailer.base_template("Seguimiento de tu pedido",
        f"Hola {order.get('customerName', '')},<br><br>Tu pedido de <b>{order.get('productName', '')}</b> "
        f"para la línea <b>{order.get('lineNumber', '')}</b> está en estado <b>{order.get('status', '')}</b>.<br><br>"
        "Te avisaremos de cualquier novedad. Gracias por confiar en Goroky Telecom.")
    await emailer.send_email(to, "Seguimiento de tu pedido - Goroky Telecom", html)
    return {"ok": True, "to": to}


# ------------------------- portal público de contratación -------------------------
import secrets as _secrets
from bson import ObjectId as _OID


async def _save_file(kind, data_url, owner):
    if not data_url:
        return None
    res = await db.files.insert_one({"kind": kind, "dataUrl": data_url,
                                     "owner": owner, "createdAt": now_iso()})
    return str(res.inserted_id)


DEFAULT_SITE_CONTENT = {
    "brandName": "GoRoky",
    "hero": {
        "badge": "Promo portabilidad",
        "title": "Móvil y fibra que se adaptan",
        "titleHighlight": "a ti",
        "subtitle": "Cámbiate a roky móvil y conserva tu número gratis. Tarifas claras, cobertura nacional y alta 100% online en minutos.",
        "ctaPrimary": "Ver tarifas",
        "ctaSecondary": "Comprobar fibra",
    },
    "plans": {
        "eyebrow": "Tarifas GoRoky",
        "title": "Elige tu tarifa y contrata en minutos",
    },
    "coverage": {
        "eyebrow": "Fibra óptica",
        "title": "¿Llega la fibra a tu casa?",
        "description": "Comprueba la cobertura real de fibra en tu dirección antes de contratar. Disponible en las principales ciudades de España.",
    },
    "trust": [
        {"icon": "Repeat", "title": "Portabilidad gratis", "desc": "Conserva tu número sin coste ni cortes."},
        {"icon": "Zap", "title": "Alta 100% online", "desc": "Firma digital y activación en minutos."},
        {"icon": "Smartphone", "title": "App GoRoky", "desc": "Controla tu consumo y facturas desde el móvil."},
        {"icon": "Headphones", "title": "Atención cercana", "desc": "Soporte real, sin robots que no resuelven."},
    ],
    "cities": ["Madrid", "Barcelona", "Valencia", "Alicante", "Granada", "Málaga",
               "Fuengirola", "Benidorm", "Marbella", "Cádiz", "Cáceres", "Segovia", "Tarancón", "Cuenca"],
    "footer": {
        "description": "GoRoky (soyroky · roky móvil) es tu operador de móvil y fibra. Portabilidad gratis y alta 100% online con cobertura en las principales ciudades de España.",
        "company": "TRAMILEX GLOBAL SERVICE SL · B21796925",
    },
}


async def get_site_content():
    doc = await db.site_content.find_one({"_id": "home"})
    if not doc:
        return dict(DEFAULT_SITE_CONTENT)
    doc.pop("_id", None)
    # merge superficial con defaults para nuevas claves
    merged = dict(DEFAULT_SITE_CONTENT)
    merged.update(doc)
    return merged


class SiteContentBody(BaseModel):
    content: dict


@api.get("/public/site-content")
async def public_site_content():
    return await get_site_content()


@api.get("/admin/site-content")
async def admin_site_content_get(request: Request):
    await require_admin(request)
    return await get_site_content()


@api.put("/admin/site-content")
async def admin_site_content_put(body: SiteContentBody, request: Request):
    await require_admin(request)
    await db.site_content.update_one({"_id": "home"}, {"$set": body.content}, upsert=True)
    await log_event("system", "info", "Contenido de la web pública actualizado")
    return await get_site_content()


@api.get("/public/catalog")
async def public_catalog():
    items = await db.tariffs.find({"active": True, "type": "Main"}).sort("price", 1).to_list(500)
    out = {"Mobile": [], "Fiber": [], "Satellite": [], "TV": []}
    for t in items:
        fam = t.get("family")
        if fam in out:
            out[fam].append(clean(t))
    return out


@api.get("/public/products/{product_id}")
async def public_product(product_id: str):
    t = await db.tariffs.find_one({"productId": product_id, "active": True})
    if not t:
        raise HTTPException(status_code=404, detail="Producto no disponible")
    return clean(t)


@api.post("/public/applications")
async def create_application(body: ApplicationCreate):
    if not body.acceptedTerms:
        raise HTTPException(status_code=400, detail="Debes aceptar los términos y condiciones")
    product = await _get_tariff(body.productId)
    if not product:
        raise HTTPException(status_code=400, detail="Producto no válido")
    if not (body.province or "").strip():
        raise HTTPException(status_code=400, detail="La provincia es obligatoria")
    is_port = body.lineType in ("portability", "portability_prepaid")
    if is_port and (not body.donorOperatorId or not body.portMsisdn):
        raise HTTPException(status_code=400, detail="Para portar tu número indica el operador actual y el número a portar")
    token = _secrets.token_urlsafe(24)
    contract_code = "GRK-" + _secrets.token_hex(4).upper()
    front = await _save_file("doc_front", body.docFront, body.fiscalId)
    back = await _save_file("doc_back", body.docBack, body.fiscalId)
    selfie = await _save_file("selfie", body.selfie, body.fiscalId)
    doc = {
        "token": token, "contractCode": contract_code, "status": "PENDING_SIGN",
        "productId": product["productId"], "productName": product["productName"],
        "family": product["family"], "price": product["price"],
        "docType": body.docType, "fiscalId": body.fiscalId, "name": body.name,
        "firstSurname": body.firstSurname, "lastSurname": body.lastSurname, "dob": body.dob,
        "address": body.address, "city": body.city, "postalCode": body.postalCode,
        "province": body.province, "iban": body.iban, "bank": body.bank,
        "contactPhone": body.contactPhone, "email": body.email.lower(),
        "acceptedTerms": True, "fileIds": {"front": front, "back": back, "selfie": selfie},
        "paymentMethod": body.paymentMethod, "simType": body.simType, "simIcc": body.simIcc,
        "lineType": body.lineType, "portability": is_port,
        "portabilityType": ("prepaid" if body.lineType == "portability_prepaid" else "postpaid") if is_port else None,
        "donorOperatorId": body.donorOperatorId if is_port else None,
        "portMsisdn": body.portMsisdn if is_port else None,
        "portIcc": body.portIcc if is_port else None,
        "currentHolderName": body.currentHolderName if is_port else None,
        "currentHolderFiscalId": body.currentHolderFiscalId if is_port else None,
        "changeHolder": bool(body.changeHolder) if is_port else False,
        "paymentStatus": "pending", "reviewStatus": "PENDING_REVIEW",
        "createdAt": now_iso(),
    }
    await db.applications.insert_one(doc)
    if emailer.is_configured():
        try:
            link = f"{os.environ.get('FRONTEND_URL', '')}/firmar/{token}"
            html = emailer.base_template("Firma tu contrato",
                f"Hola {body.name},<br><br>Gracias por contratar <b>{product['productName']}</b>. "
                f"Para completar el alta, firma tu contrato (código <b>{contract_code}</b>) aquí:<br><br>"
                f"<a href='{link}' style='background:#0033ff;color:#fff;padding:10px 18px;border-radius:20px;text-decoration:none'>Firmar contrato</a>")
            await emailer.send_email(body.email, "Firma tu contrato - Goroky Telecom", html)
        except Exception:
            pass
    return {"token": token, "contractCode": contract_code, "signUrl": f"/firmar/{token}"}


def _app_public_view(app_doc):
    return {"token": app_doc["token"], "contractCode": app_doc["contractCode"],
            "status": app_doc["status"], "productName": app_doc["productName"],
            "family": app_doc["family"], "price": app_doc["price"],
            "name": app_doc["name"], "fiscalId": app_doc["fiscalId"],
            "address": app_doc["address"], "city": app_doc["city"],
            "email": app_doc["email"], "signerName": app_doc.get("signerName"),
            "paymentMethod": app_doc.get("paymentMethod", "sepa"),
            "simType": app_doc.get("simType", "esim"),
            "lineType": app_doc.get("lineType", "new"),
            "portability": bool(app_doc.get("portability")),
            "portMsisdn": app_doc.get("portMsisdn"),
            "donorOperatorId": app_doc.get("donorOperatorId"),
            "paymentStatus": app_doc.get("paymentStatus", "pending"),
            "reviewStatus": app_doc.get("reviewStatus", "PENDING_REVIEW"),
            "rejectReason": app_doc.get("rejectReason", ""),
            "rejectLabel": app_doc.get("rejectLabel", ""),
            "rejectCategory": app_doc.get("rejectCategory", ""),
            "contactPhone": app_doc.get("contactPhone", ""),
            "iban": app_doc.get("iban", ""),
            "docs": {"front": bool((app_doc.get("fileIds") or {}).get("front")),
                     "back": bool((app_doc.get("fileIds") or {}).get("back")),
                     "selfie": bool((app_doc.get("fileIds") or {}).get("selfie"))}}


@api.post("/public/applications/{token}/resubmit")
async def resubmit_application(token: str, body: ResubmitBody):
    a = await db.applications.find_one({"token": token})
    if not a:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if a.get("reviewStatus") not in ("CHANGES_REQUESTED", "REJECTED"):
        raise HTTPException(status_code=400, detail="Esta solicitud no requiere correcciones")
    file_ids = dict(a.get("fileIds") or {})
    if body.docFront:
        file_ids["front"] = await _save_file("doc_front", body.docFront, a["fiscalId"])
    if body.docBack:
        file_ids["back"] = await _save_file("doc_back", body.docBack, a["fiscalId"])
    if body.selfie:
        file_ids["selfie"] = await _save_file("selfie", body.selfie, a["fiscalId"])
    upd = {"fileIds": file_ids, "reviewStatus": "PENDING_REVIEW", "resubmittedAt": now_iso()}
    if body.iban:
        upd["iban"] = body.iban
    if body.contactPhone:
        upd["contactPhone"] = body.contactPhone
    if body.email:
        upd["email"] = body.email.lower()
    await db.applications.update_one({"token": token},
        {"$set": upd, "$unset": {"rejectReason": "", "rejectCategory": "", "rejectLabel": ""}})
    await db.customers.update_one({"fiscalId": a["fiscalId"]}, {"$set": {"kyc.fileIds": file_ids}})
    order = await db.orders.find_one({"contractNumber": a.get("contractCode")})
    if order:
        await db.orders.update_one({"orderId": order["orderId"]}, {"$set": {"status": "PENDING_REVIEW"}})
    await log_event("order", "info",
                    f"Cliente reenvió documentación corregida · {a.get('name')} ({a.get('fiscalId')})")
    return {"ok": True, "reviewStatus": "PENDING_REVIEW"}


@api.get("/public/applications/{token}")
async def get_application(token: str):
    app_doc = await db.applications.find_one({"token": token})
    if not app_doc:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    return _app_public_view(app_doc)


def _app_to_contract(app_doc):
    is_port = bool(app_doc.get("portability"))
    donor = None
    if is_port and app_doc.get("donorOperatorId"):
        donor = next((d["Name"] for d in likes_client.get_donor_operators()
                      if d.get("Code") == app_doc["donorOperatorId"]), app_doc["donorOperatorId"])
    return {
        "contractNumber": app_doc["contractCode"], "date": app_doc.get("signedAt") or app_doc["createdAt"],
        "customerName": f"{app_doc['name']} {app_doc.get('firstSurname', '')}".strip().upper(),
        "fiscalId": app_doc["fiscalId"],
        "customerAddress": f"{app_doc['address']}, {app_doc['postalCode']} {app_doc['city']} ({app_doc.get('province', '')})".strip(),
        "customerEmail": app_doc["email"], "customerPhone": app_doc["contactPhone"],
        "productName": app_doc["productName"], "family": app_doc["family"],
        "lineNumber": app_doc.get("portMsisdn") or app_doc.get("lineNumber", "Pendiente de asignar"),
        "price": app_doc["price"],
        "portability": is_port, "donorOperator": donor,
        "portMsisdn": app_doc.get("portMsisdn"),
        "currentHolderName": app_doc.get("currentHolderName"),
        "currentHolderFiscalId": app_doc.get("currentHolderFiscalId"),
        "changeHolder": app_doc.get("changeHolder", False),
        "signed": app_doc["status"] in ("SIGNED", "COMPLETED"),
        "signerName": app_doc.get("signerName"), "signatureImage": app_doc.get("signatureImage"),
    }


@api.get("/public/applications/{token}/contract.pdf")
async def public_contract_pdf(token: str):
    app_doc = await db.applications.find_one({"token": token})
    if not app_doc:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    tpl = await _get_contract_template()
    pdf_bytes = generate_contract_pdf(_app_to_contract(app_doc), tpl)
    return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf",
                             headers={"Content-Disposition": f"inline; filename={app_doc['contractCode']}.pdf"})


@api.post("/public/applications/{token}/sign")
async def sign_application(token: str, body: SignBody):
    app_doc = await db.applications.find_one({"token": token})
    if not app_doc:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if app_doc["status"] == "COMPLETED":
        return {"ok": True, "contractCode": app_doc["contractCode"], "already": True}
    if not body.signerName and not body.signatureImage:
        raise HTTPException(status_code=400, detail="Debes firmar o escribir tu nombre")
    sig_id = await _save_file("signature", body.signatureImage, app_doc["fiscalId"]) if body.signatureImage else None

    is_mobile = app_doc["family"] == "Mobile"
    sim_type = app_doc.get("simType", "esim")
    is_esim = is_mobile and sim_type == "esim"
    is_port = bool(app_doc.get("portability"))
    port_msisdn = app_doc.get("portMsisdn")
    # NO se inventa número de línea: en portabilidad se usa el número real a portar;
    # en alta nueva lo asigna Likes al aprobar el alta. Nada de datos ficticios.
    line_number = port_msisdn if (is_port and port_msisdn) else None
    product = await _get_tariff(app_doc["productId"])

    customer = await db.customers.find_one({"fiscalId": app_doc["fiscalId"]})
    kyc = {"docType": app_doc["docType"], "dob": app_doc.get("dob"),
           "iban": app_doc["iban"], "bank": app_doc.get("bank"),
           "fileIds": app_doc.get("fileIds", {}), "selfieId": app_doc.get("fileIds", {}).get("selfie"),
           "contractCode": app_doc["contractCode"], "signedAt": now_iso(),
           "signatureId": sig_id, "signerName": body.signerName, "applicationToken": token}
    if customer:
        await db.customers.update_one({"fiscalId": app_doc["fiscalId"]}, {"$set": {
            "kyc": kyc, "iban": app_doc["iban"], "contactPhone": app_doc["contactPhone"],
            "email": app_doc["email"],
            "billingAddress": {"street": app_doc["address"], "streetNumber": "",
                               "postalCode": app_doc["postalCode"], "cityName": app_doc["city"],
                               "provinceName": app_doc.get("province", "")}}})
    else:
        await db.customers.insert_one({
            "fiscalId": app_doc["fiscalId"], "customerType": "Residential", "name": app_doc["name"],
            "firstSurname": app_doc.get("firstSurname", ""), "lastSurname": app_doc.get("lastSurname", ""),
            "email": app_doc["email"], "contactPhone": app_doc["contactPhone"],
            "iban": app_doc["iban"], "paymentMethod": "SEPA CORE",
            "billingAddress": {"street": app_doc["address"], "streetNumber": "",
                               "postalCode": app_doc["postalCode"], "cityName": app_doc["city"],
                               "provinceName": app_doc.get("province", "")},
            "kyc": kyc, "created": now_iso()})
    customer = await db.customers.find_one({"fiscalId": app_doc["fiscalId"]})

    invoice = await _create_invoice(customer, product, status="pending")
    donor_name = None
    if is_port and app_doc.get("donorOperatorId"):
        donor_name = next((d["Name"] for d in likes_client.get_donor_operators()
                           if d.get("Code") == app_doc["donorOperatorId"]), app_doc["donorOperatorId"])
    # Orden PENDIENTE DE APROBACIÓN. No se crea línea/SIM ni datos de red: el alta real
    # (nº de línea, ICC, PIN/PUK, SVAs, GB…) se crea y se trae de Likes al aprobar en el CRM.
    await db.orders.insert_one({"orderId": str(uuid.uuid4()), "fiscalId": app_doc["fiscalId"],
             "customerName": f"{app_doc['name']} {app_doc.get('firstSurname', '')}".strip(),
             "status": "PENDING_REVIEW", "channel": "WEB", "price": product["price"],
             "productName": product["productName"], "family": app_doc["family"],
             "productId": product["productId"],
             "lineNumber": line_number, "portability": is_port,
             "donorOperatorId": app_doc.get("donorOperatorId"), "donorOperator": donor_name,
             "portMsisdn": port_msisdn, "portIcc": app_doc.get("portIcc"),
             "simType": sim_type, "eSim": is_esim, "simIcc": app_doc.get("simIcc"),
             "portabilityType": app_doc.get("portabilityType"),
             "currentHolderName": app_doc.get("currentHolderName"),
             "currentHolderFiscalId": app_doc.get("currentHolderFiscalId"),
             "changeHolder": app_doc.get("changeHolder", False),
             "coverage": app_doc.get("coverage"),
             "invoiceNumber": invoice["invoiceNumber"], "invoiceId": str(invoice["_id"]),
             "contractNumber": app_doc["contractCode"], "signed": True, "signedAt": now_iso(),
             "created": now_iso()})

    # Registro de portabilidad (datos reales del solicitante; el estado se espeja de Likes al aprobar)
    if is_port:
        await db.portabilities.insert_one({
            "portabilityId": str(uuid.uuid4().int)[:12], "fiscalId": app_doc["fiscalId"],
            "lineNumber": port_msisdn, "type": "IN", "status": "PENDING_APPROVAL",
            "donorOperatorId": app_doc.get("donorOperatorId"), "donorOperator": donor_name,
            "icc": app_doc.get("portIcc"), "currentHolderName": app_doc.get("currentHolderName"),
            "currentHolderFiscalId": app_doc.get("currentHolderFiscalId"),
            "changeHolder": app_doc.get("changeHolder", False),
            "contractNumber": app_doc["contractCode"], "created": now_iso()})

    await db.applications.update_one({"token": token}, {"$set": {
        "status": "COMPLETED", "signerName": body.signerName, "signatureType": body.signatureType,
        "signatureImage": body.signatureImage, "signatureId": sig_id,
        "signedAt": now_iso(), "lineNumber": line_number}})

    # email: contrato firmado / línea en aprovisionamiento
    if emailer.is_configured():
        try:
            html = emailer.base_template("Tu contrato ha sido firmado",
                f"Hola {app_doc['name']},<br><br>Hemos recibido tu contrato firmado "
                f"(código <b>{app_doc['contractCode']}</b>) para <b>{product['productName']}</b>.<br><br>"
                "Tu línea está ahora en <b>proceso de activación (aprovisionamiento de red)</b>. "
                "Te enviaremos un email en cuanto esté activa.<br><br>Gracias por elegir GoRoky.")
            await emailer.send_email(app_doc["email"], "Contrato firmado - GoRoky Telecom", html)
        except Exception:
            pass

    return {"ok": True, "contractCode": app_doc["contractCode"]}


@api.get("/files/{file_id}")
async def get_file(file_id: str, request: Request):
    await require_admin(request)
    try:
        f = await db.files.find_one({"_id": _OID(file_id)})
    except Exception:
        f = None
    if not f:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    data_url = f["dataUrl"]
    if isinstance(data_url, str) and data_url.startswith("data:"):
        header, b64 = data_url.split(",", 1)
        mime = header.split(";")[0].replace("data:", "") or "image/jpeg"
        return StreamingResponse(io.BytesIO(base64.b64decode(b64)), media_type=mime)
    return {"dataUrl": data_url}


@api.get("/customers/{fiscalId}/kyc")
async def get_kyc(fiscalId: str, request: Request):
    await require_admin(request)
    cust = await db.customers.find_one({"fiscalId": fiscalId})
    if not cust:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    kyc = cust.get("kyc")
    order = await db.orders.find_one({"fiscalId": fiscalId, "contractNumber": {"$exists": True}}, sort=[("created", -1)])
    return {"kyc": kyc, "contractOrderId": order["orderId"] if order else None,
            "contractCode": (kyc or {}).get("contractCode"), "signedAt": (kyc or {}).get("signedAt")}



app.include_router(create_auth_router(db))
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o for o in os.environ.get("CORS_ORIGINS", "*").split(",")] if os.environ.get("CORS_ORIGINS") != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.customers.create_index("fiscalId", unique=True)
    await db.lines.create_index("lineNumber", unique=True)
    try:
        await seed_admin(db)
        await seed_tariffs(db)
        await seed_likes_tramo1(db)
        await seed_demo(db)
        await seed_promotions(db)
        await seed_roles(db)
    except DuplicateKeyError:
        pass
    try:
        await _stripe_apply()
    except Exception as e:  # noqa
        logger.warning("stripe config load failed: %s", e)
    # scheduler: recordatorios de pago + salud de integraciones
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        global scheduler
        scheduler = AsyncIOScheduler(timezone="UTC")
        scheduler.add_job(billing_daily_job, "interval", hours=12, id="billing_daily", replace_existing=True)
        scheduler.add_job(likes_health_job, "interval", minutes=15, id="likes_health", replace_existing=True)
        scheduler.add_job(likes_reconcile_job, "interval", minutes=20, id="likes_reconcile", replace_existing=True)
        scheduler.start()
    except Exception as e:  # noqa
        logger.warning("scheduler start failed: %s", e)
    await likes_health_job()


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ------------------------- demo seed -------------------------
# Tarifa oficial Likes Telecom — TRAMO 1 (0-249 líneas). Precios SIN IVA.
# price = PVPR sin IVA (se guarda como venta CON IVA = pvpr*1.21, editable);
# costPrice = precio de cesión Tramo 1 SIN IVA.
LIKES_TRAMO1 = [
    {"productId": "LK-MOB-30",     "name": "30 GB acumulables + ilimitadas",            "pvpr": 6.95,  "cost": 4.60, "gb": "30 GB acumulables"},
    {"productId": "LK-MOB-60",     "name": "60 GB acumulables + ilimitadas",            "pvpr": 7.95,  "cost": 5.26, "gb": "60 GB acumulables"},
    {"productId": "LK-MOB-80",     "name": "80 GB + ilimitadas",                        "pvpr": 8.95,  "cost": 5.92, "gb": "80 GB"},
    {"productId": "LK-MOB-100",    "name": "100 GB acumulables + ilimitadas",           "pvpr": 9.95,  "cost": 6.58, "gb": "100 GB acumulables"},
    {"productId": "LK-MOB-150",    "name": "150 GB acumulables + ilimitadas",           "pvpr": 10.95, "cost": 7.24, "gb": "150 GB acumulables"},
    {"productId": "LK-MOB-200",    "name": "200 GB acumulables + ilimitadas",           "pvpr": 14.95, "cost": 9.88, "gb": "200 GB acumulables"},
    {"productId": "LK-MOB-400",    "name": "400 GB + ilimitadas",                       "pvpr": 14.95, "cost": 9.88, "gb": "400 GB"},
    {"productId": "LK-MOB-300",    "name": "300 GB acumulables + ilimitadas",           "pvpr": 19.95, "cost": 13.19, "gb": "300 GB acumulables"},
    {"productId": "LK-MOB-600",    "name": "600 GB + ilimitadas",                       "pvpr": 19.95, "cost": 13.19, "gb": "600 GB"},
    {"productId": "LK-MOB-400AC",  "name": "400 GB acumulables + ilimitadas",           "pvpr": 24.95, "cost": 16.50, "gb": "400 GB acumulables"},
    {"productId": "LK-MOB-B2B",    "name": "GB y llamadas ilimitadas (B2B)",            "pvpr": 24.95, "cost": 16.50, "gb": "Datos y llamadas ilimitadas"},
    {"productId": "LK-MOB-80INT",  "name": "80 GB internacional (1.000 min int.)",      "pvpr": 11.95, "cost": 7.90, "gb": "80 GB · 1.000 min internacionales"},
    {"productId": "LK-MOB-150INT", "name": "150 GB internacional (1.000 min int.)",     "pvpr": 14.95, "cost": 9.88, "gb": "150 GB · 1.000 min internacionales"},
    {"productId": "LK-MOB-200INT", "name": "200 GB internacional (1.000 min int.)",     "pvpr": 19.95, "cost": 13.19, "gb": "200 GB · 1.000 min internacionales"},
]


async def seed_likes_tramo1(db):
    """Carga (idempotente) los planes móviles de Likes Telecom con coste del Tramo 1.
    Al importarlos por primera vez, elimina los planes móviles genéricos de demo."""
    if await db.tariffs.find_one({"productId": "LK-MOB-30"}):
        return
    # limpiar planes móviles principales de demo (1411-1414) para dejar el catálogo Likes limpio
    await db.tariffs.delete_many({"productId": {"$in": ["1411", "1412", "1413", "1414"]}})
    for p in LIKES_TRAMO1:
        doc = {
            "productId": p["productId"], "productName": p["name"], "family": "Mobile", "type": "Main",
            "isRecurringPrice": True,
            "pvpr": p["pvpr"],                                   # PVPR recomendado (sin IVA)
            "price": round(p["pvpr"] * 1.21, 2),                # venta CON IVA (editable)
            "costPrice": p["cost"],                             # cesión Tramo 1 SIN IVA
            "marketingText": [{"title": "Datos", "value": p["gb"]},
                              {"title": "Llamadas", "value": "Ilimitadas"}],
            "active": True, "created": now_iso(),
        }
        await db.tariffs.insert_one(doc)
    logger.info("Likes Tramo 1 plans seeded")


async def seed_tariffs(db):
    if await db.tariffs.count_documents({}) > 0:
        return
    for p in likes_client.MOCK_PRODUCTS:
        doc = dict(p)
        doc["active"] = True
        # Estimación editable del precio de cesión (CON IVA) ~65% del PVP
        doc["costPrice"] = round(p["price"] * 0.65, 2)
        doc["created"] = now_iso()
        await db.tariffs.insert_one(doc)
    logger.info("Tariffs seeded")


async def seed_demo(db):
    import random
    if await db.customers.count_documents({}) > 0:
        return
    prods = {p["productId"]: p for p in likes_client.MOCK_PRODUCTS}

    demo = [
        {"fiscalId": "12345678A", "name": "Juan", "firstSurname": "García", "lastSurname": "López",
         "email": "cliente@goroky.com", "phone": "612345678", "type": "Residential",
         "city": "Madrid", "province": "Madrid", "portal_pw": "Cliente2026!",
         "lines": [("1412", "Mobile"), ("1521", "Fiber")]},
        {"fiscalId": "B87654321", "name": "Innova Soluciones SL", "firstSurname": "", "lastSurname": "",
         "email": "admin@innovasoluciones.es", "phone": "911223344", "type": "Society",
         "city": "Barcelona", "province": "Barcelona", "portal_pw": None,
         "lines": [("1414", "Mobile"), ("1414", "Mobile"), ("1522", "Fiber")]},
        {"fiscalId": "45678912C", "name": "María", "firstSurname": "Fernández", "lastSurname": "Ruiz",
         "email": "maria.fernandez@email.com", "phone": "678912345", "type": "Residential",
         "city": "Valencia", "province": "Valencia", "portal_pw": None,
         "lines": [("1411", "Mobile")]},
    ]

    inv_seq = 0
    for d in demo:
        await db.customers.insert_one({
            "fiscalId": d["fiscalId"], "customerType": d["type"], "name": d["name"],
            "firstSurname": d["firstSurname"], "lastSurname": d["lastSurname"],
            "email": d["email"], "contactPhone": d["phone"],
            "billingAddress": {"street": "Calle Mayor", "streetNumber": "10", "postalCode": "28001",
                               "cityName": d["city"], "provinceName": d["province"]},
            "created": now_iso()})
        if d["portal_pw"]:
            if not await db.users.find_one({"email": d["email"].lower()}):
                await db.users.insert_one({"email": d["email"].lower(),
                    "password_hash": hash_password(d["portal_pw"]),
                    "name": f"{d['name']} {d['firstSurname']}".strip(), "role": "client",
                    "fiscalId": d["fiscalId"], "created_at": now_iso()})
        cust = await db.customers.find_one({"fiscalId": d["fiscalId"]})
        ba = cust.get("billingAddress", {})
        address = f"{ba.get('street','')} {ba.get('streetNumber','')}, {ba.get('postalCode','')} {ba.get('cityName','')} ({ba.get('provinceName','')})"
        cust_mobile_lines = []
        for pid, fam in d["lines"]:
            p = prods[pid]
            ln = ("6" if fam == "Mobile" else "9") + str(random.randint(10000000, 99999999))
            micc = "8934" + str(random.randint(10**15, 10**16 - 1))
            is_mob = fam == "Mobile"
            line = {"lineNumber": ln, "fiscalId": d["fiscalId"], "family": fam, "status": "ACTIVE",
                    "productId": pid, "productName": p["productName"], "price": p["price"],
                    "icc": micc, "spn": "GOROKY", "pins": _sim_pins(),
                    "eSim": is_mob, "esimData": likes_client.esim_data(micc) if is_mob else None,
                    "totalGB": 50 if is_mob else 0,
                    "usedGB": round(random.uniform(3, 45), 1) if is_mob else 0,
                    "creditLimit": 30, "svas": [dict(s) for s in likes_client.DEFAULT_SVAS],
                    "cdrs": _gen_cdrs() if is_mob else [], "created": now_iso()}
            await db.lines.insert_one(line)
            if is_mob:
                cust_mobile_lines.append(line)
            else:
                await db.installations.insert_one({
                    "installationId": str(uuid.uuid4().int)[:12], "fiscalId": d["fiscalId"],
                    "customerName": f"{d['name']} {d['firstSurname']}".strip(), "lineNumber": ln,
                    "productName": p["productName"], "status": random.choice(["PENDING_APPOINTMENT", "SCHEDULED", "COMPLETED"]),
                    "address": f"Calle Mayor 10, {d['city']}", "appointment": None, "created": now_iso()})
            await db.subscriptions.insert_one({
                "subscriptionId": str(uuid.uuid4()), "fiscalId": d["fiscalId"], "family": fam,
                "status": "ACTIVE", "pendingChange": False, "created": now_iso(),
                "products": [{"productId": pid, "productName": p["productName"], "family": fam,
                              "type": "Main", "status": "ACTIVE", "lineNumber": ln,
                              "price": p["price"], "finalPrice": round(p["price"] * 1.21, 2)}]})
        # facturas (una pagada, una pendiente)
        consumption = [_line_usage(l) for l in cust_mobile_lines]
        for i, status in enumerate(["paid", "pending"]):
            inv_seq += 1
            p = prods[d["lines"][0][0]]
            subtotal = round(p["price"] / 1.21, 2)
            base = datetime.now(timezone.utc) - timedelta(days=30 * (1 - i))
            await db.invoices.insert_one({
                "invoiceNumber": f"GRK-{datetime.now().year}-{inv_seq:05d}", "fiscalId": d["fiscalId"],
                "customerName": f"{d['name']} {d['firstSurname']}".strip().upper(), "customerEmail": d["email"],
                "customerAddress": address.strip(),
                "items": [{"description": p["productName"], "detail": "Cuota mensual", "quantity": 1, "amount": p["price"]}],
                "subtotal": subtotal, "tax": round(p["price"] - subtotal, 2), "total": p["price"],
                "status": status, "date": base.isoformat(),
                "period": _period_label(base), "dueDate": (base + timedelta(days=30)).isoformat(),
                "paymentMethod": "SEPA CORE" if status == "paid" else "NO",
                "consumption": consumption})
    # portabilidades de ejemplo
    mobs = await db.lines.find({"family": "Mobile"}).to_list(3)
    for idx, m in enumerate(mobs[:2]):
        await db.portabilities.insert_one({
            "portabilityId": str(uuid.uuid4().int)[:12], "fiscalId": m["fiscalId"],
            "customerName": m["fiscalId"], "lineNumber": m["lineNumber"],
            "type": "IN", "donorOperatorId": "003",
            "status": ["IN_PROGRESS", "COMPLETED"][idx % 2], "created": now_iso()})
    await db.counters.update_one({"_id": "invoice"}, {"$set": {"seq": inv_seq}}, upsert=True)

    logger.info("Demo data seeded")


async def seed_promotions(db):
    if await db.promotions.count_documents({}) == 0:
        await db.promotions.insert_many([
            {"promoId": "promo0001", "title": "Tus favoritos, ¡ahora en rebajas!",
             "subtitle": "Móviles, smartwatches y accesorios con hasta -40%.",
             "imageUrl": "https://images.unsplash.com/photo-1662858557337-48c9ecf07ee0?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
             "ctaText": "Ir a la Tienda", "ctaLink": "/contratar", "placement": "banner",
             "audience": "all", "audienceFiscalIds": [], "audienceService": "",
             "priceBadge": "", "active": True, "dismissedBy": [], "created": now_iso()},
            {"promoId": "promo0002", "title": "Fibra 1Gb + Móvil Ilimitado",
             "subtitle": "Todo tu hogar conectado desde 38€/mes.",
             "imageUrl": "https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
             "ctaText": "Lo quiero", "ctaLink": "/contratar", "placement": "offer",
             "audience": "all", "audienceFiscalIds": [], "audienceService": "",
             "priceBadge": "Desde 38€", "active": True, "dismissedBy": [], "created": now_iso()},
            {"promoId": "promo0003", "title": "GoRoky TV incluida",
             "subtitle": "+80 canales y las mejores series.",
             "imageUrl": "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
             "ctaText": "Añadir TV", "ctaLink": "/contratar", "placement": "offer",
             "audience": "all", "audienceFiscalIds": [], "audienceService": "",
             "priceBadge": "-50%", "active": True, "dismissedBy": [], "created": now_iso()},
            {"promoId": "promo0004", "title": "🎁 Regalo de bienvenida",
             "subtitle": "Contrata una segunda línea y llévate 3 meses gratis. ¡Solo esta semana!",
             "imageUrl": "https://images.unsplash.com/photo-1607082349566-187342175e2f?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
             "ctaText": "Aprovechar oferta", "ctaLink": "/contratar", "placement": "popup",
             "audience": "all", "audienceFiscalIds": [], "audienceService": "",
             "priceBadge": "", "active": True, "dismissedBy": [], "created": now_iso()},
        ])

    logger.info("Demo data seeded")
