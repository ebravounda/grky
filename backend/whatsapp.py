"""Helper para enviar mensajes de WhatsApp a través de la API externa (whats-saas / mitiendapro).

Lee las credenciales SOLO del entorno (nunca se exponen al frontend):
  - WHATSAPP_API_KEY        -> Bearer token
  - WHATSAPP_INSTANCE_NAME  -> nombre de instancia
  - WHATSAPP_API_URL        -> endpoint (por defecto https://mitiendapro.com/api/v1/send)

Uso:
    from whatsapp import send_whatsapp
    await send_whatsapp("600123456", "Hola!")
    await send_whatsapp("+34600123456", "Mira esto", type="image", media_url="https://...jpg")
"""
import os
import re
import logging

import httpx

logger = logging.getLogger("whatsapp")

DEFAULT_URL = "https://mitiendapro.com/api/v1/send"
DEFAULT_COUNTRY = "34"  # España


def _normalize_number(number: str) -> str | None:
    """Deja el número solo en dígitos con prefijo de país. Devuelve None si no es válido."""
    if not number:
        return None
    digits = re.sub(r"\D", "", str(number))
    if digits.startswith("00"):
        digits = digits[2:]
    if len(digits) == 9:  # número nacional sin prefijo
        digits = DEFAULT_COUNTRY + digits
    if len(digits) < 10:
        return None
    return digits


async def send_whatsapp(number: str, message: str, type: str = "text", media_url: str | None = None) -> bool:
    """Envía un WhatsApp. No lanza excepción: devuelve True/False y registra el error.

    opciones:
      - type: "text" | "image" | "video" | "document" | "audio"
      - media_url: URL del archivo (obligatorio si type != "text")
    """
    api_key = os.environ.get("WHATSAPP_API_KEY")
    instance = os.environ.get("WHATSAPP_INSTANCE_NAME")
    url = os.environ.get("WHATSAPP_API_URL", DEFAULT_URL)
    if not api_key or not instance:
        logger.warning("WhatsApp no configurado (falta WHATSAPP_API_KEY/WHATSAPP_INSTANCE_NAME)")
        return False

    to = _normalize_number(number)
    if not to:
        logger.warning("WhatsApp: número no válido: %s", number)
        return False

    payload = {"instanceName": instance, "number": to, "type": type, "message": message or ""}
    if type != "text":
        if not media_url:
            logger.warning("WhatsApp: type=%s requiere media_url", type)
            return False
        payload["mediaUrl"] = media_url

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(url, json=payload, headers=headers)
        if r.status_code >= 400:
            logger.warning("WhatsApp error %s: %s", r.status_code, r.text[:200])
            return False
        return True
    except Exception as e:  # noqa
        logger.warning("WhatsApp request failed: %s", e)
        return False
