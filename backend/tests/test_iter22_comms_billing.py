"""Iteration 22: Communications bulk email (selected + extra emails) and Billing protections."""
import os
import asyncio
import pytest
import requests
from unittest.mock import patch, MagicMock

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or "https://likes-telecom-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@goroky.com", "password": "Goroky2026!"},
                      timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- Communications: audience-count ----------
class TestAudienceCount:
    def test_none_with_valid_extra(self, admin_h):
        r = requests.get(f"{API}/communications/audience-count",
                         params={"audience": "none", "extra": "a@b.com,c@d.com"},
                         headers=admin_h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["count"] == 2
        assert d["invalid"] == []

    def test_none_with_invalid_extra(self, admin_h):
        r = requests.get(f"{API}/communications/audience-count",
                         params={"audience": "none", "extra": "bad@,ok@x.com"},
                         headers=admin_h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["count"] == 1
        assert "bad@" in d["invalid"]

    def test_selected_with_test_customer(self, admin_h):
        r = requests.get(f"{API}/communications/audience-count",
                         params={"audience": "selected", "fiscalIds": "12345678A",
                                 "extra": "extra@test.com"},
                         headers=admin_h, timeout=15)
        assert r.status_code == 200
        # The seeded customer 12345678A has email cliente@goroky.com, plus extra -> 2
        assert r.json()["count"] >= 1

    def test_dedup_extra_with_customer_email(self, admin_h):
        """Extra email same as customer email should dedup."""
        r = requests.get(f"{API}/communications/audience-count",
                         params={"audience": "selected", "fiscalIds": "12345678A",
                                 "extra": "cliente@goroky.com"},
                         headers=admin_h, timeout=15)
        assert r.status_code == 200
        assert r.json()["count"] == 1


# ---------- Communications: bulk-email ----------
class TestBulkEmail:
    def test_bulk_email_none_with_extras(self, admin_h):
        r = requests.post(f"{API}/communications/bulk-email",
                          json={"audience": "none",
                                "extraEmails": ["test1@example.com", "test2@example.com"],
                                "subject": "TEST_Iter22 subject",
                                "message": "Hello from iter22 testing"},
                          headers=admin_h, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["total"] == 2
        assert "jobId" in d

    def test_bulk_email_rejects_empty_recipients(self, admin_h):
        r = requests.post(f"{API}/communications/bulk-email",
                          json={"audience": "none", "extraEmails": [],
                                "subject": "x", "message": "y"},
                          headers=admin_h, timeout=15)
        assert r.status_code == 400

    def test_history_label_none(self, admin_h):
        # Trigger a job
        requests.post(f"{API}/communications/bulk-email",
                      json={"audience": "none",
                            "extraEmails": ["onlyone@example.com"],
                            "subject": "TEST_Iter22 history", "message": "x"},
                      headers=admin_h, timeout=15)
        r = requests.get(f"{API}/communications/history", headers=admin_h, timeout=15)
        assert r.status_code == 200
        hist = r.json()
        assert any("Solo emails manuales" in (row.get("audience") or "") for row in hist)

    def test_history_label_selected_with_extras(self, admin_h):
        requests.post(f"{API}/communications/bulk-email",
                      json={"audience": "selected", "fiscalIds": ["12345678A"],
                            "extraEmails": ["extra1@example.com"],
                            "subject": "TEST_Iter22 selected", "message": "x"},
                      headers=admin_h, timeout=15)
        r = requests.get(f"{API}/communications/history", headers=admin_h, timeout=15)
        assert r.status_code == 200
        hist = r.json()
        assert any("Clientes seleccionados" in (row.get("audience") or "")
                   and "email(s) extra" in (row.get("audience") or "") for row in hist)


# ---------- Billing: monthly-preview ----------
class TestMonthlyPreview:
    def test_preview_returns_structure(self, admin_h):
        r = requests.get(f"{API}/billing/monthly-preview", headers=admin_h, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "period" in d and "billingDate" in d and "summary" in d and "rows" in d
        assert isinstance(d["rows"], list)
        # In preview env, Stripe test key expired → expect some no_method rows
        # Just verify structure of rows
        for row in d["rows"][:5]:
            assert "fiscalId" in row and "result" in row

    def test_preview_requires_admin(self):
        r = requests.get(f"{API}/billing/monthly-preview", timeout=15)
        assert r.status_code in (401, 403)


# ---------- Unit tests: billing protection functions ----------
@pytest.fixture(scope="module")
def server_mod():
    """Import backend server module for unit tests."""
    import sys
    sys.path.insert(0, "/app/backend")
    import server
    return server


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


def _run(loop, coro):
    return loop.run_until_complete(coro)


class TestChargeProtections:
    """Direct unit tests on server._charge_invoice_once / _claim_invoice / _on_charge_refunded."""

    def test_claim_invoice_rejects_paid(self, server_mod, event_loop):
        async def run():
            inv_id = f"TEST_iter22_paid_{os.urandom(4).hex()}"
            await server_mod.db.invoices.insert_one({
                "_id": inv_id, "status": "paid", "chargeStatus": "paid",
                "fiscalId": "TEST_x", "total": 10, "period": "test"})
            try:
                claimed = await server_mod._claim_invoice(inv_id)
                assert claimed is None
            finally:
                await server_mod.db.invoices.delete_one({"_id": inv_id})
        _run(event_loop, run())

    def test_claim_invoice_rejects_processing(self, server_mod, event_loop):
        async def run():
            inv_id = f"TEST_iter22_proc_{os.urandom(4).hex()}"
            await server_mod.db.invoices.insert_one({
                "_id": inv_id, "status": "pending", "chargeStatus": "processing",
                "fiscalId": "TEST_x", "total": 10, "period": "test"})
            try:
                claimed = await server_mod._claim_invoice(inv_id)
                assert claimed is None
            finally:
                await server_mod.db.invoices.delete_one({"_id": inv_id})
        _run(event_loop, run())

    def test_claim_invoice_rejects_refunded(self, server_mod, event_loop):
        async def run():
            inv_id = f"TEST_iter22_refund_{os.urandom(4).hex()}"
            await server_mod.db.invoices.insert_one({
                "_id": inv_id, "status": "pending", "chargeStatus": "pending",
                "refunded": True,
                "fiscalId": "TEST_x", "total": 10, "period": "test"})
            try:
                claimed = await server_mod._claim_invoice(inv_id)
                assert claimed is None
            finally:
                await server_mod.db.invoices.delete_one({"_id": inv_id})
        _run(event_loop, run())

    def test_claim_invoice_allows_pending(self, server_mod, event_loop):
        async def run():
            inv_id = f"TEST_iter22_pend_{os.urandom(4).hex()}"
            await server_mod.db.invoices.insert_one({
                "_id": inv_id, "status": "pending", "chargeStatus": "pending",
                "fiscalId": "TEST_x", "total": 10, "period": "test"})
            try:
                claimed = await server_mod._claim_invoice(inv_id)
                assert claimed is not None
                assert claimed["chargeStatus"] == "charging"
            finally:
                await server_mod.db.invoices.delete_one({"_id": inv_id})
        _run(event_loop, run())

    def test_charge_once_under_concurrency(self, server_mod, event_loop):
        """5 concurrent charges → exactly 1 Stripe call."""
        async def run():
            inv_id = f"TEST_iter22_conc_{os.urandom(4).hex()}"
            await server_mod.db.invoices.insert_one({
                "_id": inv_id, "status": "pending", "chargeStatus": "pending",
                "fiscalId": "TEST_x", "invoiceNumber": "T-001",
                "total": 10.0, "period": "test"})
            inv = await server_mod.db.invoices.find_one({"_id": inv_id})

            calls = []

            def fake_pi_create(**kw):
                calls.append(kw)
                m = MagicMock()
                m.status = "succeeded"
                m.id = f"pi_test_{len(calls)}"
                return m

            def fake_pi_list(**kw):
                m = MagicMock()
                m.auto_paging_iter = lambda: iter([])
                return m

            try:
                with patch.object(server_mod.stripe.PaymentIntent, "create", side_effect=fake_pi_create), \
                     patch.object(server_mod.stripe.PaymentIntent, "list", side_effect=fake_pi_list):
                    results = await asyncio.gather(*[
                        server_mod._charge_invoice_once(inv, "cus_test", "pm_test",
                                                       ["card"], "desc", {})
                        for _ in range(5)
                    ])
                assert len(calls) == 1, f"Expected exactly 1 Stripe call, got {len(calls)}"
                assert results.count("paid") == 1
                assert results.count("locked") == 4
            finally:
                await server_mod.db.invoices.delete_one({"_id": inv_id})
        _run(event_loop, run())

    def test_on_charge_refunded_marks_invoice_when_no_alt(self, server_mod, event_loop):
        async def run():
            inv_id = f"TEST_iter22_ref_{os.urandom(4).hex()}"
            pi_id = f"pi_test_{os.urandom(4).hex()}"
            await server_mod.db.invoices.insert_one({
                "_id": inv_id, "status": "paid", "chargeStatus": "paid",
                "stripePaymentIntentId": pi_id,
                "fiscalId": "TEST_x", "invoiceNumber": "T-002",
                "total": 10.0, "period": "test"})
            try:
                def fake_pi_list(**kw):
                    m = MagicMock()
                    m.auto_paging_iter = lambda: iter([])
                    return m
                with patch.object(server_mod.stripe.PaymentIntent, "list", side_effect=fake_pi_list):
                    await server_mod._on_charge_refunded({
                        "payment_intent": pi_id, "amount": 1000, "amount_refunded": 1000,
                        "customer": "cus_test", "description": ""})
                inv = await server_mod.db.invoices.find_one({"_id": inv_id})
                assert inv.get("refunded") is True
                assert pi_id in (inv.get("refundedPis") or [])
            finally:
                await server_mod.db.invoices.delete_one({"_id": inv_id})
                await server_mod.db.payment_cancellations.delete_one({"_id": pi_id})
        _run(event_loop, run())

    def test_on_charge_refunded_relinks_to_alt_pi(self, server_mod, event_loop):
        async def run():
            inv_id = f"TEST_iter22_relink_{os.urandom(4).hex()}"
            pi_id = f"pi_test_old_{os.urandom(4).hex()}"
            alt_pi_id = f"pi_test_alt_{os.urandom(4).hex()}"
            await server_mod.db.invoices.insert_one({
                "_id": inv_id, "status": "paid", "chargeStatus": "paid",
                "stripePaymentIntentId": pi_id,
                "fiscalId": "TEST_x", "invoiceNumber": "T-003",
                "total": 10.0, "period": "test"})
            try:
                alt = MagicMock()
                alt.id = alt_pi_id
                alt.status = "succeeded"
                alt.amount = 1000
                alt.metadata = {"invoiceId": inv_id, "invoiceNumber": "T-003"}
                alt.latest_charge = None
                alt.description = ""

                def fake_pi_list(**kw):
                    m = MagicMock()
                    m.auto_paging_iter = lambda: iter([alt])
                    return m
                with patch.object(server_mod.stripe.PaymentIntent, "list", side_effect=fake_pi_list):
                    await server_mod._on_charge_refunded({
                        "payment_intent": pi_id, "amount": 1000, "amount_refunded": 1000,
                        "customer": "cus_test", "description": ""})
                inv = await server_mod.db.invoices.find_one({"_id": inv_id})
                assert inv.get("stripePaymentIntentId") == alt_pi_id
                assert inv.get("refunded") is not True
                assert pi_id in (inv.get("refundedPis") or [])
            finally:
                await server_mod.db.invoices.delete_one({"_id": inv_id})
                await server_mod.db.payment_cancellations.delete_one({"_id": pi_id})
        _run(event_loop, run())

    def test_existing_active_pi_ignores_fully_refunded(self, server_mod, event_loop):
        async def run():
            inv_id = f"TEST_iter22_ea_{os.urandom(4).hex()}"
            inv = {"_id": inv_id, "fiscalId": "TEST_x", "total": 10.0,
                   "period": "test", "invoiceNumber": "T-004"}
            ch = MagicMock()
            ch.amount_refunded = 1000
            p = MagicMock()
            p.id = "pi_refunded"
            p.status = "succeeded"
            p.amount = 1000
            p.metadata = {"invoiceId": inv_id}
            p.latest_charge = ch
            p.description = ""

            def fake_pi_list(**kw):
                m = MagicMock()
                m.auto_paging_iter = lambda: iter([p])
                return m
            with patch.object(server_mod.stripe.PaymentIntent, "list", side_effect=fake_pi_list):
                result = await server_mod._existing_active_pi(inv, "cus_test")
            assert result is None
        _run(event_loop, run())
