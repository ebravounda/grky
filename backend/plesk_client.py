"""Cliente ligero de la API REST de Plesk (v2). Todas las llamadas son fail-safe:
devuelven (data, error). Se ejecuta contra el propio host (https://127.0.0.1:8443)
usando una API key (X-API-Key). En preview (sin Plesk) devuelven error controlado."""
import os
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def _cfg(db_cfg=None):
    db_cfg = db_cfg or {}
    host = (db_cfg.get("pleskHost") or os.environ.get("PLESK_HOST") or "https://127.0.0.1:8443").rstrip("/")
    key = db_cfg.get("pleskApiKey") or os.environ.get("PLESK_API_KEY") or ""
    return host, key


def configured(db_cfg=None):
    _, key = _cfg(db_cfg)
    return bool(key)


def _headers(key):
    return {"X-API-Key": key, "Content-Type": "application/json", "Accept": "application/json"}


def list_domains(db_cfg=None):
    host, key = _cfg(db_cfg)
    if not key:
        return None, "Plesk no configurado"
    try:
        r = requests.get(f"{host}/api/v2/domains", headers=_headers(key), verify=False, timeout=15)
        if r.status_code != 200:
            return None, f"HTTP {r.status_code}: {r.text[:200]}"
        return r.json(), None
    except Exception as e:  # noqa
        return None, str(e)[:200]


def cli_call(util, params, db_cfg=None):
    """Invoca una utilidad CLI de Plesk vía /api/v2/cli/{util}/call."""
    host, key = _cfg(db_cfg)
    if not key:
        return None, "Plesk no configurado"
    try:
        r = requests.post(f"{host}/api/v2/cli/{util}/call", headers=_headers(key),
                          json={"params": params}, verify=False, timeout=30)
        if r.status_code not in (200, 201):
            return None, f"HTTP {r.status_code}: {r.text[:200]}"
        return r.json(), None
    except Exception as e:  # noqa
        return None, str(e)[:200]


def domain_info(name, db_cfg=None):
    """Texto con uso de disco y tráfico del dominio (plesk bin domain --info)."""
    return cli_call("domain", ["--info", name], db_cfg)


def login_link(db_cfg=None):
    """Enlace de login de un solo uso al panel de Plesk (admin)."""
    return cli_call("admin", ["--get-login-link"], db_cfg)


def test_connection(db_cfg=None):
    data, err = list_domains(db_cfg)
    if err:
        return {"ok": False, "error": err}
    n = len(data) if isinstance(data, list) else 0
    return {"ok": True, "domains": n}
