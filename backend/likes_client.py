"""
Cliente de la API de Likes Telecom.

Intenta llamar a la API real (https://api.likestelecom.com). Si la IP no está
autorizada (403 Forbidden) o la red falla, devuelve datos MOCK que replican
EXACTAMENTE el contrato de la API, para que la app funcione end-to-end mientras
Likes autoriza la IP de salida.
"""
import os
import time
import logging
import requests

logger = logging.getLogger(__name__)

LIKES_API_URL = os.environ.get("LIKES_API_URL", "https://api.likestelecom.com")
LIKES_EMAIL = os.environ.get("LIKES_EMAIL", "")
LIKES_PASSWORD = os.environ.get("LIKES_PASSWORD", "")

_token_cache = {"token": None, "ts": 0}

# Estado de conexión con la API real (para mostrar en el panel)
CONNECTION_STATE = {"live": False, "last_error": "IP no autorizada (403 Forbidden)"}


def get_token():
    if _token_cache["token"] and (time.time() - _token_cache["ts"] < 1800):
        return _token_cache["token"]
    try:
        r = requests.post(
            f"{LIKES_API_URL}/token",
            json={"email": LIKES_EMAIL, "password": LIKES_PASSWORD},
            timeout=8,
        )
        if r.status_code == 200:
            token = r.json().get("token")
            _token_cache.update({"token": token, "ts": time.time()})
            CONNECTION_STATE.update({"live": True, "last_error": None})
            return token
        CONNECTION_STATE.update({"live": False, "last_error": f"HTTP {r.status_code}: {r.text[:80]}"})
    except Exception as e:  # noqa
        CONNECTION_STATE.update({"live": False, "last_error": str(e)[:120]})
    return None


def _live_get(path, params=None):
    token = get_token()
    if not token:
        return None
    try:
        r = requests.get(f"{LIKES_API_URL}{path}", params=params,
                         headers={"Authorization": f"Bearer {token}"}, timeout=8)
        if r.status_code == 200:
            return r.json()
    except Exception as e:  # noqa
        logger.warning("Likes live GET %s failed: %s", path, e)
    return None


def _live_post(path, payload):
    """POST autenticado a la API real. Devuelve (data, error). data=None si no live/falla."""
    token = get_token()
    if not token:
        return None, "Likes no conectado (IP no autorizada / MOCK)"
    try:
        r = requests.post(f"{LIKES_API_URL}{path}", json=payload,
                          headers={"Authorization": f"Bearer {token}"}, timeout=20)
        if r.status_code in (200, 201):
            return (r.json() if r.text else {}), None
        return None, f"HTTP {r.status_code}: {r.text[:200]}"
    except Exception as e:  # noqa
        return None, str(e)[:200]


def _live_put(path, payload):
    token = get_token()
    if not token:
        return None, "Likes no conectado"
    try:
        r = requests.put(f"{LIKES_API_URL}{path}", json=payload,
                         headers={"Authorization": f"Bearer {token}"}, timeout=20)
        if r.status_code in (200, 201):
            return (r.json() if r.text else {}), None
        return None, f"HTTP {r.status_code}: {r.text[:200]}"
    except Exception as e:  # noqa
        return None, str(e)[:200]


def upload_file_to_url(upload_url, file_bytes, content_type):
    """Sube un fichero (bytes) a una URL S3 prefirmada (PUT). Devuelve (ok, error)."""
    try:
        r = requests.put(upload_url, data=file_bytes,
                         headers={"Content-Type": content_type}, timeout=30)
        if r.status_code in (200, 201, 204):
            return True, None
        return False, f"HTTP {r.status_code}: {r.text[:150]}"
    except Exception as e:  # noqa
        return False, str(e)[:200]


# ---- Escritura (alta real en Likes) ----
def create_customer(payload):
    """POST /customer → crea cliente y devuelve documentation[] con uploadURLs."""
    return _live_post("/customer", payload)


def create_order(payload):
    """POST /signupv2 → crea la orden/alta. Devuelve {orderId}."""
    return _live_post("/signupv2", payload)


def get_order_draft(order_id):
    """GET /draft-order-v2?orderId= → detalle de orden (documentation, status, products…)."""
    return _live_get("/draft-order-v2", {"orderId": order_id})


# ---- Lectura en vivo (espejo del panel de Likes) ----
def get_customer_orders(fiscal_id):
    live = _live_get("/orders", {"fiscalId": fiscal_id})
    return live if live is not None else []


