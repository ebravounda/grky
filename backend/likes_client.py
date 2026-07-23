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
     "price": 14.99, "isRecurringPrice": True, "marketingText": [{"title": "Canales", "value": "80+"}, {"title": "Deportes", "value": "Incluido"}]},
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
