"""Iteration 10 tests: catálogo dinámico, sync/delete tarifas, y customerType/fiscalIdType en clientes y aplicaciones."""
import os
import time
import pytest
import requests

def _load_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    return ln.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    return ""

BASE_URL = _load_url()
ADMIN_EMAIL = "admin@goroky.com"
ADMIN_PASS = "Goroky2026!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# --- Public catalog dynamic grouping ---
def test_public_catalog_dynamic_grouping():
    r = requests.get(f"{BASE_URL}/api/public/catalog")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    # Only families with products should be present
    for fam, items in data.items():
        assert isinstance(items, list)
        assert len(items) > 0, f"Family {fam} is empty but returned"
    # Order should respect defined ordering
    order = ["Mobile", "Fiber", "M2M", "PBX", "TV", "Satellite", "Bonos", "Paquetes"]
    keys = list(data.keys())
    idxs = [order.index(k) for k in keys if k in order]
    assert idxs == sorted(idxs), f"Families not in expected order: {keys}"


# --- Likes sync (controlled response) ---
def test_sync_catalog_controlled(h):
    r = requests.post(f"{BASE_URL}/api/likes/sync-catalog", headers=h)
    # In preview Likes is MOCK/403 → server should respond controlled: 503 with detail OR 200 with {synced:N}
    assert r.status_code in (200, 503), f"Unexpected status {r.status_code}: {r.text}"
    if r.status_code == 200:
        data = r.json()
        assert "synced" in data
        assert isinstance(data["synced"], int)
    else:
        assert "detail" in r.json()


# --- Delete all tariffs endpoint exists (do not execute destructively) ---
def test_delete_all_tariffs_requires_auth():
    r = requests.delete(f"{BASE_URL}/api/tariffs")
    # no token = 401/403
    assert r.status_code in (401, 403)


# --- Tariff update: marketingText persistence ---
def test_tariff_update_marketing_text(h):
    # find an existing tariff
    r = requests.get(f"{BASE_URL}/api/tariffs", headers=h)
    assert r.status_code == 200
    tariffs = r.json()
    assert len(tariffs) > 0
    t = tariffs[0]
    pid = t["productId"]
    new_mt = ["Datos: 30 GB", "Minutos: Ilimitados", "SMS: 100"]
    body = {k: v for k, v in t.items() if k not in ("_id", "id", "created")}
    body["features"] = new_mt
    upd = requests.put(f"{BASE_URL}/api/tariffs/{pid}",
                      headers=h, json=body)
    assert upd.status_code == 200, upd.text
    # verify persistence
    r2 = requests.get(f"{BASE_URL}/api/tariffs", headers=h)
    found = next((x for x in r2.json() if x["productId"] == pid), None)
    assert found is not None
    mt = found.get("marketingText") or []
    # marketingText is stored as list of {title, value} for "Title: Value" or plain strings
    def norm(x):
        if isinstance(x, dict):
            return f"{x.get('title','')}: {x.get('value','')}"
        return x
    normalized = [norm(x) for x in mt]
    assert normalized == new_mt, f"Got {normalized}"


# --- Create customer with customerType + fiscalIdType ---
def test_create_customer_with_types(h):
    fid = f"TEST{int(time.time())}Z"
    payload = {
        "fiscalId": fid,
        "customerType": "Freelance",
        "fiscalIdType": "NIE",
        "name": "TEST_Autonomo",
        "firstSurname": "Prueba",
        "lastSurname": "QA",
        "email": f"testqa_{int(time.time())}@example.com",
        "contactPhone": "600000001",
    }
    r = requests.post(f"{BASE_URL}/api/customers", headers=h, json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["customerType"] == "Freelance"
    assert body["fiscalIdType"] == "NIE"

    # GET to verify persistence
    g = requests.get(f"{BASE_URL}/api/customers/{fid}", headers=h)
    assert g.status_code == 200
    cust = g.json()["customer"]
    assert cust["customerType"] == "Freelance"
    assert cust["fiscalIdType"] == "NIE"


# --- Create customer as Society + CIF ---
def test_create_customer_society_cif(h):
    fid = f"TESTB{int(time.time())}"
    payload = {
        "fiscalId": fid,
        "customerType": "Society",
        "fiscalIdType": "CIF",
        "name": "TEST_Empresa SL",
        "email": f"testcif_{int(time.time())}@example.com",
        "contactPhone": "600000002",
    }
    r = requests.post(f"{BASE_URL}/api/customers", headers=h, json=payload)
    assert r.status_code == 200
    assert r.json()["customerType"] == "Society"
    assert r.json()["fiscalIdType"] == "CIF"


# --- Public application create with customerType + docType ---
def test_public_application_with_types():
    # find a mobile product
    cat = requests.get(f"{BASE_URL}/api/public/catalog").json()
    pid = None
    for fam in ("Mobile", "Fiber"):
        if cat.get(fam):
            pid = cat[fam][0]["productId"]
            break
    assert pid, "No public product available"
    payload = {
        "productId": pid,
        "customerType": "Residential",
        "docType": "DNI",
        "fiscalId": "00000001R",
        "name": "TEST_Publico",
        "firstSurname": "QA",
        "address": "Calle Test 1",
        "city": "Madrid",
        "postalCode": "28001",
        "province": "Madrid",
        "contactPhone": "600000010",
        "email": f"pubapp_{int(time.time())}@example.com",
        "acceptedTerms": True,
        "paymentMethod": "sepa",
        "simType": "esim",
        "lineType": "new",
    }
    r = requests.post(f"{BASE_URL}/api/public/applications", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "token" in body and "contractCode" in body
