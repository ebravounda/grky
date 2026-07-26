"""Motor de reconciliación GoRoky ← Likes Telecom (lectura → espejo local).

Trae de Likes las órdenes, suscripciones, líneas (estado, GB, SVAs, eSIM) y
portabilidades de un cliente y las vuelca en las colecciones locales que alimentan
los paneles, para que GoRoky sea un espejo fiel del estado real de Likes.

Tolerante a fallos: si Likes no está conectado (preview/403) devuelve reconciled=False
sin tocar nada. Validación real en el VPS.
"""
import logging
from datetime import datetime, timezone
import likes_client

logger = logging.getLogger(__name__)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _norm_svas(raw):
    """Normaliza los SVAs de Likes a {code, status(bool), ...} para el CRM/portal."""
    out = []
    for s in (raw or []):
        if not isinstance(s, dict):
            continue
        code = s.get("code") or s.get("svaCode") or s.get("name")
        if code is None:
            continue
        status = s.get("status")
        if status is None:
            status = s.get("active", s.get("enabled", False))
        item = dict(s)
        item["code"] = code
        item["status"] = bool(status)
        out.append(item)
    return out


async def reconcile_customer(db, fiscal_id):
    if not likes_client.get_token():
        return {"reconciled": False, "reason": "not_connected"}
    now = _now()
    counts = {"orders": 0, "lines": 0, "subscriptions": 0, "portabilities": 0}

    # 1) ÓRDENES (estados reales)
    try:
        for o in (likes_client.get_customer_orders(fiscal_id) or []):
            oid = o.get("orderId")
            if not oid:
                continue
            prods = o.get("products") or [{}]
            upd = {"status": o.get("status"), "price": o.get("price"), "likesOrderId": oid,
                   "productName": prods[0].get("productName"), "lineNumber": prods[0].get("lineNumber"),
                   "source": "likes", "likesSyncedAt": now}
            res = await db.orders.update_one({"$or": [{"likesOrderId": oid}, {"orderId": oid}]}, {"$set": upd})
            if res.matched_count == 0:
                cust = o.get("customer") or {}
                await db.orders.insert_one({
                    "orderId": oid, "fiscalId": fiscal_id, "likesOrderId": oid,
                    "customerName": f"{cust.get('name', '')} {cust.get('firstSurname', '')}".strip(),
                    "channel": o.get("channel", "WD"), "created": now, **upd})
            counts["orders"] += 1
    except Exception as e:  # noqa
        logger.warning("reconcile orders %s: %s", fiscal_id, e)

    # 2) SUSCRIPCIONES + LÍNEAS (estado, consumo GB, SVAs, eSIM)
    try:
        for s in (likes_client.get_subscriptions(fiscal_id) or []):
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
                    gb = likes_client.get_line_gb(ln)
                    if gb:
                        line_upd.update({"totalGB": gb.get("totalGB"), "usedGB": gb.get("usedGB"),
                                         "leftGB": gb.get("leftGB"), "lastDailyGB": gb.get("lastDailyGB")})
                    svas = likes_client.get_line_svas(ln)
                    if isinstance(svas, list) and svas:
                        svas = _norm_svas(svas)
                        line_upd["svas"] = svas
                        roaming = next((x for x in svas if x.get("code") == "ROAMING"), None)
                        if roaming is not None:
                            line_upd["roaming"] = bool(roaming.get("status"))
                    info = likes_client.get_line_info(ln)
                    if info and info.get("status"):
                        line_upd["status"] = info["status"]
                        if info.get("simInfo"):
                            line_upd["esimData"] = info["simInfo"]
                res = await db.lines.update_one({"lineNumber": ln}, {"$set": line_upd})
                if res.matched_count == 0:
                    await db.lines.insert_one({"lineNumber": ln, "created": now, "spn": "GOROKY", **line_upd})
                counts["lines"] += 1
    except Exception as e:  # noqa
        logger.warning("reconcile subs %s: %s", fiscal_id, e)

    # 3) PORTABILIDADES del cliente
    try:
        for pt in (likes_client.get_portabilities() or []):
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
    for o in (likes_client.get_customer_orders(fiscal_id) or []):
        oid = o.get("orderId")
        if not oid:
            continue
        draft = likes_client.get_order_draft(oid) or {}
        for d in (draft.get("documentation") or []):
            url = d.get("downloadURL")
            if not url:
                continue
            fname = url.split("?", 1)[0].rsplit("/", 1)[-1] or "documento"
            dtype = d.get("type") or fname.rsplit(".", 1)[0]
            if await db.customer_documents.find_one(
                    {"fiscalId": fiscal_id, "orderId": oid, "filename": fname}):
                continue
            content = likes_client.download_document(url)
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
    if not likes_client.get_token():
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
    if not likes_client.get_token():
        return {"imported": False, "reason": "not_connected"}
    now = _now()
    n = 0
    for c in (likes_client.get_customers() or []):
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
