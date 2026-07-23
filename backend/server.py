from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
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
import emailer
import base64
from auth import create_auth_router, get_current_user, seed_admin, hash_password, verify_password
from invoices import generate_invoice_pdf

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


async def scope_fiscal(user: dict, fiscalId: Optional[str]) -> Optional[str]:
    """Clients can only access their own fiscalId."""
    if user.get("role") == "client":
        return user.get("fiscalId")
    return fiscalId


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
    price: float
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
           "type": body.type, "price": body.price, "isRecurringPrice": True,
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
           "price": body.price, "active": body.active,
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


@api.get("/ticket-typologies")
async def ticket_typologies(request: Request):
    await current_user(request)
    return likes_client.get_ticket_typologies()


@api.post("/coverage")
async def coverage(body: CoverageRequest, request: Request):
    await current_user(request)
    return likes_client.check_coverage(body.address)


# ------------------------- dashboard -------------------------
@api.get("/dashboard/stats")
async def dashboard_stats(request: Request):
    await require_admin(request)
    customers = await db.customers.count_documents({})
    active_lines = await db.lines.count_documents({"status": "ACTIVE"})
    total_lines = await db.lines.count_documents({})
    open_tickets = await db.tickets.count_documents({"status": {"$ne": "CLOSED"}})
    paid = await db.invoices.find({"status": "paid"}).to_list(1000)
    revenue = round(sum(i["total"] for i in paid), 2)
    pending_inv = await db.invoices.count_documents({"status": "pending"})
    recent_orders = await db.orders.find().sort("created", -1).to_list(6)
    # revenue by family
    lines = await db.lines.find().to_list(2000)
    by_family = {}
    for l in lines:
        by_family[l["family"]] = by_family.get(l["family"], 0) + 1
    return {
        "customers": customers,
        "activeLines": active_lines,
        "totalLines": total_lines,
        "openTickets": open_tickets,
        "revenue": revenue,
        "pendingInvoices": pending_inv,
        "recentOrders": [clean(o) for o in recent_orders],
        "linesByFamily": [{"name": k, "value": v} for k, v in by_family.items()],
        "connection": {"live": likes_client.CONNECTION_STATE["live"],
                       "error": likes_client.CONNECTION_STATE["last_error"]},
    }


# ------------------------- customers -------------------------
@api.get("/customers")
async def list_customers(request: Request, q: Optional[str] = None):
    await require_admin(request)
    query = {}
    if q:
        query = {"$or": [{"name": {"$regex": q, "$options": "i"}},
                         {"fiscalId": {"$regex": q, "$options": "i"}},
                         {"email": {"$regex": q, "$options": "i"}}]}
    customers = await db.customers.find(query).sort("created", -1).to_list(500)
    out = []
    for c in customers:
        c = clean(c)
        c["linesCount"] = await db.lines.count_documents({"fiscalId": c["fiscalId"]})
        out.append(c)
    return out


@api.post("/customers")
async def create_customer(body: CustomerCreate, request: Request):
    await require_admin(request)
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
    await require_admin(request)
    lines = await db.lines.find().sort("created", -1).to_list(1000)
    return [clean(l) for l in lines]


@api.get("/lines/{lineNumber}")
async def get_line(lineNumber: str, request: Request):
    user = await current_user(request)
    line = await db.lines.find_one({"lineNumber": lineNumber})
    if not line:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    if user.get("role") == "client" and line["fiscalId"] != user.get("fiscalId"):
        raise HTTPException(status_code=403, detail="No autorizado")
    return clean(_enrich_line(line))


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
    return {"lineNumber": lineNumber, "status": new_status}


@api.put("/lines/{lineNumber}/svas")
async def update_svas(lineNumber: str, body: SvaUpdate, request: Request):
    user = await current_user(request)
    line = await db.lines.find_one({"lineNumber": lineNumber})
    if not line:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    if user.get("role") == "client" and line["fiscalId"] != user.get("fiscalId"):
        raise HTTPException(status_code=403, detail="No autorizado")
    svas = line.get("svas", [])
    updates = {s["code"]: s["status"] for s in body.svas}
    for s in svas:
        if s["code"] in updates:
            s["status"] = updates[s["code"]]
    await db.lines.update_one({"lineNumber": lineNumber}, {"$set": {"svas": svas}})
    return {"success": True, "svas": svas}


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
    return {"success": True, "productName": prod["productName"]}


