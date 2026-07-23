"""
Backend regression tests for Goroky Telecom CRM.
Covers: auth, dashboard, customers, lines, catalog, orders/invoicing, invoices,
payments (Stripe), tickets, subscriptions, client portal + scoping.
"""
import os
import io
import uuid
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://likes-telecom-app.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@goroky.com"
ADMIN_PASS = "Goroky2026!"
CLIENT_EMAIL = "cliente@goroky.com"
CLIENT_PASS = "Cliente2026!"


# ---------------- fixtures ----------------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def client_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": CLIENT_EMAIL, "password": CLIENT_PASS}, timeout=20)
    assert r.status_code == 200, f"client login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- auth ----------------
class TestAuth:
    def test_login_admin_ok(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and isinstance(data["token"], str)
        assert data["user"]["role"] == "admin"
        assert data["user"]["email"] == ADMIN_EMAIL

    def test_login_client_ok(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": CLIENT_EMAIL, "password": CLIENT_PASS}, timeout=20)
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["role"] == "client"
        assert u["fiscalId"] == "12345678A"

    def test_login_bad_creds(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=20)
        assert r.status_code == 401

    def test_me_with_bearer(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_me_no_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=20)
        assert r.status_code == 401


# ---------------- dashboard ----------------
class TestDashboard:
    def test_stats_admin(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ["customers", "activeLines", "revenue", "pendingInvoices", "linesByFamily", "connection"]:
            assert k in d
        assert d["connection"]["live"] is False  # mock mode
        assert d["customers"] >= 3
        assert isinstance(d["linesByFamily"], list)

    def test_stats_client_forbidden(self, client_token):
        r = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=_h(client_token), timeout=20)
        assert r.status_code == 403


# ---------------- catalog ----------------
class TestCatalog:
    def test_products(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/products", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        prods = r.json()
        assert isinstance(prods, list) and len(prods) > 0
        assert all("productId" in p and "price" in p and "family" in p for p in prods)

    def test_products_filter(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/products?family=Mobile", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        prods = r.json()
        assert len(prods) > 0
        assert all(p["family"] == "Mobile" for p in prods)

    def test_donor_operators(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/donor-operators", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) > 0

    def test_ticket_typologies(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/ticket-typologies", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) > 0

    def test_coverage(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/coverage", headers=_h(admin_token),
                          json={"address": "Calle Mayor 1, Madrid"}, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), (list, dict))


# ---------------- customers ----------------
class TestCustomers:
    def test_list(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/customers", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert any("linesCount" in c for c in r.json())

    def test_create_and_get(self, admin_token):
        unique_id = f"T{uuid.uuid4().hex[:8].upper()}"
        payload = {
            "fiscalId": unique_id, "customerType": "Residential",
            "name": "TEST_Cliente", "firstSurname": "Prueba", "lastSurname": "QA",
            "email": f"test_{unique_id.lower()}@qa.com", "contactPhone": "600000000",
            "street": "Calle Test", "cityName": "Madrid", "provinceName": "Madrid",
        }
        r = requests.post(f"{BASE_URL}/api/customers", headers=_h(admin_token),
                          json=payload, timeout=20)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["fiscalId"] == unique_id
        # GET by fiscalId
        r2 = requests.get(f"{BASE_URL}/api/customers/{unique_id}",
                          headers=_h(admin_token), timeout=20)
        assert r2.status_code == 200
        det = r2.json()
        assert det["customer"]["fiscalId"] == unique_id
        assert isinstance(det["lines"], list)

    def test_create_duplicate_400(self, admin_token):
        payload = {
            "fiscalId": "12345678A", "name": "X", "email": "x@x.com",
            "contactPhone": "1",
        }
        r = requests.post(f"{BASE_URL}/api/customers", headers=_h(admin_token),
                          json=payload, timeout=20)
        assert r.status_code == 400


# ---------------- lines ----------------
class TestLines:
    def test_list_admin(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/lines", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) > 0

    def test_detail_and_toggle_block(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/lines", headers=_h(admin_token), timeout=20)
        line = next(l for l in r.json() if l["status"] == "ACTIVE")
        ln = line["lineNumber"]
        # detail
        d = requests.get(f"{BASE_URL}/api/lines/{ln}", headers=_h(admin_token), timeout=20).json()
        assert "svas" in d and "cdrs" in d
        # toggle to SUSPENDED
        t = requests.post(f"{BASE_URL}/api/lines/{ln}/toggle-block",
                         headers=_h(admin_token), timeout=20).json()
        assert t["status"] == "SUSPENDED"
        # toggle back
        t2 = requests.post(f"{BASE_URL}/api/lines/{ln}/toggle-block",
                          headers=_h(admin_token), timeout=20).json()
        assert t2["status"] == "ACTIVE"

    def test_update_sva(self, admin_token):
        lines = requests.get(f"{BASE_URL}/api/lines", headers=_h(admin_token), timeout=20).json()
        ln = lines[0]["lineNumber"]
        detail = requests.get(f"{BASE_URL}/api/lines/{ln}", headers=_h(admin_token), timeout=20).json()
        svas = detail.get("svas") or []
        if not svas:
            pytest.skip("no svas")
        target = svas[0]
        new_status = "INACTIVE" if target["status"] == "ACTIVE" else "ACTIVE"
        r = requests.put(f"{BASE_URL}/api/lines/{ln}/svas",
                         headers=_h(admin_token),
                         json={"svas": [{"code": target["code"], "status": new_status}]},
                         timeout=20)
        assert r.status_code == 200
        assert any(s["code"] == target["code"] and s["status"] == new_status for s in r.json()["svas"])


# ---------------- orders / invoicing ----------------
class TestOrders:
    def test_create_order_with_invoice(self, admin_token):
        prods = requests.get(f"{BASE_URL}/api/products?family=Mobile",
                             headers=_h(admin_token), timeout=20).json()
        pid = prods[0]["productId"]
        r = requests.post(f"{BASE_URL}/api/orders", headers=_h(admin_token),
                          json={"fiscalId": "45678912C", "productId": pid}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "invoiceId" in d and "invoiceNumber" in d
        assert d["invoiceNumber"].startswith("GRK-")
        # listing
        orders = requests.get(f"{BASE_URL}/api/orders", headers=_h(admin_token), timeout=20).json()
        assert any(o["orderId"] == d["order"]["orderId"] for o in orders)
        # PDF
        pdf = requests.get(f"{BASE_URL}/api/invoices/{d['invoiceId']}/pdf",
                          headers=_h(admin_token), timeout=20)
        assert pdf.status_code == 200
        assert pdf.headers.get("content-type", "").startswith("application/pdf")
        assert pdf.content[:4] == b"%PDF"


# ---------------- invoices ----------------
class TestInvoices:
    def test_list_admin(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/invoices", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) > 0

    def test_list_client_scoped(self, client_token):
        r = requests.get(f"{BASE_URL}/api/invoices", headers=_h(client_token), timeout=20)
        assert r.status_code == 200
        invs = r.json()
        assert all(i["fiscalId"] == "12345678A" for i in invs)


# ---------------- payments ----------------
class TestPayments:
    def test_stripe_checkout(self, admin_token):
        invs = requests.get(f"{BASE_URL}/api/invoices",
                            headers=_h(admin_token), timeout=20).json()
        pending = next((i for i in invs if i["status"] == "pending"), None)
        assert pending, "no pending invoice"
        r = requests.post(f"{BASE_URL}/api/payments/checkout", headers=_h(admin_token),
                          json={"invoiceId": pending["id"],
                                "origin_url": BASE_URL}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["checkout_url"].startswith("https://")
        assert d["session_id"].startswith("cs_")
        # status
        s = requests.get(f"{BASE_URL}/api/payments/status/{d['session_id']}",
                        headers=_h(admin_token), timeout=20)
        assert s.status_code == 200
        assert s.json()["session_id"] == d["session_id"]


# ---------------- tickets ----------------
class TestTickets:
    def test_create_and_list(self, admin_token):
        typs = requests.get(f"{BASE_URL}/api/ticket-typologies",
                            headers=_h(admin_token), timeout=20).json()
        # typology can be dict or str
        typ0 = typs[0]
        typology = typ0.get("name") if isinstance(typ0, dict) else typ0
        category = typ0.get("category", "General") if isinstance(typ0, dict) else "General"
        r = requests.post(f"{BASE_URL}/api/tickets", headers=_h(admin_token),
                          json={"category": category, "typology": typology,
                                "description": "TEST_ticket"}, timeout=20)
        assert r.status_code == 200
        assert r.json()["ticketId"]
        lst = requests.get(f"{BASE_URL}/api/tickets", headers=_h(admin_token), timeout=20)
        assert lst.status_code == 200


# ---------------- subscriptions / change tariff ----------------
class TestSubscriptions:
    def test_list_and_change_tariff(self, admin_token):
        subs = requests.get(f"{BASE_URL}/api/subscriptions?fiscalId=45678912C",
                            headers=_h(admin_token), timeout=20).json()
        assert isinstance(subs, list)
        if not subs:
            pytest.skip("no subs for 45678912C")
        sub = subs[0]
        prods = requests.get(f"{BASE_URL}/api/products?family=" + sub["family"],
                             headers=_h(admin_token), timeout=20).json()
        current_pid = sub["products"][0]["productId"]
        alt = next((p for p in prods if p["productId"] != current_pid), None)
        if not alt:
            pytest.skip("no alt product")
        r = requests.post(f"{BASE_URL}/api/subscriptions/change-tariff",
                          headers=_h(admin_token),
                          json={"subscriptionId": sub["subscriptionId"],
                                "newProductId": alt["productId"]}, timeout=20)
        assert r.status_code == 200
        assert r.json()["success"] is True


# ---------------- client portal + scoping ----------------
class TestPortal:
    def test_me_summary(self, client_token):
        r = requests.get(f"{BASE_URL}/api/me/summary",
                         headers=_h(client_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ["customer", "lines", "subscriptions", "invoices",
                  "tickets", "monthlyTotal", "pendingInvoices"]:
            assert k in d
        assert d["customer"]["fiscalId"] == "12345678A"
        assert len(d["lines"]) >= 1

    def test_scoping_line_forbidden(self, client_token, admin_token):
        # find a line NOT belonging to client
        lines = requests.get(f"{BASE_URL}/api/lines", headers=_h(admin_token), timeout=20).json()
        foreign = next((l for l in lines if l["fiscalId"] != "12345678A"), None)
        assert foreign
        r = requests.get(f"{BASE_URL}/api/lines/{foreign['lineNumber']}",
                         headers=_h(client_token), timeout=20)
        assert r.status_code == 403

    def test_scoping_invoice_pdf_forbidden(self, client_token, admin_token):
        invs = requests.get(f"{BASE_URL}/api/invoices",
                            headers=_h(admin_token), timeout=20).json()
        foreign = next((i for i in invs if i["fiscalId"] != "12345678A"), None)
        assert foreign
        r = requests.get(f"{BASE_URL}/api/invoices/{foreign['id']}/pdf",
                         headers=_h(client_token), timeout=20)
        assert r.status_code == 403

    def test_scoping_customer_forbidden(self, client_token):
        r = requests.get(f"{BASE_URL}/api/customers/B87654321",
                         headers=_h(client_token), timeout=20)
        assert r.status_code == 403

    def test_scoping_customers_list_forbidden(self, client_token):
        r = requests.get(f"{BASE_URL}/api/customers",
                         headers=_h(client_token), timeout=20)
        assert r.status_code == 403