def get_subscriptions(fiscal_id):
    live = _live_get("/subscriptions", {"fiscalId": fiscal_id})
    return live if live is not None else []


def get_line_info(line_number):
    return _live_get("/line", {"lineNumber": line_number, "withSims": "true",
                               "withBonuses": "true", "withSimsInfo": "true"})


def get_line_gb(line_number):
    return _live_get("/line/gb", {"lineNumber": line_number})


def get_line_svas(line_number):
    return _live_get("/line/svas", {"lineNumber": line_number})


def get_line_cdrs(line_number):
    live = _live_get("/line/cdrs", {"lineNumber": line_number})
    return live if live is not None else []


def get_portabilities():
    live = _live_get("/portabilities")
    return live if live is not None else []


def get_installations():
    live = _live_get("/installations")
    return live if live is not None else []


def get_customers():
    """GET /customers → lista TODOS los clientes reales de la marca en Likes."""
    live = _live_get("/customers")
    return live if live is not None else []


# ---- Escritura de gestión de línea (sincroniza acciones con Likes) ----
def set_line_svas(line_number, svas):
    """PUT /line/svas → activa/desactiva SVAs de la línea en Likes (espejo del GET)."""
    return _live_put("/line/svas", {"lineNumber": line_number, "svas": svas})


def block_line_remote(line_number, block=True):
    """PUT /line/block → bloquea (BLOCK) o desbloquea (UNBLOCK) la línea en Likes."""
    return _live_put("/line/block", {"lineNumber": line_number,
                                     "action": "BLOCK" if block else "UNBLOCK"})


def download_document(url):
    """Descarga un documento desde una downloadURL prefirmada (S3). Devuelve bytes o None."""
    try:
        r = requests.get(url, timeout=30)
        if r.status_code == 200:
            return r.content
        logger.warning("download_document HTTP %s", r.status_code)
    except Exception as e:  # noqa
        logger.warning("download_document error: %s", e)
    return None


