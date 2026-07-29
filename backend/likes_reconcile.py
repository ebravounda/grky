"""Motor de reconciliación GoRoky ← Likes Telecom (lectura → espejo local).

Trae de Likes las órdenes, suscripciones, líneas (estado, GB, SVAs, eSIM) y
portabilidades de un cliente y las vuelca en las colecciones locales que alimentan
los paneles, para que GoRoky sea un espejo fiel del estado real de Likes.

Tolerante a fallos: si Likes no está conectado (preview/403) devuelve reconciled=False
sin tocar nada. Validación real en el VPS.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
import likes_client

logger = logging.getLogger(__name__)


def _now():
    return datetime.now(timezone.utc).isoformat()


# Estados de orden en Likes que implican que el contrato YA está firmado (firma digital de Likes
# completada o firma manual con contrato subido). PENDING_CONTRACT_SIGNATURE = aún NO firmado.
SIGNED_ORDER_STATUSES = {
    "SIGNATURE_COMPLETED", "PENDING_PROVIDER", "PROCESSING",
    "PROVISIONING", "ACTIVE", "COMPLETED",
}


def _norm_svas(raw):
    """Normaliza los SVAs de Likes (formato real {spanishName, status, type}) a {code, status, spanishName}."""
    out = []
    for s in (raw or []):
        if not isinstance(s, dict):
            continue
        name = s.get("spanishName")
        code = s.get("code") or likes_client.SVA_NAME_TO_CODE.get(name)
        if not code:
            code = (name or s.get("type") or "").upper().replace(" ", "_")
        if not code:
            continue
        out.append({"code": code, "status": bool(s.get("status")),
                    "spanishName": name or code, "type": s.get("type")})
    return out


async def reconcile_customer(db, fiscal_id):
    if not await asyncio.to_thread(likes_client.get_token):
        return {"reconciled": False, "reason": "not_connected"}
    now = _now()
    counts = {"orders": 0, "lines": 0, "subscriptions": 0, "portabilities": 0}
    ship_info = {}  # lineNumber -> {status, tracking, likesOrderStatus} (envío de SIM/router)

    # 1) ÓRDENES (estados reales + envío de SIM)
    try:
        for o in (await asyncio.to_thread(likes_client.get_customer_orders, fiscal_id) or []):
            oid = o.get("orderId")
            if not oid:
                continue
            prods = o.get("products") or [{}]
            p0 = prods[0]
            ext_carrier = p0.get("extCarrierId")
            ostatus = o.get("status")
            ln0 = p0.get("lineNumber")
            cust = o.get("customer") or {}
            cust_name = (f"{cust.get('name', '')} {cust.get('firstSurname', '')}".strip()
                         or o.get("customerName") or o.get("name"))
            upd = {"status": ostatus, "likesPrice": o.get("price"), "likesOrderId": oid,
                   "productName": p0.get("productName"), "lineNumber": ln0,
                   "source": "likes", "likesSyncedAt": now}
            # --- firma bidireccional: si Likes reporta la firma completada, reflejarlo en el CRM ---
            os_up = (ostatus or "").upper()
            if os_up in SIGNED_ORDER_STATUSES:
                existing = await db.orders.find_one({"$or": [{"likesOrderId": oid}, {"orderId": oid}]})
                upd["signed"] = True
                if not (existing or {}).get("signedAt"):
                    upd["signedAt"] = now
            # --- envío de SIM/dispositivo (espejo fiel de Likes) ---
            needs_ship = (ostatus == "PENDING_MANUAL_SHIPPING") or bool(ext_carrier)
            if needs_ship:
                ship_status = "SHIPPED" if ext_carrier else "PENDING"
                upd["shippingStatus"] = ship_status
                upd["tracking"] = ext_carrier
                if ln0:
                    ship_info[ln0] = {"status": ship_status, "tracking": ext_carrier,
                                      "likesOrderStatus": ostatus}
                await db.shipments.update_one(
                    {"$or": [{"likesOrderId": oid}, {"orderId": oid}]},
                    {"$set": {"fiscalId": fiscal_id, "orderId": oid, "likesOrderId": oid,
                              "lineNumber": ln0, "productName": p0.get("productName"),
                              "customerName": cust_name, "status": ship_status,
                              "tracking": ext_carrier, "likesOrderStatus": ostatus,
                              "source": "likes", "likesSyncedAt": now},
                     "$setOnInsert": {"shipmentId": str(uuid.uuid4().int)[:10],
                                      "carrier": None, "created": now}},
                    upsert=True)
            res = await db.orders.update_one({"$or": [{"likesOrderId": oid}, {"orderId": oid}]}, {"$set": upd})
            if res.matched_count == 0:
                await db.orders.insert_one({
                    "orderId": oid, "fiscalId": fiscal_id, "likesOrderId": oid,
                    "customerName": cust_name,
                    "channel": o.get("channel", "WD"), "created": now, **upd})
            counts["orders"] += 1
    except Exception as e:  # noqa
        logger.warning("reconcile orders %s: %s", fiscal_id, e)

    # 2) SUSCRIPCIONES + LÍNEAS (estado, consumo GB, SVAs, eSIM)
    try:
        for s in (await asyncio.to_thread(likes_client.get_subscriptions, fiscal_id) or []):
            sid = s.get("subscriptionId")
            products = s.get("products", [])
            main_status = products[0].get("status") if products else None
            await db.subscriptions.update_one({"subscriptionId": sid}, {"$set": {
                "subscriptionId": sid, "fiscalId": fiscal_id, "status": main_status,
                "products": products, "created": s.get("created", now),
                "source": "likes", "likesSyncedAt": now}}, upsert=True)
            counts["subscriptions"] += 1
            for p in products:
                ln = p.get("lineNumber")
                if not ln or p.get("type") == "Optional":
                    continue
                line_upd = {"fiscalId": fiscal_id, "family": p.get("family"), "status": p.get("status"),
                            "productId": p.get("productId"), "productName": p.get("productName"),
                            "price": p.get("finalPrice") or p.get("price"), "icc": p.get("icc"),
                            "eSim": p.get("eSim", False), "source": "likes", "likesSyncedAt": now}
                if p.get("eSimData"):
                    line_upd["esimData"] = p["eSimData"]
                if p.get("family") == "Mobile":
                    gb = await asyncio.to_thread(likes_client.get_line_gb, ln)
                    if gb:
                        line_upd.update({"totalGB": gb.get("totalGB"), "usedGB": gb.get("usedGB"),
                                         "leftGB": gb.get("leftGB"), "lastDailyGB": gb.get("lastDailyGB")})
                    cl = await asyncio.to_thread(likes_client.get_credit_limit, ln)
                    if cl and cl.get("creditLimit") is not None:
                        line_upd["creditLimit"] = cl.get("creditLimit")
                    svas = await asyncio.to_thread(likes_client.get_line_svas, ln)
                    if isinstance(svas, list) and svas:
                        svas = _norm_svas(svas)
                        line_upd["svas"] = svas
                        roaming = next((x for x in svas if x.get("code") == "ROAMING"), None)
                        if roaming is not None:
                            line_upd["roaming"] = bool(roaming.get("status"))
                    info = await asyncio.to_thread(likes_client.get_line_info, ln)
                    if info:
                        if info.get("status"):
                            line_upd["status"] = info["status"]
                        if info.get("icc"):
                            line_upd["icc"] = info["icc"]
                        if info.get("spn"):
                            line_upd["spn"] = info["spn"]
                        if info.get("created"):
                            line_upd["activationDate"] = info["created"]
                        owner = info.get("owner") or {}
                        if owner.get("name"):
                            line_upd["titularName"] = owner.get("name")
                        si = info.get("simInfo") or {}
                        if si:
                            line_upd["pins"] = {"pin": si.get("pin"), "puk": si.get("puk"),
                                                "pin2": si.get("pin2"), "puk2": si.get("puk2")}
                            if si.get("imsi"):
                                line_upd["imsi"] = si["imsi"]
                            if info.get("eSim") and si.get("activationCode"):
                                line_upd["esimData"] = {k: si.get(k) for k in
                                                        ("icc", "pin", "puk", "smdpAddress",
                                                         "activationCode", "qrUrl", "qrDownloadUrl")
                                                        if si.get(k) is not None}
                            elif si:
                                line_upd["esimData"] = si
                    cdrs = await asyncio.to_thread(likes_client.get_line_cdrs, ln)
                    if isinstance(cdrs, list):
                        line_upd["cdrs"] = cdrs[:50]
                # envío de SIM/dispositivo: reflejar estado real en la línea (DELIVERED al activarse)
                if ln in ship_info:
                    sh = "DELIVERED" if p.get("status") == "ACTIVE" else ship_info[ln]["status"]
                    line_upd["shippingStatus"] = sh
                    line_upd["tracking"] = ship_info[ln]["tracking"]
                    await db.shipments.update_one({"lineNumber": ln, "source": "likes"},
                                                  {"$set": {"status": sh, "likesSyncedAt": now}})
                res = await db.lines.update_one({"lineNumber": ln}, {"$set": line_upd})
                if res.matched_count == 0:
                    await db.lines.insert_one({"lineNumber": ln, "created": now, "spn": "GOROKY", **line_upd})
                counts["lines"] += 1
    except Exception as e:  # noqa
        logger.warning("reconcile subs %s: %s", fiscal_id, e)

    # 3) PORTABILIDADES del cliente
    try:
        for pt in (await asyncio.to_thread(likes_client.get_portabilities) or []):
            if pt.get("fiscalId") != fiscal_id:
                continue
            await db.portabilities.update_one(
                {"lineNumber": pt.get("lineNumber"), "fiscalId": fiscal_id},
                {"$set": {**pt, "source": "likes", "likesSyncedAt": now}}, upsert=True)
            counts["portabilities"] += 1
    except Exception as e:  # noqa
        logger.warning("reconcile ports %s: %s", fiscal_id, e)

    # 4) DOCUMENTOS + CONTRATOS (descarga de Likes)
    try:
        counts["documents"] = await import_documents(db, fiscal_id)
    except Exception as e:  # noqa
        logger.warning("reconcile docs %s: %s", fiscal_id, e)

    return {"reconciled": True, "counts": counts, "at": now}


async def import_documents(db, fiscal_id):
    """Descarga de Likes los documentos (DNI/NIE, IBAN, contrato firmado) de cada orden del cliente."""
    import base64
    n = 0
    for o in (await asyncio.to_thread(likes_client.get_customer_orders, fiscal_id) or []):
        oid = o.get("orderId")
        if not oid:
            continue
        draft = await asyncio.to_thread(likes_client.get_order_draft, oid) or {}
        for d in (draft.get("documentation") or []):
            url = d.get("downloadURL")
            if not url:
                continue
            fname = url.split("?", 1)[0].rsplit("/", 1)[-1] or "documento"
            dtype = d.get("type") or fname.rsplit(".", 1)[0]
            if await db.customer_documents.find_one(
                    {"fiscalId": fiscal_id, "orderId": oid, "filename": fname}):
                continue
            content = await asyncio.to_thread(likes_client.download_document, url)
            if not content:
                continue
            await db.customer_documents.insert_one({
                "fiscalId": fiscal_id, "orderId": oid, "type": dtype, "filename": fname,
                "content": base64.b64encode(content).decode(), "source": "likes",
                "uploadedAt": _now()})
            n += 1
    return n


async def reconcile_all(db, limit=1000):
    """Reconciliación masiva: importa TODOS los clientes reales de Likes y espeja su estado."""
    if not await asyncio.to_thread(likes_client.get_token):
        return {"reconciled": False, "reason": "not_connected"}
    imp = await import_customers(db)
    total = {"customers": 0, "orders": 0, "lines": 0, "subscriptions": 0, "portabilities": 0}
    cursor = db.customers.find({"source": "likes"}).limit(limit)
    async for c in cursor:
        r = await reconcile_customer(db, c["fiscalId"])
        if r.get("reconciled"):
            total["customers"] += 1
            for k in ("orders", "lines", "subscriptions", "portabilities"):
                total[k] += r["counts"].get(k, 0)
    return {"reconciled": True, "imported": imp.get("count", 0), "totals": total}


def _map_customer(c):
    ba = c.get("billingAddress") or {}
    return {
        "fiscalId": c.get("fiscalId"), "customerType": c.get("customerType"),
        "name": c.get("name"), "firstSurname": c.get("firstSurname"),
        "lastSurname": c.get("lastSurname"), "email": (c.get("email") or "").lower(),
        "contactPhone": c.get("contactPhone"), "fiscalIdType": c.get("fiscalIdType"),
        "paymentMethod": c.get("paymentMethod"), "likesStatus": c.get("status"),
        "billingAddress": {"street": ba.get("street"), "streetNumber": ba.get("streetNumber"),
                           "postalCode": ba.get("postalCode"), "cityName": ba.get("cityName"),
                           "provinceName": ba.get("provinceName"),
                           "additionalInfo": ba.get("additionalInfo")},
        "source": "likes", "likesSynced": True,
    }


async def import_customers(db):
    """Trae de Likes la lista completa de clientes y los espeja en la colección local."""
    if not await asyncio.to_thread(likes_client.get_token):
        return {"imported": False, "reason": "not_connected"}
    now = _now()
    n = 0
    for c in (await asyncio.to_thread(likes_client.get_customers) or []):
        fid = c.get("fiscalId")
        if not fid:
            continue
        doc = _map_customer(c)
        doc["likesSyncedAt"] = now
        await db.customers.update_one(
            {"fiscalId": fid},
            {"$set": doc, "$setOnInsert": {"created": c.get("created") or now, "ownerId": None}},
            upsert=True)
        n += 1
    return {"imported": True, "count": n}
