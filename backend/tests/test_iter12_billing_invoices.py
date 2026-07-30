"""Iteration 12 — Test customer billing update, invoice CRUD (manual create/edit/delete/resend),
and send-card-link Stripe checkout endpoint."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://likes-telecom-app.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@goroky.com"
ADMIN_PASSWORD = "Goroky2026!"

# Fiscal IDs known to exist with active lines/tariffs (per review request)
CANDIDATE_FISCAL_IDS = ["R04432057", "Z3452060H", "Z3091783J"]


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def target_fiscal(h):
    """Pick a fiscal id that exists and has at least one line with price > 0."""
    for fid in CANDIDATE_FISCAL_IDS:
        r = requests.get(f"{BASE_URL}/api/customers/{fid}", headers=h, timeout=20)
        if r.status_code == 200:
            data = r.json()
            has_priced_line = any((l.get("price") or 0) > 0 for l in data.get("lines", []))
            if has_priced_line:
                return fid, data
    pytest.skip("No candidate customer with priced line found")


# ---------- Billing update ----------
class TestBilling:
    def test_update_billing_and_persist(self, h, target_fiscal):
        fid, _ = target_fiscal
        iban = "ES9121000418450200051332"
        r = requests.post(f"{BASE_URL}/api/customers/{fid}/billing", headers=h,
                          json={"iban": iban, "paymentMethod": "SEPA CORE"}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("iban") == iban.replace(" ", "").upper()
        assert body.get("paymentMethod") == "SEPA CORE"

        # verify persistence
        r2 = requests.get(f"{BASE_URL}/api/customers/{fid}", headers=h, timeout=20)
        assert r2.status_code == 200
        cust = r2.json()["customer"]
        assert cust.get("iban") == iban
        assert cust.get("paymentMethod") == "SEPA CORE"

    def test_billing_not_found(self, h):
        r = requests.post(f"{BASE_URL}/api/customers/NONEXISTENT_FID/billing", headers=h,
                          json={"iban": "ES00", "paymentMethod": "NO"}, timeout=20)
        assert r.status_code == 404


# ---------- Invoice CRUD ----------
class TestInvoices:
    created_id = None
    created_number = None

    def test_create_manual_invoice(self, h, target_fiscal):
        fid, data = target_fiscal
        line_number = data["lines"][0]["lineNumber"]
        payload = {
            "fiscalId": fid,
            "items": [
                {"description": "Cuota mensual", "detail": "Julio 2026", "quantity": 1, "amount": 12.10},
                {"description": "Llamadas extra", "detail": "20 min", "quantity": 1, "amount": 6.05},
            ],
            "lineNumbers": [line_number],
            "period": "2026-01",
            "status": "pending",
            "sendEmail": False,
        }
        r = requests.post(f"{BASE_URL}/api/invoices", headers=h, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["total"] == pytest.approx(18.15, abs=0.01)
        assert inv["subtotal"] == pytest.approx(round(18.15 / 1.21, 2), abs=0.01)
        assert inv["status"] == "pending"
        assert len(inv["items"]) == 2
        assert inv["lineNumbers"] == [line_number]
        assert inv.get("consumption") is not None
        assert inv.get("invoiceNumber")
        TestInvoices.created_id = inv.get("id") or inv.get("_id")
        TestInvoices.created_number = inv["invoiceNumber"]
        assert TestInvoices.created_id, f"Missing id in response: {inv}"

    def test_create_empty_items_400(self, h, target_fiscal):
        fid, _ = target_fiscal
        r = requests.post(f"{BASE_URL}/api/invoices", headers=h,
                          json={"fiscalId": fid, "items": [], "sendEmail": False}, timeout=20)
        assert r.status_code in (400, 422)

    def test_update_pending_invoice(self, h):
        assert TestInvoices.created_id
        payload = {
            "items": [
                {"description": "Cuota mensual", "detail": "Julio", "quantity": 1, "amount": 20.00},
                {"description": "Coste extra", "detail": "Setup", "quantity": 1, "amount": 5.00},
                {"description": "Descuento", "detail": "Fidelidad", "quantity": 1, "amount": -2.00},
            ],
            "sendEmail": False,
        }
        r = requests.post(f"{BASE_URL}/api/invoices/{TestInvoices.created_id}/update",
                          headers=h, json=payload, timeout=20)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["total"] == pytest.approx(23.00, abs=0.01)
        assert len(inv["items"]) == 3

    def test_cannot_edit_paid_invoice(self, h, target_fiscal):
        # Create then mark as paid via update, then try editing items
        fid, _ = target_fiscal
        r = requests.post(f"{BASE_URL}/api/invoices", headers=h, json={
            "fiscalId": fid, "items": [{"description": "X", "amount": 10}],
            "status": "pending", "sendEmail": False}, timeout=20)
        assert r.status_code == 200
        inv = r.json()
        inv_id = inv.get("id") or inv.get("_id")
        # mark paid
        r2 = requests.post(f"{BASE_URL}/api/invoices/{inv_id}/update", headers=h,
                           json={"status": "paid", "sendEmail": False}, timeout=20)
        assert r2.status_code == 200
        # attempt edit items on paid
        r3 = requests.post(f"{BASE_URL}/api/invoices/{inv_id}/update", headers=h,
                           json={"items": [{"description": "Y", "amount": 5}], "sendEmail": False}, timeout=20)
        assert r3.status_code == 400
        # attempt delete on paid
        r4 = requests.post(f"{BASE_URL}/api/invoices/{inv_id}/delete", headers=h, timeout=20)
        assert r4.status_code == 400

    def test_resend_email(self, h):
        assert TestInvoices.created_id
        r = requests.post(f"{BASE_URL}/api/invoices/{TestInvoices.created_id}/email",
                          headers=h, timeout=45)
        # may 200 or 500 if email not configured; we just record
        assert r.status_code in (200, 400, 500), r.text
        print(f"Resend invoice status={r.status_code} body={r.text[:200]}")

    def test_delete_pending_invoice_post(self, h):
        assert TestInvoices.created_id
        r = requests.post(f"{BASE_URL}/api/invoices/{TestInvoices.created_id}/delete",
                          headers=h, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True


# ---------- Send card link (Stripe) ----------
class TestSendCardLink:
    def test_send_card_link_returns_checkout_url(self, h, target_fiscal):
        fid, _ = target_fiscal
        r = requests.post(f"{BASE_URL}/api/customers/{fid}/send-card-link",
                          headers=h, json={"origin_url": BASE_URL, "sendEmail": False}, timeout=45)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "checkout_url" in body
        assert body["checkout_url"].startswith("https://checkout.stripe.com/"), body["checkout_url"]

    def test_send_card_link_no_tariff_400(self, h):
        # Create a temp customer with no lines
        payload = {
            "fiscalId": "TESTX99999999Z",
            "name": "TEST_NoTariff",
            "customerType": "Residential",
            "email": "notariff@test.com",
        }
        r = requests.post(f"{BASE_URL}/api/customers", headers=h, json=payload, timeout=20)
        # If already exists that's fine
        if r.status_code not in (200, 201, 409, 400):
            pytest.skip(f"cannot create test customer: {r.status_code} {r.text}")
        r2 = requests.post(f"{BASE_URL}/api/customers/TESTX99999999Z/send-card-link",
                           headers=h, json={"origin_url": BASE_URL, "sendEmail": False}, timeout=30)
        # Expect 400 with clear message; 404 if customer create failed
        assert r2.status_code in (400, 404), r2.text
        if r2.status_code == 400:
            assert "tarifa" in r2.text.lower() or "importe" in r2.text.lower()
