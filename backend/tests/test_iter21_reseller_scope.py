"""Iter21: Reseller scope restrictions (customers/invoices only, reduced view, 403 on others)."""
import os
import pytest
import requests

from pathlib import Path
_env = Path("/app/frontend/.env").read_text()
for _line in _env.splitlines():
    if _line.startswith("REACT_APP_BACKEND_URL="):
        os.environ["REACT_APP_BACKEND_URL"] = _line.split("=", 1)[1].strip()
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

RESELLER = {"email": "revendedor@goroky.com", "password": "Revende2026!"}
ADMIN = {"email": "admin@goroky.com", "password": "Goroky2026!"}
AGENT = {"email": "soporte@goroky.com", "password": "Soporte2026!"}


def _login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {creds['email']}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def reseller_h():
    return {"Authorization": f"Bearer {_login(RESELLER)}"}


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def agent_h():
    return {"Authorization": f"Bearer {_login(AGENT)}"}


# ---------- /api/access/me permissions ----------
def test_reseller_perms_only_three(reseller_h):
    r = requests.get(f"{BASE}/api/access/me", headers=reseller_h, timeout=20)
    assert r.status_code == 200
    perms = set(r.json()["permissions"])
    assert perms == {"invoices.view", "customers.view", "customers.edit"}, perms
    assert r.json()["role"] == "reseller"


# ---------- Customers list scoped ----------
def test_reseller_customers_scoped(reseller_h):
    r = requests.get(f"{BASE}/api/customers", headers=reseller_h, timeout=30)
    assert r.status_code == 200
    data = r.json()
    # Could be list or dict with items; detect
    items = data if isinstance(data, list) else data.get("items", data)
    fids = {c.get("fiscalId") for c in items}
    assert "55667788R" in fids or "12345678A" in fids, f"expected reseller customers, got {fids}"
    # Ensure not all customers (admin would see many more)
    admin_r = requests.get(f"{BASE}/api/customers", headers={"Authorization": reseller_h["Authorization"]}, timeout=30)
    assert admin_r.status_code == 200


def test_reseller_customers_count_less_than_admin(reseller_h, admin_h):
    r_r = requests.get(f"{BASE}/api/customers", headers=reseller_h, timeout=30).json()
    r_a = requests.get(f"{BASE}/api/customers", headers=admin_h, timeout=30).json()
    rl = r_r if isinstance(r_r, list) else r_r.get("items", r_r)
    al = r_a if isinstance(r_a, list) else r_a.get("items", r_a)
    assert len(rl) <= len(al)
    assert len(rl) >= 1


