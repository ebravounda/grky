"""Sincronización de altas GoRoky → Likes Telecom (escritura real).

Flujo (firma manual, digitalSignature=false):
  1. POST /customer  → crea cliente + devuelve uploadURLs de documentación
  2. PUT DNI/NIE anverso/reverso a las uploadURLs
  3. POST /signupv2  → crea la orden/alta (móvil/fibra, portabilidad, ICC)
  4. GET /draft-order-v2 → localizar uploadURL del 'signedContract'
  5. PUT del contrato firmado (PDF generado por GoRoky)

Todo es tolerante a fallos: si Likes no está conectado (preview/403), devuelve
synced=False sin romper el flujo interno de GoRoky. En producción (IP autorizada)
ejecuta el alta real y guarda el log de cada paso.
"""
import asyncio
import base64
import logging
from bson import ObjectId
import likes_client

logger = logging.getLogger(__name__)


def _decode_data_url(data_url):
    """data:image/jpeg;base64,xxxx → (bytes, content_type)."""
    if not data_url or not isinstance(data_url, str) or not data_url.startswith("data:"):
        return None, None
    header, b64 = data_url.split(",", 1)
    ctype = header.split(";")[0].replace("data:", "") or "application/octet-stream"
    return base64.b64decode(b64), ctype


async def _file_bytes(db, file_id):
    if not file_id:
        return None, None
    try:
        f = await db.files.find_one({"_id": ObjectId(file_id)})
    except Exception:
        f = None
    if not f:
        return None, None
    return _decode_data_url(f.get("dataUrl"))


def _customer_payload(customer, app_doc):
    ba = customer.get("billingAddress", {}) or {}
    phone = (customer.get("contactPhone") or app_doc.get("contactPhone") or "").strip()
    _dt = (customer.get("kyc") or {}).get("docType") or customer.get("fiscalIdType") or app_doc.get("docType")
    _dmap = {"DNI": "DNI", "NIE": "NIE", "CIF": "CIF", "PASSPORT": "Passport", "Passport": "Passport", "RED_CARD": "NIE"}
    payload = {
        "fiscalId": customer["fiscalId"],
        "customerType": customer.get("customerType", "Residential"),
        "fiscalIdType": _dmap.get(_dt, "DNI"),
        "name": customer.get("name", ""),
        "firstSurname": customer.get("firstSurname", "") or app_doc.get("firstSurname", ""),
        "lastSurname": customer.get("lastSurname", "") or app_doc.get("lastSurname", ""),
        "email": customer.get("email", ""),
        "contactPhone": phone,
        "billingAddress": {
            "street": ba.get("street", ""),
            "streetNumber": ba.get("streetNumber", "") or "S/N",
            "postalCode": ba.get("postalCode", ""),
            "cityName": ba.get("cityName", ""),
            "provinceName": ba.get("provinceName", ""),
            "additionalInfo": ba.get("additionalInfo", ""),
        },
    }
    if customer.get("iban"):
        payload["iban"] = customer["iban"]
        payload["paymentMethod"] = customer.get("paymentMethod", "SEPA CORE")
    return payload


def _products_payload(order, likes_product_id, customer_email=None):
    """Construye el array products para /signupv2 según la familia (mismo proceso que Likes)."""
    family = order.get("family", "Mobile")
    portability = bool(order.get("portability"))
    prod = {"family": family, "productId": likes_product_id, "portability": portability}
    if family == "Mobile":
        sim_type = order.get("simType", "esim")
        if portability:
            prod["donorOperatorId"] = order.get("donorOperatorId")
            prod["lineNumber"] = order.get("portMsisdn") or order.get("lineNumber")
        if sim_type == "esim" or order.get("eSim"):
            prod["eSim"] = True
            if customer_email:
                prod["eSimEmail"] = customer_email
        elif sim_type == "physical" and order.get("simIcc"):
            prod["icc"] = order.get("simIcc")
        # "ship" (Enviar SIM): se omite icc → Likes deja la línea en PENDING_MANUAL_SHIPPING
    elif family == "Fiber":
        if order.get("coverage"):
            prod["coverage"] = order["coverage"]
        if portability:
            prod["lineNumber"] = order.get("portMsisdn") or order.get("lineNumber")
            if order.get("donorOperatorId"):
                prod["donorOperatorId"] = order.get("donorOperatorId")
    elif family == "TV":
        # TV: lineNumber = email de suscripción del cliente (Likes lo exige válido).
        return [{"family": "TV", "productId": likes_product_id,
                 "lineNumber": order.get("email") or customer_email or ""}]
    return [prod]