# --------------------------------------------------------------------------
# Catálogo de productos (mock que replica GET /products/brand)
# --------------------------------------------------------------------------
MOCK_PRODUCTS = [
    {"productId": "1411", "productName": "Móvil 25GB", "family": "Mobile", "type": "Main",
     "price": 9.99, "isRecurringPrice": True, "marketingText": [{"title": "Datos", "value": "25 GB"}, {"title": "Llamadas", "value": "Ilimitadas"}]},
    {"productId": "1412", "productName": "Móvil 50GB", "family": "Mobile", "type": "Main",
     "price": 12.99, "isRecurringPrice": True, "marketingText": [{"title": "Datos", "value": "50 GB"}, {"title": "Llamadas", "value": "Ilimitadas"}]},
    {"productId": "1413", "productName": "Móvil 100GB", "family": "Mobile", "type": "Main",
     "price": 15.99, "isRecurringPrice": True, "marketingText": [{"title": "Datos", "value": "100 GB"}, {"title": "Llamadas", "value": "Ilimitadas"}]},
    {"productId": "1414", "productName": "Móvil Ilimitado", "family": "Mobile", "type": "Main",
     "price": 19.99, "isRecurringPrice": True, "marketingText": [{"title": "Datos", "value": "Ilimitados"}, {"title": "5G", "value": "Incluido"}]},
    {"productId": "1520", "productName": "Fibra 300Mb", "family": "Fiber", "type": "Main",
     "price": 24.99, "isRecurringPrice": True, "marketingText": [{"title": "Velocidad", "value": "300 Mb"}, {"title": "Instalación", "value": "Gratis"}]},
    {"productId": "1521", "productName": "Fibra 600Mb", "family": "Fiber", "type": "Main",
     "price": 29.99, "isRecurringPrice": True, "marketingText": [{"title": "Velocidad", "value": "600 Mb"}, {"title": "Router WiFi 6", "value": "Incluido"}]},
    {"productId": "1522", "productName": "Fibra 1Gb + 2 Móviles", "family": "Fiber", "type": "Main",
     "price": 44.99, "isRecurringPrice": True, "marketingText": [{"title": "Velocidad", "value": "1 Gb"}, {"title": "Móviles", "value": "2x 25GB"}]},
    {"productId": "2010", "productName": "TV Total", "family": "TV", "type": "Main",
     "price": 14.99, "isRecurringPrice": True, "marketingText": [{"title": "Canales", "value": "80+"}, {"title": "Deportes", "value": "Incluido"}],
     "channels": ["La 1", "La 2", "Antena 3", "Cuatro", "Telecinco", "laSexta", "24h", "Teledeporte",
                  "Movistar Deportes", "Eurosport 1", "Eurosport 2", "DAZN 1", "AXN", "TNT", "FOX",
                  "SYFY", "Comedy Central", "National Geographic", "Discovery Channel", "History",
                  "Nickelodeon", "Disney Channel", "Cartoon Network", "CNN", "Euronews", "MTV"]},
    {"productId": "2011", "productName": "TV Cine & Series", "family": "TV", "type": "Main",
     "price": 19.99, "isRecurringPrice": True, "marketingText": [{"title": "Canales", "value": "120+"}, {"title": "Cine", "value": "Estrenos"}],
     "channels": ["La 1", "Antena 3", "Telecinco", "laSexta", "Cuatro", "AXN", "AXN White", "TNT",
                  "FOX", "FOX Life", "COSMO", "SYFY", "Calle 13", "TCM", "Hollywood", "Movistar Estrenos",
                  "Movistar Series", "Movistar Cine Español", "Sundance TV", "AMC", "Disney Channel",
                  "Nickelodeon", "Baby TV", "National Geographic", "Odisea", "Historia"]},
    {"productId": "2012", "productName": "TV Deportes", "family": "TV", "type": "Main",
     "price": 24.99, "isRecurringPrice": True, "marketingText": [{"title": "Canales", "value": "Todo el fútbol"}, {"title": "F1 / MotoGP", "value": "Incluido"}],
     "channels": ["Movistar LaLiga", "Movistar Liga de Campeones", "DAZN 1", "DAZN 2", "DAZN LaLiga",
                  "Movistar Deportes", "Eurosport 1", "Eurosport 2", "Teledeporte", "GOL",
                  "Movistar Golf", "Movistar Vamos", "#Vamos", "Real Madrid TV", "Barça TV"]},
    {"productId": "3010", "productName": "Satélite Básico", "family": "Satellite", "type": "Main",
     "price": 17.99, "isRecurringPrice": True, "marketingText": [{"title": "Cobertura", "value": "Nacional vía satélite"}, {"title": "Instalación", "value": "Antena incluida"}],
     "channels": ["La 1", "La 2", "Antena 3", "Cuatro", "Telecinco", "laSexta", "24h", "Canal Sur",
                  "TV3", "Aragón TV", "Movistar Deportes", "Eurosport", "National Geographic", "Discovery"]},
    {"productId": "3011", "productName": "Satélite + Fibra 300Mb", "family": "Satellite", "type": "Main",
     "price": 39.99, "isRecurringPrice": True, "marketingText": [{"title": "Fibra", "value": "300 Mb"}, {"title": "TV satélite", "value": "80+ canales"}],
     "channels": ["La 1", "Antena 3", "Telecinco", "laSexta", "Cuatro", "DAZN 1", "Eurosport 1",
                  "AXN", "TNT", "FOX", "National Geographic", "Discovery", "Disney Channel", "Nickelodeon"]},
    {"productId": "2501", "productName": "Llamadas Internacionales", "family": "Mobile", "type": "Optional",
     "price": 5.00, "isRecurringPrice": True, "marketingText": [{"title": "Destinos", "value": "50 países"}]},
    {"productId": "2502", "productName": "Bono 10GB Extra", "family": "Mobile", "type": "Optional",
     "price": 4.00, "isRecurringPrice": True, "marketingText": [{"title": "Datos extra", "value": "10 GB"}]},
]

MOCK_DONOR_OPERATORS = [
    {"Code": "001", "Name": "MOVISTAR"}, {"Code": "003", "Name": "VODAFONE"},
    {"Code": "004", "Name": "ORANGE"}, {"Code": "005", "Name": "YOIGO"},
    {"Code": "075", "Name": "DIGI SPAIN TELECOM"}, {"Code": "084", "Name": "LYCAMOBILE"},
    {"Code": "064", "Name": "SIMYO"}, {"Code": "290", "Name": "PEPEPHONE 3.0"},
]

MOCK_TICKET_TYPOLOGIES = [
    "Otro", "Móvil :: Portabilidad", "Móvil :: Cambios de tarifas",
    "Móvil :: Reemplazo de SIM", "Móvil :: Bloqueo/Desbloqueo de línea",
    "Fibra :: Incidencia fibra cortes y/o lentitud", "Fibra :: Consulta cobertura",
    "Fibra :: Configuración de servicios", "Fibra :: Cambio de domicilio",
    "Facturación :: Revisión de facturas", "Facturación :: Abono",
    "eSIM internacionales :: Fallo activación eSIM",
]