# ------------------------- orders / service creation -------------------------
async def _next_invoice_number():
    counter = await db.counters.find_one_and_update(
        {"_id": "invoice"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    seq = counter["seq"] if counter and "seq" in counter else 1
    return f"GRK-{datetime.now().year}-{seq:05d}"


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
    return inv


@api.get("/orders")
async def list_orders(request: Request):
    await require_admin(request)
    orders = await db.orders.find().sort("created", -1).to_list(500)
    return [clean(o) for o in orders]


@api.post("/orders")
async def create_order(body: OrderCreate, request: Request):
    await require_admin(request)
    customer = await db.customers.find_one({"fiscalId": body.fiscalId})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    product = await _get_tariff(body.productId)
    if not product:
        raise HTTPException(status_code=400, detail="Producto no válido")

    order_id = str(uuid.uuid4())
    # crear línea
    line_number = body.lineNumber or ("6" + str(uuid.uuid4().int)[:8] if product["family"] == "Mobile"
                                      else "9" + str(uuid.uuid4().int)[:8])
    icc = "8934" + str(uuid.uuid4().int)[:16]
    is_mobile = product["family"] == "Mobile"
    line = {
        "lineNumber": line_number, "fiscalId": body.fiscalId, "family": product["family"],
        "status": "ACTIVE", "productId": product["productId"], "productName": product["productName"],
        "price": product["price"], "icc": icc, "spn": "GOROKY",
        "eSim": is_mobile, "esimData": likes_client.esim_data(icc) if is_mobile else None,
        "totalGB": 50 if is_mobile else 0,
        "usedGB": round(__import__("random").uniform(2, 40), 1) if is_mobile else 0,
        "creditLimit": 30, "svas": [dict(s) for s in likes_client.DEFAULT_SVAS],
        "cdrs": _gen_cdrs() if is_mobile else [],
        "created": now_iso(),
    }
    await db.lines.insert_one(line)

    # crear suscripción
    sub_id = str(uuid.uuid4())
    await db.subscriptions.insert_one({
        "subscriptionId": sub_id, "fiscalId": body.fiscalId, "family": product["family"],
        "status": "ACTIVE", "pendingChange": False, "created": now_iso(),
        "products": [{"productId": product["productId"], "productName": product["productName"],
                      "family": product["family"], "type": "Main", "status": "ACTIVE",
                      "lineNumber": line_number, "price": product["price"],
                      "finalPrice": round(product["price"] * 1.21, 2)}],
    })

    # factura PDF (siempre que se crea un servicio)
    invoice = await _create_invoice(customer, product, status="pending")

    order = {
        "orderId": order_id, "fiscalId": body.fiscalId,
        "customerName": f"{customer['name']} {customer.get('firstSurname', '')}".strip(),
        "status": "COMPLETED", "channel": "WD", "price": product["price"],
        "productName": product["productName"], "family": product["family"],
        "lineNumber": line_number, "portability": body.portability,
        "invoiceNumber": invoice["invoiceNumber"], "invoiceId": str(invoice["_id"]),
        "created": now_iso(),
    }
    await db.orders.insert_one(order)

    # instalación (fibra) o portabilidad (si aplica)
    if product["family"] in ("Fiber", "TV"):
        await db.installations.insert_one({
            "installationId": str(uuid.uuid4().int)[:12], "fiscalId": body.fiscalId,
            "customerName": order["customerName"], "lineNumber": line_number,
            "productName": product["productName"], "status": "PENDING_APPOINTMENT",
            "address": (customer.get("billingAddress") or {}).get("street", ""),
            "appointment": None, "created": now_iso()})
    if body.portability:
        await db.portabilities.insert_one({
            "portabilityId": str(uuid.uuid4().int)[:12], "fiscalId": body.fiscalId,
            "customerName": order["customerName"], "lineNumber": line_number,
            "type": "IN", "donorOperatorId": body.donorOperatorId,
            "status": "IN_PROGRESS", "created": now_iso()})

    return {"order": clean(order), "invoiceId": str(invoice["_id"]),
            "invoiceNumber": invoice["invoiceNumber"]}


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
    return {"customer": clean(cust) if cust else None,
            "lines": [clean(_enrich_line(l)) for l in lines], "subscriptions": [clean(s) for s in subs],
            "invoices": [clean(i) for i in invs], "tickets": [clean(t) for t in tickets],
            "monthlyTotal": monthly, "pendingInvoices": pending}


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
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"status": "completed", "payment_status": "paid", "updated_at": now_iso()}})
                if record.get("invoice_id"):
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
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, secret)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature")
    obj, t = event["data"]["object"], event["type"]
    if t == "checkout.session.completed":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
            {"$set": {"status": "completed", "payment_status": obj.get("payment_status", "paid"),
                      "updated_at": now_iso()}})
        inv_id = obj.get("metadata", {}).get("invoice_id")
        if inv_id:
            await db.invoices.update_one({"_id": ObjectId(inv_id)}, {"$set": {"status": "paid"}})
    return {"status": "ok"}


