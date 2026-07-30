"""Iteration 13 — 4 new admin features:
  1) POST /api/invoices/{id}/mark-paid (manual)
  2) POST /api/billing/run-monthly (idempotent monthly job)
  3) Discount lines (negative amounts) in POST /api/invoices; total<=0 rejected
  4) POST /api/customers/{fid}/send-card-link records customer.cardLink.sentAt
"""
import os
import pytest
import requests

def _base_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # fallback: read from frontend/.env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert url, "REACT_APP_BACKEND_URL not set"
    return url.rstrip("/")

BASE_URL = _base_url()
ADMIN_EMAIL = "admin@goroky.com"
ADMIN_PASS = "Goroky2026!"
TEST_FID = "R04432057"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- (3) DESCUENTO en factura ----------
class TestInvoiceDiscount:
    def test_create_invoice_with_discount(self, h):
        payload = {"fiscalId": TEST_FID, "items": [
            {"description": "Cuota mensual", "detail": "Test iter13", "quantity": 1, "amount": 20},
            {"description": "Descuento fidelidad", "detail": "-5€", "quantity": 1, "amount": -5},
        ], "sendEmail": False}
        r = requests.post(f"{BASE_URL}/api/invoices", json=payload, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert abs(float(data["total"]) - 15.0) < 0.01, f"expected 15, got {data['total']}"
        assert len(data["items"]) == 2
        assert float(data["items"][1]["amount"]) == -5
        # cleanup
        requests.post(f"{BASE_URL}/api/invoices/{data['id']}/delete", headers=h, timeout=30)

    def test_reject_invoice_total_le_zero(self, h):
        payload = {"fiscalId": TEST_FID, "items": [
            {"description": "Cuota", "detail": "", "quantity": 1, "amount": 10},
            {"description": "Descuento", "detail": "", "quantity": 1, "amount": -10},
        ], "sendEmail": False}
        r = requests.post(f"{BASE_URL}/api/invoices", json=payload, headers=h, timeout=30)
        assert r.status_code == 400
        assert "mayor que 0" in r.text or "mayor" in r.text

    def test_reject_invoice_negative_total(self, h):
        payload = {"fiscalId": TEST_FID, "items": [
            {"description": "Solo descuento", "detail": "", "quantity": 1, "amount": -5},
        ], "sendEmail": False}
        r = requests.post(f"{BASE_URL}/api/invoices", json=payload, headers=h, timeout=30)
        assert r.status_code == 400


# ---------- (1) MARCAR COMO PAGADA ----------
class TestMarkPaid:
    def test_mark_paid_flow(self, h):
        # create pending
        payload = {"fiscalId": TEST_FID, "items": [
            {"description": "TEST mark-paid", "detail": "", "quantity": 1, "amount": 12},
        ], "sendEmail": False}
        r = requests.post(f"{BASE_URL}/api/invoices", json=payload, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        inv = r.json()
        inv_id = inv["id"]
        assert inv["status"] == "pending"

        # mark-paid
        r2 = requests.post(f"{BASE_URL}/api/invoices/{inv_id}/mark-paid", headers=h, timeout=30)
        assert r2.status_code == 200, r2.text
        paid = r2.json()
        assert paid.get("status") == "paid"
        assert paid.get("paidManually") is True
        assert paid.get("paidBy") == ADMIN_EMAIL
        assert paid.get("paidAt")

        # idempotent
        r3 = requests.post(f"{BASE_URL}/api/invoices/{inv_id}/mark-paid", headers=h, timeout=30)
        assert r3.status_code == 200
        assert r3.json().get("alreadyPaid") is True

        # delete now forbidden
        r4 = requests.post(f"{BASE_URL}/api/invoices/{inv_id}/delete", headers=h, timeout=30)
        assert r4.status_code == 400

    def test_mark_paid_not_found(self, h):
        r = requests.post(f"{BASE_URL}/api/invoices/000000000000000000000000/mark-paid",
                          headers=h, timeout=30)
        assert r.status_code == 404


# ---------- (2) FACTURACIÓN MENSUAL MANUAL ----------
class TestMonthlyBilling:
    def test_run_monthly_idempotent(self, h):
        r = requests.post(f"{BASE_URL}/api/billing/run-monthly", headers=h, timeout=180)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        for k in ("period", "invoiced", "charged", "skipped", "failed"):
            assert k in data, f"missing key {k} in {data}"

        # second run — must be idempotent (no new recurring invoices)
        r2 = requests.post(f"{BASE_URL}/api/billing/run-monthly", headers=h, timeout=180)
        assert r2.status_code == 200
        data2 = r2.json()
        assert data2["period"] == data["period"]
        assert data2["invoiced"] == 0, f"second run should not invoice again, got {data2}"
        assert data2["skipped"] >= data["skipped"]

    def test_run_monthly_requires_admin(self):
        r = requests.post(f"{BASE_URL}/api/billing/run-monthly", timeout=30)
        assert r.status_code in (401, 403)


# ---------- (4) SEND CARD LINK + tracking ----------
class TestSendCardLink:
    def test_send_card_link_records_sentAt(self, h):
        r = requests.post(f"{BASE_URL}/api/customers/{TEST_FID}/send-card-link",
                          json={"origin_url": BASE_URL, "sendEmail": False},
                          headers=h, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "checkout_url" in data
        assert data["checkout_url"].startswith("https://checkout.stripe.com/")

        # verify cardLink.sentAt persisted on customer
        r2 = requests.get(f"{BASE_URL}/api/customers/{TEST_FID}", headers=h, timeout=30)
        assert r2.status_code == 200
        cust = r2.json().get("customer", {})
        cl = cust.get("cardLink") or {}
        assert cl.get("sentAt"), f"cardLink.sentAt not set: {cl}"
        assert cl.get("lastSessionId")
