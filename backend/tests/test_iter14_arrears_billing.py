"""Iteration 14 — arrears billing + card link setup/payment modes.
Tests:
  1. Admin login
  2. send-card-link on customer 12345678A without pending physical order  → Stripe session mode=setup, amount_total None
  3. send-card-link on same customer WITH a seeded pending physical order → mode=payment, amount_total=800 (península 8€)
  4. POST /api/billing/run-monthly returns 200 with prev-month period and counters
  5. Prorate math end-to-end: seed TEST_ customer with 3 lines (act. before prev month, in prev month, in current month), run job, verify items
  6. Stripe webhook /api/stripe/webhook rejects invalid signature with 400
Cleanup: deletes any TEST_ data + orders/invoices/customers it created.
"""
import os
import calendar
import pytest
import requests
import stripe
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from pymongo import MongoClient
from bson import ObjectId

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
STRIPE_SECRET_KEY = os.environ["STRIPE_SECRET_KEY"]
ADMIN_EMAIL = "admin@goroky.com"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Goroky2026!")
FISCAL_ID = "12345678A"

stripe.api_key = STRIPE_SECRET_KEY
mdb = MongoClient(MONGO_URL)[DB_NAME]


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data["user"]["email"] == ADMIN_EMAIL
    return data["token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- 1. admin login ----------
def test_admin_login_works(admin_token):
    assert isinstance(admin_token, str) and len(admin_token) > 20


# ---------- 2. send-card-link → mode=setup ----------
def test_send_card_link_setup_mode_esim(api, auth_headers):
    # Ensure no pending physical order for the customer
    mdb.orders.update_many({"fiscalId": FISCAL_ID, "simType": "physical",
                            "shippingCharged": {"$ne": True}},
                           {"$set": {"shippingCharged": True, "_test_touched": True}})
    body = {"origin_url": BASE_URL, "sendEmail": False,
            "amount": 9, "productName": "Cuota de prueba"}
    r = requests.post(f"{BASE_URL}/api/customers/{FISCAL_ID}/send-card-link",
                      json=body, headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "checkout_url" in j and "session_id" in j
    sid = j["session_id"]
    sess = stripe.checkout.Session.retrieve(sid)
    assert sess.mode == "setup", f"Expected mode=setup, got {sess.mode}"
    assert sess.amount_total is None, f"Expected amount_total=None, got {sess.amount_total}"
    # restore any tweaked orders
    mdb.orders.update_many({"_test_touched": True},
                           {"$unset": {"shippingCharged": "", "_test_touched": ""}})


# ---------- 3. send-card-link → mode=payment for physical SIM ----------
def test_send_card_link_payment_mode_physical(api, auth_headers):
    # Seed a pending physical order for the customer
    order_id = mdb.orders.insert_one({
        "fiscalId": FISCAL_ID, "simType": "physical",
        "shippingCharged": False,
        "created": datetime.now(timezone.utc).isoformat(),
        "_test_marker": "iter14",
    }).inserted_id
    try:
        body = {"origin_url": BASE_URL, "sendEmail": False,
                "amount": 9, "productName": "Cuota de prueba"}
        r = requests.post(f"{BASE_URL}/api/customers/{FISCAL_ID}/send-card-link",
                          json=body, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        sid = r.json()["session_id"]
        sess = stripe.checkout.Session.retrieve(sid)
        assert sess.mode == "payment", f"Expected payment, got {sess.mode}"
        # 28001 → península → 8 €
        assert sess.amount_total == 800, f"Expected amount_total=800, got {sess.amount_total}"
    finally:
        mdb.orders.delete_one({"_id": order_id})


# ---------- 4. run-monthly endpoint ----------
def test_run_monthly_endpoint(auth_headers):
    r = requests.post(f"{BASE_URL}/api/billing/run-monthly",
                      headers=auth_headers, timeout=120)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("ok") is True
    for k in ("period", "invoiced", "charged", "skipped", "failed"):
        assert k in j, f"missing field {k}: {j}"
    # period should be prev month label (e.g. 'diciembre 2025' when now=jan 2026)
    now = datetime.now(timezone.utc)
    first_this = now.replace(day=1)
    prev = first_this - timedelta(days=1)
    months = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
              "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    expected_period = f"{months[prev.month-1]} {prev.year}"
    assert j["period"].lower() == expected_period, f"period mismatch: got {j['period']!r} expected {expected_period!r}"


def test_run_monthly_requires_admin():
    r = requests.post(f"{BASE_URL}/api/billing/run-monthly", timeout=30)
    assert r.status_code in (401, 403)


# ---------- 5. prorate math end-to-end ----------
def _prev_month_bounds(now):
    first = now.replace(day=1)
    last_prev = (first - timedelta(days=1)).date()
    return last_prev.replace(day=1), last_prev


def test_arrears_prorate_math_via_job(auth_headers):
    """Seed a customer + 3 lines with distinct activationDates and run the job. Verify:
    - line activated BEFORE prev month → 'Cuota mensual · <mes>' at full PVP
    - line activated in prev month (2 days before end) → 'Parte proporcional · N días' prorated
    - line activated in current month → skipped (no item)
    """
    now = datetime.now(timezone.utc)
    p_start, p_end = _prev_month_bounds(now)
    dim = calendar.monthrange(p_start.year, p_start.month)[1]

    fid = "TEST_ARR_" + now.strftime("%H%M%S")
    # dates
    before = (p_start - timedelta(days=10)).isoformat()
    in_prev_two_days_before_end = (p_end - timedelta(days=1)).isoformat()  # activation = last-1 → 2 days
    in_current = now.date().isoformat()

    # Insert customer
    mdb.customers.insert_one({
        "fiscalId": fid, "name": "TEST", "firstSurname": "ARREARS",
        "email": "test_arrears@example.com",
        "billingAddress": {"postalCode": "28001", "street": "x", "streetNumber": "1",
                           "cityName": "Madrid", "provinceName": "Madrid"},
        "paymentMethod": "NO",
    })
    lines = [
        {"fiscalId": fid, "lineNumber": f"TESTLN-{fid}-1",
         "status": "ACTIVE", "family": "Mobile", "price": 9.0,
         "productName": "Test Full", "productId": None, "activationDate": before,
         "created": before, "_test_marker": "iter14"},
        {"fiscalId": fid, "lineNumber": f"TESTLN-{fid}-2",
         "status": "ACTIVE", "family": "Mobile", "price": 9.0,
         "productName": "Test Prorate", "productId": None,
         "activationDate": in_prev_two_days_before_end, "_test_marker": "iter14"},
        {"fiscalId": fid, "lineNumber": f"TESTLN-{fid}-3",
         "status": "ACTIVE", "family": "Mobile", "price": 9.0,
         "productName": "Test Future", "productId": None,
         "activationDate": in_current, "_test_marker": "iter14"},
    ]
    mdb.lines.insert_many(lines)

    try:
        r = requests.post(f"{BASE_URL}/api/billing/run-monthly",
                          headers=auth_headers, timeout=120)
        assert r.status_code == 200, r.text

        inv = mdb.invoices.find_one({"fiscalId": fid, "kind": "recurring"})
        assert inv is not None, "Recurring invoice for TEST arrears customer not generated"
        items = inv["items"]
        descs = [i["detail"] for i in items]
        assert len(items) == 2, f"expected 2 items (full+prorate), got {len(items)}: {descs}"

        full = next((i for i in items if "Cuota mensual" in i["detail"]), None)
        prorated = next((i for i in items if "Parte proporcional" in i["detail"]), None)
        assert full is not None, f"missing full-month item: {descs}"
        assert prorated is not None, f"missing prorated item: {descs}"

        # Full amount = 9.0
        assert abs(full["amount"] - 9.0) < 0.01, f"full amount != 9.0: {full}"

        # Prorate: activation = p_end - 1day → days = (p_end - act).days + 1 = 2
        assert "2 días" in prorated["detail"], f"prorated detail wrong: {prorated}"
        expected_prorated = round(9.0 * 2 / dim, 2)
        assert abs(prorated["amount"] - expected_prorated) < 0.01, \
            f"prorated amount {prorated['amount']} != expected {expected_prorated}"
    finally:
        # cleanup
        mdb.invoices.delete_many({"fiscalId": fid})
        mdb.lines.delete_many({"fiscalId": fid})
        mdb.customers.delete_many({"fiscalId": fid})


# ---------- 6. Stripe webhook: invalid signature ----------
def test_stripe_webhook_invalid_signature():
    r = requests.post(f"{BASE_URL}/api/stripe/webhook",
                      data=b'{"id":"evt_test","type":"noop"}',
                      headers={"Content-Type": "application/json",
                               "stripe-signature": "t=1,v1=bad"},
                      timeout=15)
    assert r.status_code == 400, f"expected 400 for bad signature, got {r.status_code}: {r.text[:200]}"