# ------------------------- settings & email -------------------------
@api.get("/settings")
async def get_settings(request: Request):
    await require_admin(request)
    return {
        "issuer": {"brand": "GOROKY", "legal": "TRAMILEX GLOBAL SERVICE SL",
                   "cif": "B21796925", "address": "Calle cortina del muelle otr 11, 29015 MALAGA (Málaga)"},
        "likes": {"live": likes_client.CONNECTION_STATE["live"], "error": likes_client.CONNECTION_STATE["last_error"]},
        "emailConfigured": emailer.is_configured(),
        "senderEmail": os.environ.get("SENDER_EMAIL", ""),
        "stripeMode": os.environ.get("STRIPE_MODE", "test"),
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
    import random
    new_icc = "8934" + str(random.randint(10**15, 10**16 - 1))
    upd = {"icc": new_icc}
    if line.get("eSim"):
        upd["esimData"] = likes_client.esim_data(new_icc)
    await db.lines.update_one({"lineNumber": lineNumber}, {"$set": upd})
    return {"ok": True, "icc": new_icc}


@api.put("/lines/{lineNumber}/spn")
async def set_spn(lineNumber: str, body: SpnUpdate, request: Request):
    await require_admin(request)
    r = await db.lines.update_one({"lineNumber": lineNumber}, {"$set": {"spn": body.spn}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    return {"ok": True, "spn": body.spn}


@api.get("/lines/{lineNumber}/sim")
async def sim_info(lineNumber: str, request: Request):
    user = await current_user(request)
    line = await db.lines.find_one({"lineNumber": lineNumber})
    if not line:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    if user.get("role") == "client" and line["fiscalId"] != user.get("fiscalId"):
        raise HTTPException(status_code=403, detail="No autorizado")
    icc = line["icc"]
    return {"icc": icc, "imsi": "21407" + icc[-10:], "pin": "3736", "pin2": "5678",
            "puk": "08792901", "puk2": "12345678", "eSim": line.get("eSim", False),
            "spn": line.get("spn", "GOROKY")}


@api.put("/lines/{lineNumber}/credit-limit")
async def set_credit_limit(lineNumber: str, body: CreditLimitBody, request: Request):
    await require_admin(request)
    r = await db.lines.update_one({"lineNumber": lineNumber}, {"$set": {"creditLimit": body.creditLimit}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    return {"ok": True, "creditLimit": body.creditLimit}


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
    await db.subscriptions.update_one({"subscriptionId": body.subscriptionId}, {"$set": {"fiscalId": body.newFiscalId}})
    if line_numbers:
        await db.lines.update_many({"lineNumber": {"$in": line_numbers}}, {"$set": {"fiscalId": body.newFiscalId}})
    return {"ok": True, "newFiscalId": body.newFiscalId}


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
    await db.subscriptions.update_one({"subscriptionId": body.subscriptionId}, {"$set": {"products": products}})
    return {"ok": True, "productName": prod["productName"]}


@api.post("/subscriptions/terminate-optional")
async def terminate_optional(body: OptionalProductBody, request: Request):
    await require_admin(request)
    sub = await db.subscriptions.find_one({"subscriptionId": body.subscriptionId})
    if not sub:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")
    products = [p for p in sub.get("products", []) if not (p.get("productId") == body.productId and p.get("type") == "Optional")]
    await db.subscriptions.update_one({"subscriptionId": body.subscriptionId}, {"$set": {"products": products}})
    return {"ok": True}


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
    return [{"id": str(d["_id"]), "type": d["type"], "filename": d["filename"], "uploadedAt": d["uploadedAt"]} for d in docs]


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
    await seed_admin(db)
    await seed_tariffs(db)
    await seed_demo(db)


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ------------------------- demo seed -------------------------
async def seed_tariffs(db):
    if await db.tariffs.count_documents({}) > 0:
        return
    for p in likes_client.MOCK_PRODUCTS:
        doc = dict(p)
        doc["active"] = True
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
                    "icc": micc, "spn": "GOROKY",
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