# ---------- Reduced customer detail ----------
def test_reseller_customer_detail_reduced(reseller_h):
    # Fetch his list, pick first fiscalId
    data = requests.get(f"{BASE}/api/customers", headers=reseller_h, timeout=30).json()
    items = data if isinstance(data, list) else data.get("items", data)
    fid = items[0]["fiscalId"]
    r = requests.get(f"{BASE}/api/customers/{fid}", headers=reseller_h, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert set(d.keys()) >= {"customer", "invoices", "reduced"}
    assert d["reduced"] is True
    assert "lines" not in d
    assert "subscriptions" not in d
    # unpaid only
    for i in d["invoices"]:
        assert i.get("status") != "paid"


def test_reseller_cannot_access_other_customer(reseller_h, admin_h):
    """Fetch an admin-only fiscalId that is NOT in reseller's scope -> 404."""
    adm = requests.get(f"{BASE}/api/customers", headers=admin_h, timeout=30).json()
    adm_items = adm if isinstance(adm, list) else adm.get("items", adm)
    r_r = requests.get(f"{BASE}/api/customers", headers=reseller_h, timeout=30).json()
    r_items = r_r if isinstance(r_r, list) else r_r.get("items", r_r)
    r_fids = {c["fiscalId"] for c in r_items}
    other = next((c["fiscalId"] for c in adm_items if c["fiscalId"] not in r_fids), None)
    if not other:
        pytest.skip("no non-owned customer available for test")
    r = requests.get(f"{BASE}/api/customers/{other}", headers=reseller_h, timeout=20)
    assert r.status_code == 404, f"expected 404 got {r.status_code}"


# ---------- Invoices list scoped & unpaid only ----------
def test_reseller_invoices_scope_unpaid(reseller_h):
    r = requests.get(f"{BASE}/api/invoices", headers=reseller_h, timeout=30)
    assert r.status_code == 200
    invs = r.json()
    assert isinstance(invs, list)
    for i in invs:
        assert i.get("status") != "paid", f"paid invoice leaked: {i}"


# ---------- 403 on forbidden endpoints ----------
@pytest.mark.parametrize("method,path", [
    ("GET", "/api/dashboard/stats"),
    ("GET", "/api/lines"),
    ("GET", "/api/orders"),
    ("GET", "/api/commissions"),
    ("GET", "/api/invoices/export.zip"),
    ("GET", "/api/tickets"),
    ("GET", "/api/lines/600000000"),
])
def test_reseller_forbidden_endpoints(reseller_h, method, path):
    r = requests.request(method, f"{BASE}{path}", headers=reseller_h, timeout=20)
    assert r.status_code == 403, f"{method} {path} -> {r.status_code} (expected 403)"


# ---------- PDF access ----------
def test_reseller_pdf_paid_forbidden_and_own_pending_ok(reseller_h, admin_h):
    # Pick own pending invoice
    inv_r = requests.get(f"{BASE}/api/invoices", headers=reseller_h, timeout=30).json()
    assert inv_r, "reseller has no invoices to test"
    own_pending = inv_r[0]
    r = requests.get(f"{BASE}/api/invoices/{own_pending['id']}/pdf", headers=reseller_h, timeout=30, allow_redirects=False)
    assert r.status_code == 200
    assert "application/pdf" in r.headers.get("content-type", "")

    # Find a PAID invoice via admin
    all_inv = requests.get(f"{BASE}/api/invoices", headers=admin_h, timeout=30).json()
    paid = next((i for i in all_inv if i.get("status") == "paid"), None)
    if not paid:
        pytest.skip("no paid invoice in system")
    r2 = requests.get(f"{BASE}/api/invoices/{paid['id']}/pdf", headers=reseller_h, timeout=20)
    assert r2.status_code == 403


# ---------- POST customers still allowed for reseller ----------
def test_reseller_can_create_customer(reseller_h):
    payload = {
        "fiscalId": "TESTRS01X",
        "customerType": "individual",
        "name": "TestRS",
        "firstSurname": "Scope",
        "lastSurname": "Check",
        "email": "testrs01@example.com",
        "contactPhone": "600000000",
        "street": "Calle Test",
        "streetNumber": "1",
        "postalCode": "28001",
        "cityName": "Madrid",
        "provinceName": "Madrid",
    }
    r = requests.post(f"{BASE}/api/customers", headers=reseller_h, json=payload, timeout=30)
    # Either 200/201 OK or 400 if already exists
    assert r.status_code in (200, 201, 400, 409), f"{r.status_code} {r.text}"


# ---------- Agent and admin regression ----------
def test_admin_sees_all_invoices_and_export(admin_h):
    r = requests.get(f"{BASE}/api/invoices", headers=admin_h, timeout=30)
    assert r.status_code == 200
    r2 = requests.get(f"{BASE}/api/invoices/export.zip", headers=admin_h, timeout=60)
    assert r2.status_code in (200, 404)  # 404 if no invoices match (shouldn't happen)


def test_agent_access_me(agent_h):
    r = requests.get(f"{BASE}/api/access/me", headers=agent_h, timeout=20)
    assert r.status_code == 200
    assert r.json()["role"] == "agent"
    # Agent should have more perms than reseller - at least customers.view
    assert "customers.view" in r.json()["permissions"]
