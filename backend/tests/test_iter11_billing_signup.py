"""
Iteration 11 — Billing settings + first-invoice (shipping + prorated, no setup fee)
+ customerType/docType persisted on public and internal signup.
"""
import os
import calendar
import uuid
from datetime import datetime, timezone

import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    envf = "/app/frontend/.env"
    if os.path.exists(envf):
        for line in open(envf):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")

BASE = _load_backend_url()
ADMIN_EMAIL = "admin@goroky.com"
ADMIN_PW = "Goroky2026!"


# ---------------- fixtures ----------------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def mobile_product(admin_h):
    # first storefront-visible mobile tariff
    r = requests.get(f"{BASE}/api/tariffs", headers=admin_h, timeout=20)
    assert r.status_code == 200
    tariffs = r.json()
    mob = [t for t in tariffs if t.get("family") == "Mobile" and t.get("active")]
    assert mob, "No mobile tariffs available"
    return mob[0]


# ---------------- 1) settings PUT/GET ----------------
class TestBillingSettings:
    def test_get_defaults(self, admin_h):
        r = requests.get(f"{BASE}/api/admin/settings", headers=admin_h, timeout=20)
        assert r.status_code == 200
        s = r.json()
        assert "shippingFeePeninsula" in s
        assert "shippingFeeIslands" in s
        assert "billingDay" in s

    def test_put_and_persist(self, admin_h):
        payload = {"shippingFeePeninsula": 8, "shippingFeeIslands": 10, "billingDay": 5}
        r = requests.put(f"{BASE}/api/admin/settings", headers=admin_h,
                         json=payload, timeout=20)
        assert r.status_code == 200, r.text
        s = r.json()
        assert float(s["shippingFeePeninsula"]) == 8.0
        assert float(s["shippingFeeIslands"]) == 10.0
        assert int(s["billingDay"]) == 5

        # verify persistence via GET
        r2 = requests.get(f"{BASE}/api/admin/settings", headers=admin_h, timeout=20)
        s2 = r2.json()
        assert float(s2["shippingFeePeninsula"]) == 8.0
        assert float(s2["shippingFeeIslands"]) == 10.0
        assert int(s2["billingDay"]) == 5

    def test_put_edit_values_then_restore(self, admin_h):
        # change and check persisted
        r = requests.put(f"{BASE}/api/admin/settings", headers=admin_h,
                         json={"shippingFeePeninsula": 9.5, "shippingFeeIslands": 12,
                               "billingDay": 10}, timeout=20)
        assert r.status_code == 200
        s = r.json()
        assert float(s["shippingFeePeninsula"]) == 9.5
        assert float(s["shippingFeeIslands"]) == 12.0
        assert int(s["billingDay"]) == 10
        # restore defaults
        requests.put(f"{BASE}/api/admin/settings", headers=admin_h,
                     json={"shippingFeePeninsula": 8, "shippingFeeIslands": 10, "billingDay": 5},
                     timeout=20)


# ---------------- helpers to compute expected proration ----------------
def _expected_proration(price, billing_day=5):
    today = datetime.now(timezone.utc)
    dim = calendar.monthrange(today.year, today.month)[1]
    if today.day < billing_day:
        next_bill = today.replace(day=billing_day)
    else:
        y = today.year + (1 if today.month == 12 else 0)
        m = 1 if today.month == 12 else today.month + 1
        next_bill = today.replace(year=y, month=m, day=billing_day)
    days_left = max(1, (next_bill.date() - today.date()).days)
    prorated = round(float(price) * days_left / dim, 2)
    return prorated, days_left


def _rand_dni():
    # Sintetic NIF prefixed TEST — de test
    n = str(uuid.uuid4().int)[:8]
    letters = "TRWAGMYFPDXBNJZSQVHLCKE"
    return f"{n}{letters[int(n)%23]}"


