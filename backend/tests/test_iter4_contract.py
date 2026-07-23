"""Iteration 4: Contract generation & signing tests (Goroky CRM)."""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@goroky.com"
ADMIN_PASSWORD = "Goroky2026!"
CLIENT_EMAIL = "cliente@goroky.com"
CLIENT_PASSWORD = "Cliente2026!"


# --- Helpers / fixtures ---
def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def client_token():
    return _login(CLIENT_EMAIL, CLIENT_PASSWORD)


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def client_headers(client_token):
    return {"Authorization": f"Bearer {client_token}"}


@pytest.fixture(scope="module")
def created_order(admin_headers):
    """Create an order used by multiple tests."""
    payload = {
        "fiscalId": "12345678A",
        "productId": "1412",
        "portability": True,
        "donorOperatorId": "003",
    }
    r = requests.post(f"{API}/orders", json=payload, headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"Create order failed: {r.status_code} {r.text}"
    body = r.json()
    return body


# --- Tests: creación de orden con contrato ---
class TestOrderCreationWithContract:
    def test_order_returns_contract_and_invoice(self, created_order):
        assert "order" in created_order
        assert "invoiceNumber" in created_order and created_order["invoiceNumber"]
        assert "invoiceId" in created_order and created_order["invoiceId"]
        assert "contractNumber" in created_order and created_order["contractNumber"]
        # Format CTR-YYYY-#####
        assert re.match(r"^CTR-\d{4}-\d{5}$", created_order["contractNumber"]), \
            f"Bad contractNumber format: {created_order['contractNumber']}"
        order = created_order["order"]
        assert order["signed"] is False
        assert order["portability"] is True
        assert order["donorOperatorId"] == "003"
        assert order["contractNumber"] == created_order["contractNumber"]

    def test_order_visible_in_list(self, created_order, admin_headers):
        order_id = created_order["order"]["orderId"]
        r = requests.get(f"{API}/orders", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        orders = r.json()
        found = next((o for o in orders if o.get("orderId") == order_id), None)
        assert found is not None, "Order not found in GET /orders"
        assert found["contractNumber"] == created_order["contractNumber"]
        assert found.get("signed") is False


# --- Tests: PDF del contrato ---
class TestContractPDF:
    def test_admin_can_download_contract_pdf(self, created_order, admin_headers):
        order_id = created_order["order"]["orderId"]
        r = requests.get(f"{API}/orders/{order_id}/contract/pdf",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"PDF download failed: {r.status_code} {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("application/pdf"), \
            f"Bad content-type: {r.headers.get('content-type')}"
        assert r.content[:4] == b"%PDF", f"Not a valid PDF: {r.content[:10]}"
        assert len(r.content) > 1500, "PDF suspiciously small"

    def test_contract_pdf_not_found(self, admin_headers):
        r = requests.get(f"{API}/orders/does-not-exist/contract/pdf",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 404


# --- Tests: firma del contrato ---
class TestContractSign:
    def test_sign_contract(self, created_order, admin_headers):
        order_id = created_order["order"]["orderId"]
        r = requests.post(f"{API}/orders/{order_id}/contract/sign",
                          headers=admin_headers, timeout=20)
        assert r.status_code == 200, f"Sign failed: {r.status_code} {r.text}"
        assert r.json().get("ok") is True

    def test_signed_flag_persisted(self, created_order, admin_headers):
        order_id = created_order["order"]["orderId"]
        r = requests.get(f"{API}/orders", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        found = next((o for o in r.json() if o.get("orderId") == order_id), None)
        assert found is not None
        assert found.get("signed") is True

    def test_pdf_still_works_after_sign(self, created_order, admin_headers):
        order_id = created_order["order"]["orderId"]
        r = requests.get(f"{API}/orders/{order_id}/contract/pdf",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_sign_unknown_order_404(self, admin_headers):
        r = requests.post(f"{API}/orders/unknown-id/contract/sign",
                          headers=admin_headers, timeout=20)
        assert r.status_code == 404


# --- Tests: scoping de cliente ---
class TestContractScoping:
    def test_client_cannot_download_other_customer_contract(self, admin_headers, client_headers):
        """Create an order for another fiscalId as admin, and try to GET as client -> 403."""
        # Use a customer that is NOT the client's fiscalId (client is 12345678A).
        # Fetch customers to find one different.
        rc = requests.get(f"{API}/customers", headers=admin_headers, timeout=20)
        assert rc.status_code == 200
        other = next((c for c in rc.json() if c.get("fiscalId") and c["fiscalId"] != "12345678A"), None)
        if not other:
            pytest.skip("No hay otro cliente para probar scoping")
        payload = {
            "fiscalId": other["fiscalId"], "productId": "1412",
            "portability": False, "donorOperatorId": None,
        }
        r = requests.post(f"{API}/orders", json=payload, headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"Create order for other customer failed: {r.text}"
        other_order_id = r.json()["order"]["orderId"]

        # Try to download as client -> 403
        r2 = requests.get(f"{API}/orders/{other_order_id}/contract/pdf",
                          headers=client_headers, timeout=20)
        assert r2.status_code == 403, \
            f"Expected 403, got {r2.status_code} {r2.text[:200]}"

    def test_client_can_download_own_contract(self, admin_headers, client_headers):
        # Create an order for the client's own fiscalId (12345678A).
        payload = {
            "fiscalId": "12345678A", "productId": "1412",
            "portability": False, "donorOperatorId": None,
        }
        r = requests.post(f"{API}/orders", json=payload, headers=admin_headers, timeout=30)
        assert r.status_code == 200
        own_order_id = r.json()["order"]["orderId"]

        r2 = requests.get(f"{API}/orders/{own_order_id}/contract/pdf",
                          headers=client_headers, timeout=30)
        assert r2.status_code == 200, f"Client cannot GET own contract: {r2.status_code} {r2.text[:200]}"
        assert r2.content[:4] == b"%PDF"


# --- Regression: fibra genera instalación (sin romper) ---
class TestRegressionFiberInstallation:
    def test_create_fiber_order_generates_installation(self, admin_headers):
        # Find a Fiber product
        rp = requests.get(f"{API}/products", headers=admin_headers, timeout=20)
        assert rp.status_code == 200
        fiber = next((p for p in rp.json() if p.get("family") == "Fiber" and p.get("type") == "Main"), None)
        if not fiber:
            pytest.skip("No hay producto de fibra Main")
        payload = {"fiscalId": "12345678A", "productId": str(fiber["productId"]),
                   "portability": False, "donorOperatorId": None}
        r = requests.post(f"{API}/orders", json=payload, headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"Fiber order failed: {r.text}"
        body = r.json()
        assert body.get("contractNumber")
        assert body.get("invoiceNumber")
        # Installations should have been created
        ri = requests.get(f"{API}/installations", headers=admin_headers, timeout=20)
        if ri.status_code == 200:
            installs = ri.json()
            found = any(inst.get("lineNumber") == body["order"]["lineNumber"] for inst in installs)
            assert found, "No installation entry for the fiber order"