async def sync_alta_to_likes(db, app_doc, customer, order, contract_pdf_bytes, likes_product_id):
    """Ejecuta el alta real en Likes. Devuelve dict con el resultado y el log de pasos."""
    log = []
    result = {"synced": False, "log": log, "likesOrderId": None}

    # 0) ¿Likes conectado?
    if not await asyncio.to_thread(likes_client.get_token):
        log.append("Likes no conectado (IP no autorizada / MOCK). Alta NO sincronizada.")
        result["reason"] = "not_connected"
        return result

    # 1) Crear cliente en Likes (IDEMPOTENTE: si ya existe, Likes devuelve error y continuamos
    #    igual — /signupv2 solo necesita que el fiscalId exista, y ya existe).
    cust_payload = _customer_payload(customer, app_doc)
    data, err = await asyncio.to_thread(likes_client.create_customer, cust_payload)
    if err:
        log.append(f"POST /customer aviso: {err} (se continúa; probablemente el cliente ya existe)")
        result["customerError"] = err
        result["customerExists"] = "EXIST" in (err or "").upper()
        data = None  # sin uploadURLs de documentación en este caso
    else:
        log.append(f"Cliente creado en Likes: {cust_payload['fiscalId']}")
        result["customerSynced"] = True

    # 2) Subir DNI/NIE (anverso/reverso) a las uploadURLs devueltas
    documentation = (data or {}).get("documentation", [])
    file_ids = (customer.get("kyc") or {}).get("fileIds") or app_doc.get("fileIds", {})
    doc_map = {"obverseDocument": file_ids.get("front"), "reverseDocument": file_ids.get("back")}
    uploaded = 0
    for doc in documentation:
        dtype = doc.get("type")
        upload_url = doc.get("uploadURL")
        fid = doc_map.get(dtype)
        if not upload_url or not fid:
            continue
        content, ctype = await _file_bytes(db, fid)
        if not content:
            log.append(f"Documento {dtype}: fichero no encontrado en GoRoky")
            continue
        ok, uerr = await asyncio.to_thread(likes_client.upload_file_to_url, upload_url, content, ctype or "image/jpeg")
        if ok:
            uploaded += 1
            log.append(f"Documento {dtype} subido a Likes")
        else:
            log.append(f"Documento {dtype} ERROR de subida: {uerr}")
    result["documentsUploaded"] = uploaded

    # 3) Crear la orden/alta en Likes (firma manual → digitalSignature=false)
    order_payload = {
        "digitalSignature": False,
        "fiscalId": customer["fiscalId"],
        "products": _products_payload(order, likes_product_id, customer.get("email")),
    }
    odata, oerr = await asyncio.to_thread(likes_client.create_order, order_payload)
    if oerr:
        log.append(f"POST /signupv2 ERROR: {oerr}")
        result["reason"] = "order_failed"
        return result
    likes_order_id = (odata or {}).get("orderId")
    result["likesOrderId"] = likes_order_id
    log.append(f"Orden creada en Likes: {likes_order_id}")

    # 4) Subir el contrato firmado al 'signedContract' de la orden
    if likes_order_id and contract_pdf_bytes:
        draft = await asyncio.to_thread(likes_client.get_order_draft, likes_order_id)
        sc = None
        for d in (draft or {}).get("documentation", []):
            if d.get("type") in ("signedContract", "contract") and d.get("uploadURL"):
                sc = d
                if d.get("type") == "signedContract":
                    break
        if sc:
            ok, uerr = await asyncio.to_thread(likes_client.upload_file_to_url, sc["uploadURL"], contract_pdf_bytes, "application/pdf")
            log.append("Contrato firmado subido a Likes" if ok else f"Contrato ERROR: {uerr}")
            result["contractUploaded"] = ok
        else:
            log.append("No se encontró uploadURL de contrato en la orden (reintentar en unos segundos)")

    result["synced"] = True
    return result


async def upload_signed_contract(likes_order_id, contract_pdf_bytes):
    """Sube (o sobreescribe) el contrato firmado en el 'signedContract' de una orden ya existente en Likes.
    Fail-safe: devuelve dict con el resultado. No lanza excepciones."""
    result = {"uploaded": False, "log": []}
    log = result["log"]
    if not likes_order_id or not contract_pdf_bytes:
        log.append("Sin orderId de Likes o sin PDF: no se sube contrato firmado")
        return result
    if not await asyncio.to_thread(likes_client.get_token):
        log.append("Likes no conectado (MOCK/preview): contrato firmado NO subido")
        result["reason"] = "not_connected"
        return result
    draft = await asyncio.to_thread(likes_client.get_order_draft, likes_order_id)
    sc = None
    for d in (draft or {}).get("documentation", []):
        if d.get("type") in ("signedContract", "contract") and d.get("uploadURL"):
            sc = d
            if d.get("type") == "signedContract":
                break
    if not sc:
        log.append("No se encontró uploadURL de 'signedContract' en la orden de Likes")
        return result
    ok, uerr = await asyncio.to_thread(likes_client.upload_file_to_url, sc["uploadURL"], contract_pdf_bytes, "application/pdf")
    result["uploaded"] = bool(ok)
    log.append("Contrato firmado subido a Likes" if ok else f"Contrato ERROR: {uerr}")
    return result


async def upload_signed_titular_change(likes_order_id, pdf_bytes):
    """Sube el documento de cambio de titular firmado (signedTitularChange) a la orden de Likes. Fail-safe."""
    result = {"uploaded": False, "log": []}
    log = result["log"]
    if not likes_order_id or not pdf_bytes:
        return result
    if not await asyncio.to_thread(likes_client.get_token):
        result["reason"] = "not_connected"
        return result
    draft = await asyncio.to_thread(likes_client.get_order_draft, likes_order_id)
    sc = None
    for d in (draft or {}).get("documentation", []):
        if d.get("type") == "signedTitularChange" and d.get("uploadURL"):
            sc = d
            break
    if not sc:
        log.append("No se encontró uploadURL de 'signedTitularChange' en la orden de Likes")
        return result
    ok, uerr = await asyncio.to_thread(likes_client.upload_file_to_url, sc["uploadURL"], pdf_bytes, "application/pdf")
    result["uploaded"] = bool(ok)
    log.append("Cambio de titular firmado subido a Likes" if ok else f"Titular ERROR: {uerr}")
    return result
