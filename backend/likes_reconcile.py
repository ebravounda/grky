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

    return {"reconciled": True, "counts": counts, "at": now}


async def reconcile_all(db, limit=500):
    """Reconciliación masiva: todos los clientes ya dados de alta en Likes."""
    if not likes_client.get_token():
        return {"reconciled": False, "reason": "not_connected"}
    total = {"customers": 0, "orders": 0, "lines": 0, "subscriptions": 0, "portabilities": 0}
    cursor = db.customers.find({"likesSynced": True}).limit(limit)
    async for c in cursor:
        r = await reconcile_customer(db, c["fiscalId"])
        if r.get("reconciled"):
            total["customers"] += 1
            for k in ("orders", "lines", "subscriptions", "portabilities"):
                total[k] += r["counts"].get(k, 0)
    return {"reconciled": True, "totals": total}
