"""Iteration 20 — Reseller billing panel: list/detail, single+bulk assignment, SEPA/charge guards."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@goroky.com"
ADMIN_PASSWORD = "Goroky2026!"
TEST_FID = "12345678A"


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def reseller_id(admin_client):
    r = admin_client.get(f"{API}/resellers", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list) and len(data) > 0, "need at least one reseller user"
    # pick revendedor@goroky.com if present
    pick = next((x for x in data if x.get("email") == "revendedor@goroky.com"), data[0])
    assert pick.get("id")
    return pick["id"]


# ---------- GET /resellers ----------
def test_list_resellers_structure(admin_client):
    r = admin_client.get(f"{API}/resellers", timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    for item in data:
        for k in ("id", "name", "email", "mandate", "clients", "pendingCount", "pendingTotal"):
            assert k in item, f"missing {k} in reseller item"
        assert isinstance(item["clients"], int)
        assert isinstance(item["pendingCount"], int)
        assert isinstance(item["pendingTotal"], (int, float))


# ---------- GET /resellers/{id} ----------
def test_reseller_detail(admin_client, reseller_id):
    r = admin_client.get(f"{API}/resellers/{reseller_id}", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "reseller" in data and "clients" in data and "pendingTotal" in data
    assert data["reseller"]["id"] == reseller_id


def test_reseller_detail_404(admin_client):
    r = admin_client.get(f"{API}/resellers/507f1f77bcf86cd799439011", timeout=20)
    assert r.status_code in (400, 404)


# ---------- single + bulk assignment ----------
def test_assign_single_customer_reseller(admin_client, reseller_id):
    # Assign
    r = admin_client.post(f"{API}/customers/{TEST_FID}/reseller", json={"resellerId": reseller_id}, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["billingResellerId"] == reseller_id

    # Verify in reseller detail
    det = admin_client.get(f"{API}/resellers/{reseller_id}", timeout=20).json()
    fids = [c["fiscalId"] for c in det.get("clients", [])]
    assert TEST_FID in fids, f"customer {TEST_FID} not found in reseller clients"

    # Pending total should be >= 0 (expected ~19.99)
    assert det["pendingTotal"] >= 0


def test_assign_invalid_reseller(admin_client):
    r = admin_client.post(f"{API}/customers/{TEST_FID}/reseller",
                          json={"resellerId": "507f1f77bcf86cd799439011"}, timeout=20)
    assert r.status_code == 400


def test_bulk_assign_reseller(admin_client, reseller_id):
    r = admin_client.post(f"{API}/customers/bulk-reseller",
                          json={"fiscalIds": [TEST_FID], "resellerId": reseller_id}, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["billingResellerId"] == reseller_id


def test_bulk_assign_empty_fails(admin_client, reseller_id):
    r = admin_client.post(f"{API}/customers/bulk-reseller",
                          json={"fiscalIds": [], "resellerId": reseller_id}, timeout=20)
    assert r.status_code == 400


def test_unassign_single(admin_client, reseller_id):
    # Unassign
    r = admin_client.post(f"{API}/customers/{TEST_FID}/reseller", json={"resellerId": None}, timeout=20)
    assert r.status_code == 200
    assert r.json()["billingResellerId"] is None
    # Re-assign for next tests
    admin_client.post(f"{API}/customers/{TEST_FID}/reseller", json={"resellerId": reseller_id}, timeout=20)


# ---------- SEPA + charge guards (expired Stripe key tolerated) ----------
def test_sepa_link_handled_gracefully(admin_client, reseller_id):
    r = admin_client.post(f"{API}/resellers/{reseller_id}/sepa-link",
                          json={"iban": "DE89370400440532013000",
                                "origin_url": "https://likes-telecom-app.preview.emergentagent.com"},
                          timeout=30)
    # Expected: 200 if Stripe key valid, else 400 (expired). Never 500.
    assert r.status_code in (200, 400), f"unexpected {r.status_code}: {r.text}"
    assert r.status_code != 500


def test_charge_pending_no_mandate_returns_400(admin_client, reseller_id):
    r = admin_client.post(f"{API}/resellers/{reseller_id}/charge-pending", json={}, timeout=20)
    # Reseller has no SEPA mandate signed (Stripe expired) → expect 400 w/ Spanish message
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    detail = r.json().get("detail", "")
    assert "mandato SEPA" in detail or "revendedor" in detail.lower(), f"unexpected detail: {detail}"