def _create_public_app(product_id, postal_code):
    body = {
        "productId": product_id,
        "customerType": "Residential",
        "docType": "DNI",
        "fiscalId": _rand_dni(),
        "name": "TEST_Iter11",
        "firstSurname": "Alpha",
        "lastSurname": "Beta",
        "dob": "1990-01-01",
        "address": "Calle Ficticia 1",
        "city": "Test",
        "postalCode": postal_code,
        "province": "Test",
        "iban": "ES9121000418450200051332",
        "bank": "CaixaBank",
        "contactPhone": "600000000",
        "email": f"test_{uuid.uuid4().hex[:8]}@example.com",
        "acceptedTerms": True,
        "paymentMethod": "sepa",
        "simType": "esim",
        "lineType": "new",
    }
    r = requests.post(f"{BASE}/api/public/applications", json=body, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"], body


def _sign(token, name="TEST_Iter11 Alpha"):
    r = requests.post(f"{BASE}/api/public/applications/{token}/sign",
                      json={"signatureType": "text", "signerName": name}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _get_invoice_for_fiscal(admin_h, fiscal_id):
    r = requests.get(f"{BASE}/api/customers/{fiscal_id}", headers=admin_h, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    invs = data.get("invoices") or []
    assert invs, f"No invoices found for {fiscal_id}"
    invs = sorted(invs, key=lambda i: i.get("date", ""), reverse=True)
    return invs[0], data


# ---------------- 2) first invoice: Peninsula ----------------
class TestFirstInvoice:
    def test_peninsula_28001(self, admin_h, mobile_product):
        # ensure defaults
        requests.put(f"{BASE}/api/admin/settings", headers=admin_h,
                     json={"shippingFeePeninsula": 8, "shippingFeeIslands": 10, "billingDay": 5},
                     timeout=20)
        token, body = _create_public_app(mobile_product["productId"], "28001")
        _sign(token)
        inv, _ = _get_invoice_for_fiscal(admin_h, body["fiscalId"])

        # Shipping = 8 (peninsula)
        assert inv.get("shippingFee") == 8.0, f"shippingFee: {inv.get('shippingFee')}"
        assert inv.get("isFirstInvoice") is True
        assert inv.get("billingDay") == 5

        # Prorated matches expected
        exp_prorated, exp_days = _expected_proration(mobile_product["price"], 5)
        assert inv.get("daysProrated") == exp_days
        assert abs(float(inv.get("proratedAmount")) - exp_prorated) < 0.02

        # Total = 8 + prorated, no setup fee line
        items = inv.get("items") or []
        descs = [i.get("description", "").lower() for i in items]
        assert any("envío" in d or "envio" in d for d in descs), f"items: {items}"
        assert not any("alta" in d for d in descs), f"Setup fee line present: {items}"

        # Prorated < full monthly
        assert float(inv["proratedAmount"]) < float(mobile_product["price"])
        # Total ~= shipping + prorated
        expected_total = round(8.0 + exp_prorated, 2)
        assert abs(float(inv["total"]) - expected_total) < 0.02

    def test_islands_35001(self, admin_h, mobile_product):
        token, body = _create_public_app(mobile_product["productId"], "35001")
        _sign(token)
        inv, _ = _get_invoice_for_fiscal(admin_h, body["fiscalId"])
        assert inv.get("shippingFee") == 10.0, f"Expected 10 (Canarias), got {inv.get('shippingFee')}"

        # ensure "Islas" detail is present in the shipping line
        items = inv.get("items") or []
        ship = next((i for i in items if "env" in i.get("description", "").lower()), None)
        assert ship is not None
        assert "islas" in (ship.get("detail") or "").lower()

    def test_islands_baleares_07001(self, admin_h, mobile_product):
        token, body = _create_public_app(mobile_product["productId"], "07001")
        _sign(token)
        inv, _ = _get_invoice_for_fiscal(admin_h, body["fiscalId"])
        assert inv.get("shippingFee") == 10.0

    def test_customer_type_and_doctype_persisted_public(self, admin_h, mobile_product):
        # Create with customerType=Freelance and docType=NIE
        body = {
            "productId": mobile_product["productId"],
            "customerType": "Freelance",
            "docType": "NIE",
            "fiscalId": _rand_dni(),
            "name": "TEST_Freelancer",
            "firstSurname": "Nie",
            "lastSurname": "Test",
            "dob": "1985-01-01",
            "address": "Calle Falsa 2", "city": "Madrid",
            "postalCode": "28001", "province": "Madrid",
            "iban": "ES9121000418450200051332", "bank": "CaixaBank",
            "contactPhone": "611111111",
            "email": f"test_{uuid.uuid4().hex[:8]}@example.com",
            "acceptedTerms": True, "paymentMethod": "sepa", "simType": "esim",
            "lineType": "new",
        }
        r = requests.post(f"{BASE}/api/public/applications", json=body, timeout=30)
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        _sign(token, name="TEST_Freelancer Nie")

        # Verify customer persisted
        r2 = requests.get(f"{BASE}/api/customers/{body['fiscalId']}", headers=admin_h, timeout=20)
        assert r2.status_code == 200
        cust = r2.json()["customer"]
        assert cust.get("customerType") == "Freelance", f"got {cust.get('customerType')}"
        assert cust.get("fiscalIdType") == "NIE", f"got {cust.get('fiscalIdType')}"


# ---------------- 3) internal admin create customer ----------------
class TestInternalCustomerTypes:
    def test_create_customer_with_passport(self, admin_h):
        fid = "TEST" + uuid.uuid4().hex[:8].upper()
        body = {
            "fiscalId": fid,
            "customerType": "Society",
            "fiscalIdType": "Passport",
            "name": "TEST_Passport",
            "firstSurname": "One",
            "email": f"test_{uuid.uuid4().hex[:8]}@example.com",
            "contactPhone": "600000001",
            "iban": "", "paymentMethod": "NO",
            "street": "Calle Test", "streetNumber": "1",
            "postalCode": "28001", "cityName": "Madrid", "provinceName": "Madrid",
        }
        r = requests.post(f"{BASE}/api/customers", headers=admin_h, json=body, timeout=20)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["customerType"] == "Society"
        assert created["fiscalIdType"] == "Passport"

        # verify persistence via list + get
        rl = requests.get(f"{BASE}/api/customers", headers=admin_h, timeout=20)
        assert rl.status_code == 200
        row = next((c for c in rl.json() if c["fiscalId"] == fid), None)
        assert row is not None
        assert row.get("customerType") == "Society"
        assert row.get("fiscalIdType") == "Passport"

    def test_create_customer_freelance_nie(self, admin_h):
        fid = "TEST" + uuid.uuid4().hex[:8].upper()
        body = {
            "fiscalId": fid, "customerType": "Freelance", "fiscalIdType": "NIE",
            "name": "TEST_Freelance_NIE", "firstSurname": "X",
            "email": f"test_{uuid.uuid4().hex[:8]}@example.com",
            "contactPhone": "600000002",
        }
        r = requests.post(f"{BASE}/api/customers", headers=admin_h, json=body, timeout=20)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["customerType"] == "Freelance"
        assert c["fiscalIdType"] == "NIE"
