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
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import stripe
import likes_client
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


class CoverageRequest(BaseModel):
    address: str


# ------------------------- catalog / utility -------------------------
@api.get("/products")
async def products(family: Optional[str] = None, request: Request = None):
    await current_user(request)
    return likes_client.get_products(family)


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
    return {"customer": clean(cust), "lines": [clean(l) for l in lines],
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
    prod = next((p for p in likes_client.get_products() if p["productId"] == body.newProductId), None)
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
    inv = {
        "invoiceNumber": number, "fiscalId": customer["fiscalId"],
        "customerName": f"{customer['name']} {customer.get('firstSurname', '')}".strip(),
        "customerEmail": customer.get("email"),
        "items": [{"description": f"{product['productName']} (alta de servicio)",
                   "quantity": 1, "amount": product["price"]}],
        "subtotal": subtotal, "tax": tax, "total": product["price"],
        "status": status, "date": now_iso(),
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
    product = next((p for p in likes_client.get_products() if p["productId"] == body.productId), None)
    if not product:
        raise HTTPException(status_code=400, detail="Producto no válido")

    order_id = str(uuid.uuid4())
    # crear línea
    line_number = body.lineNumber or ("6" + str(uuid.uuid4().int)[:8] if product["family"] == "Mobile"
                                      else "9" + str(uuid.uuid4().int)[:8])
    line = {
        "lineNumber": line_number, "fiscalId": body.fiscalId, "family": product["family"],
        "status": "ACTIVE", "productId": product["productId"], "productName": product["productName"],
        "price": product["price"], "icc": "8934" + str(uuid.uuid4().int)[:16],
        "eSim": False, "totalGB": 50 if product["family"] == "Mobile" else 0,
        "usedGB": round(__import__("random").uniform(2, 40), 1) if product["family"] == "Mobile" else 0,
        "creditLimit": 30, "svas": [dict(s) for s in likes_client.DEFAULT_SVAS],
        "cdrs": _gen_cdrs() if product["family"] == "Mobile" else [],
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
    return {"order": clean(order), "invoiceId": str(invoice["_id"]),
            "invoiceNumber": invoice["invoiceNumber"]}


def _gen_cdrs():
    import random
    types = [("VOICE", "Llamada nacional"), ("DATA", "Datos"), ("SMS", "SMS")]
    out = []
    for _ in range(8):
        t, dest = random.choice(types)
        out.append({"type": t, "destination": dest,
                    "calledNumber": "6" + str(random.randint(10000000, 99999999)) if t != "DATA" else None,
                    "duration": random.randint(30, 900) if t == "VOICE" else 0,
                    "date": now_iso(), "price": round(random.uniform(0, 0.5), 2),
                    "bytes": random.randint(1000000, 900000000) if t == "DATA" else 0})
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
            "lines": [clean(l) for l in lines], "subscriptions": [clean(s) for s in subs],
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
    await seed_demo(db)


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ------------------------- demo seed -------------------------
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
        for pid, fam in d["lines"]:
            p = prods[pid]
            ln = ("6" if fam == "Mobile" else "9") + str(random.randint(10000000, 99999999))
            line = {"lineNumber": ln, "fiscalId": d["fiscalId"], "family": fam, "status": "ACTIVE",
                    "productId": pid, "productName": p["productName"], "price": p["price"],
                    "icc": "8934" + str(random.randint(10**15, 10**16 - 1)), "eSim": False,
                    "totalGB": 50 if fam == "Mobile" else 0,
                    "usedGB": round(random.uniform(3, 45), 1) if fam == "Mobile" else 0,
                    "creditLimit": 30, "svas": [dict(s) for s in likes_client.DEFAULT_SVAS],
                    "cdrs": _gen_cdrs() if fam == "Mobile" else [], "created": now_iso()}
            await db.lines.insert_one(line)
            await db.subscriptions.insert_one({
                "subscriptionId": str(uuid.uuid4()), "fiscalId": d["fiscalId"], "family": fam,
                "status": "ACTIVE", "pendingChange": False, "created": now_iso(),
                "products": [{"productId": pid, "productName": p["productName"], "family": fam,
                              "type": "Main", "status": "ACTIVE", "lineNumber": ln,
                              "price": p["price"], "finalPrice": round(p["price"] * 1.21, 2)}]})
        # facturas (una pagada, una pendiente)
        for i, status in enumerate(["paid", "pending"]):
            inv_seq += 1
            p = prods[d["lines"][0][0]]
            subtotal = round(p["price"] / 1.21, 2)
            await db.invoices.insert_one({
                "invoiceNumber": f"GRK-{datetime.now().year}-{inv_seq:05d}", "fiscalId": d["fiscalId"],
                "customerName": f"{d['name']} {d['firstSurname']}".strip(), "customerEmail": d["email"],
                "items": [{"description": f"{p['productName']} - cuota mensual", "quantity": 1, "amount": p["price"]}],
                "subtotal": subtotal, "tax": round(p["price"] - subtotal, 2), "total": p["price"],
                "status": status, "date": now_iso()})
    await db.counters.update_one({"_id": "invoice"}, {"$set": {"seq": inv_seq}}, upsert=True)
    logger.info("Demo data seeded")