DEFAULT_SVAS = [
    {"code": "ROAMING", "status": True, "spanishName": "Roaming"},
    {"code": "DATA", "status": True, "spanishName": "Datos"},
    {"code": "OUTBOUND_CALLS", "status": True, "spanishName": "Llamadas salientes"},
    {"code": "INTERNATIONAL_OUTBOUND_CALLS", "status": False, "spanishName": "Llamadas salientes internacionales"},
    {"code": "INBOUND_CALLS", "status": True, "spanishName": "Llamadas entrantes"},
    {"code": "OUTBOUND_SMSS", "status": True, "spanishName": "SMSs Salientes"},
    {"code": "VOICEMAIL", "status": True, "spanishName": "Buzón de Voz"},
    {"code": "CALL_WAITING", "status": False, "spanishName": "Llamada en espera"},
]


def get_products(family=None):
    live = _live_get("/products/brand", {"family": family} if family else None)
    data = live if live is not None else MOCK_PRODUCTS
    if family:
        data = [p for p in data if p.get("family") == family]
    return data


def get_donor_operators():
    live = _live_get("/admin2/donor-operators")
    if live is not None:
        return live.get("donorOperators", [])
    return MOCK_DONOR_OPERATORS


def get_ticket_typologies():
    live = _live_get("/ticket/typologys")
    if live is not None:
        return live.get("values", [])
    return MOCK_TICKET_TYPOLOGIES


def check_coverage(address):
    """Mock del flujo de cobertura (POST /coverage/format-coverage)."""
    return {
        "valid": True,
        "products": [{"productId": "1520"}, {"productId": "1521"}, {"productId": "1522"}],
        "coverage": {
            "province": "MADRID", "city": "MADRID", "street": address or "Calle Gran Vía",
            "streetType": "CALLE", "streetNumber": "1", "postalCode": "28013",
            "technology": "FTTH", "label": f"{address or 'CALLE GRAN VIA 1'}, 28013 MADRID",
            "isNEBA": True,
        },
    }


def search_address(label):
    """Mock de GET /coverage/address (búsqueda de direcciones)."""
    base = label or "Calle Mayor"
    return {"sessionId": "mock-session", "items": [
        {"address": f"{base} 1, 28013 Madrid", "gescal": "28079000000100001"},
        {"address": f"{base} 15, 28013 Madrid", "gescal": "28079000000100015"},
        {"address": f"{base} 42, 28013 Madrid", "gescal": "28079000000100042"},
    ]}


def esim_data(icc):
    """Datos de activación eSIM (mock, replica eSimData de la API)."""
    ac = f"19-{icc[-6:]}-1UGD0B"
    return {
        "icc": icc, "pin": "3736", "puk": "08792901",
        "smdpAddress": "rsp.truphone.com", "activationCode": ac,
        "qrUrl": f"https://quickchart.io/qr?size=300&text=LPA:1$rsp.truphone.com${ac}",
        "qrDownloadUrl": f"https://quickchart.io/qr?size=600&text=LPA:1$rsp.truphone.com${ac}",
    }


MOCK_RESOURCES = [
    {"title": "Facturación Mayorista", "folders": [
        {"title": "2026-06", "path": "299/facturacion/2026/06", "documents": ["202606_299_LT-FAC-2026-2406_factura_mayorista.csv"]},
        {"title": "2026-05", "path": "299/facturacion/2026/05", "documents": ["202605_299_LT-FAC-2026-2211_factura_mayorista.csv"]},
    ]},
    {"title": "Comisiones", "folders": [
        {"title": "2026-06", "path": "299/comisiones/2026/06", "documents": ["comisiones_junio_2026.xlsx"]},
        {"title": "2026-05", "path": "299/comisiones/2026/05", "documents": ["comisiones_mayo_2026.xlsx"]},
    ]},
    {"title": "CDRs", "folders": [
        {"title": "2026-06", "path": "299/cdrs/2026/06", "documents": ["cdrs_monthly.csv", "cdrs_20260601.csv"]},
    ]},
    {"title": "Albaranes", "folders": [
        {"title": "2026-06", "path": "299/albaranes/2026/06", "documents": ["albaran_20260610.pdf"]},
    ]},
    {"title": "Stock logístico", "folders": [
        {"title": "Pedidos de Compra", "path": "299/logisticStock/PO", "documents": ["PO_20260605.pdf"]},
    ]},
]


def get_brand_resources():
    live = _live_get("/getBrandResources")
    return live if live is not None else MOCK_RESOURCES
