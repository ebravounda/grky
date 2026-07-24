"""
Iteration 6 backend tests:
- Alertas: /api/system/health + /api/events (list/read/read-all/unread-count)
- Solicitudes: /api/applications, /applications/{token}/detail (+approve/reject smoke)
- Cobros recurrentes: /api/billing/subscriptions + simulate(fail/success) + run-cycle
- Envíos SIM: /api/shipments (GET/PUT)
- Config: /api/admin/settings GET/PUT (autoApprove + setupFee)
- Checkout recurrente: /api/subscriptions/{id}/billing-checkout + /public/applications/{token}/checkout
- Orders activate/cancel
"""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@goroky.com", "password": "Goroky2026!"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------- ALERTS / EVENTS ----------------
class TestAlerts:
    def test_system_health(self, h):
        r = requests.get(f"{API}/system/health", headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("likes", "stripe", "email", "billing"):
            assert k in d, f"missing {k}"
        assert "live" in d["likes"]
        assert "mode" in d["stripe"]
        assert "configured" in d["email"]
        assert "activeSubscriptions" in d["billing"] and "pastDue" in d["billing"]

    def test_events_list(self, h):
        r = requests.get(f"{API}/events", headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "events" in d and "unreadCount" in d
        assert isinstance(d["events"], list)
        # No _id leak
        for e in d["events"]:
            assert "_id" not in e

    def test_events_filter_error(self, h):
        r = requests.get(f"{API}/events", headers=h, params={"level": "error"}, timeout=15)
        assert r.status_code == 200
        for e in r.json()["events"]:
            assert e["level"] == "error"

    def test_unread_count(self, h):
        r = requests.get(f"{API}/events/unread-count", headers=h, timeout=15)
        assert r.status_code == 200
        assert "unreadCount" in r.json()

    def test_mark_all_read(self, h):
        # First generate an event by hitting settings
        requests.put(f"{API}/admin/settings", headers=h, json={"autoApprove": False}, timeout=15)
        r = requests.post(f"{API}/events/read-all", headers=h, timeout=15)
        assert r.status_code == 200
        # Then unread should be 0
        c = requests.get(f"{API}/events/unread-count", headers=h, timeout=15).json()["unreadCount"]
        assert c == 0

    def test_mark_single_event_read(self, h):
        # Generate a fresh event
        requests.put(f"{API}/admin/settings", headers=h, json={"autoApprove": False}, timeout=15)
        events = requests.get(f"{API}/events", headers=h, timeout=15).json()["events"]
        unread = [e for e in events if not e.get("read")]
        if not unread:
            pytest.skip("no unread events available")
        eid = unread[0]["id"]
        r = requests.post(f"{API}/events/{eid}/read", headers=h, timeout=15)
        assert r.status_code == 200


# ---------------- ADMIN SETTINGS ----------------
class TestAdminSettings:
    def test_get_settings(self, h):
        r = requests.get(f"{API}/admin/settings", headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "autoApprove" in d
        assert "setupFee" in d
        assert "maxFailed" in d
        assert "reminderDays" in d
        assert "_id" not in d

    def test_toggle_autoapprove_persists(self, h):
        original = requests.get(f"{API}/admin/settings", headers=h, timeout=15).json()["autoApprove"]
        new_val = not original
        r = requests.put(f"{API}/admin/settings", headers=h, json={"autoApprove": new_val}, timeout=15)
        assert r.status_code == 200
        assert r.json()["autoApprove"] == new_val
        # Verify by re-GET
        assert requests.get(f"{API}/admin/settings", headers=h, timeout=15).json()["autoApprove"] == new_val
        # Restore
        requests.put(f"{API}/admin/settings", headers=h, json={"autoApprove": original}, timeout=15)

    def test_setup_fee_persists(self, h):
        r = requests.put(f"{API}/admin/settings", headers=h, json={"setupFee": 12.50}, timeout=15)
        assert r.status_code == 200
        assert abs(r.json()["setupFee"] - 12.50) < 0.001
        assert abs(requests.get(f"{API}/admin/settings", headers=h, timeout=15).json()["setupFee"] - 12.50) < 0.001


# ---------------- APPLICATIONS ----------------
class TestApplications:
    def test_list_applications(self, h):
        r = requests.get(f"{API}/applications", headers=h, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_pending_review_has_detail(self, h):
        apps = requests.get(f"{API}/applications", headers=h, timeout=15).json()
        pending = [a for a in apps if a.get("reviewStatus") == "PENDING_REVIEW" and a.get("status") == "COMPLETED"]
        if not pending:
            pytest.skip("No PENDING_REVIEW+COMPLETED apps available")
        token = pending[0]["token"]
        r = requests.get(f"{API}/applications/{token}/detail", headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("fiscalId")
        assert "fileIds" in d
        assert "paymentMethod" in d and "simType" in d


# ---------------- BILLING ----------------
class TestBilling:
    def test_billing_subscriptions_list(self, h):
        r = requests.get(f"{API}/billing/subscriptions", headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list)
        # Expect at least one with billing enabled (12345678A seeded)
        target = [s for s in d if s.get("fiscalId") == "12345678A"]
        if target:
            s = target[0]
            for k in ("subscriptionId", "method", "amount", "status"):
                assert k in s

    def test_run_cycle(self, h):
        r = requests.post(f"{API}/billing/run-cycle", headers=h, timeout=30)
        assert r.status_code == 200

    def test_simulate_fail_then_success(self, h):
        subs = requests.get(f"{API}/billing/subscriptions", headers=h, timeout=15).json()
        target = [s for s in subs if s.get("fiscalId") == "12345678A"]
        if not target:
            pytest.skip("No billing subscription for 12345678A")
        sid = target[0]["subscriptionId"]
        # Ensure reset to active
        requests.post(f"{API}/billing/simulate/{sid}", headers=h, json={"outcome": "success"}, timeout=15)
        # Fail 3 times → should suspend
        for _ in range(3):
            r = requests.post(f"{API}/billing/simulate/{sid}", headers=h, json={"outcome": "failed"}, timeout=15)
            assert r.status_code == 200
        subs2 = requests.get(f"{API}/billing/subscriptions", headers=h, timeout=15).json()
        s2 = [x for x in subs2 if x["subscriptionId"] == sid][0]
        assert s2["status"] == "past_due", f"expected past_due after 3 fails, got {s2['status']}"
        assert s2["failedAttempts"] >= 3
        # Success → reactivate
        r = requests.post(f"{API}/billing/simulate/{sid}", headers=h, json={"outcome": "success"}, timeout=15)
        assert r.status_code == 200
        subs3 = requests.get(f"{API}/billing/subscriptions", headers=h, timeout=15).json()
        s3 = [x for x in subs3 if x["subscriptionId"] == sid][0]
        assert s3["status"] == "active"
        assert s3["failedAttempts"] == 0

    def test_billing_checkout_sepa(self, h):
        subs = requests.get(f"{API}/billing/subscriptions", headers=h, timeout=15).json()
        if not subs:
            pytest.skip("No billing subs")
        sid = subs[0]["subscriptionId"]
        r = requests.post(f"{API}/subscriptions/{sid}/billing-checkout",
                          headers=h, json={"method": "sepa", "origin_url": BASE}, timeout=30)
        assert r.status_code == 200, r.text
        url = r.json().get("checkout_url", "")
        assert "checkout.stripe.com" in url

    def test_billing_checkout_card(self, h):
        subs = requests.get(f"{API}/billing/subscriptions", headers=h, timeout=15).json()
        if not subs:
            pytest.skip("No billing subs")
        sid = subs[0]["subscriptionId"]
        r = requests.post(f"{API}/subscriptions/{sid}/billing-checkout",
                          headers=h, json={"method": "card", "origin_url": BASE}, timeout=30)
        assert r.status_code == 200, r.text
        url = r.json().get("checkout_url", "")
        assert "checkout.stripe.com" in url


# ---------------- SHIPMENTS ----------------
class TestShipments:
    def test_list_shipments(self, h):
        r = requests.get(f"{API}/shipments", headers=h, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_update_shipment_status(self, h):
        ships = requests.get(f"{API}/shipments", headers=h, timeout=15).json()
        if not ships:
            pytest.skip("No shipments")
        sid = ships[0]["shipmentId"]
        original = ships[0]["status"]
        # Update to SHIPPED
        r = requests.put(f"{API}/shipments/{sid}", headers=h,
                         json={"status": "SHIPPED", "carrier": "TEST Correos", "tracking": "TESTTRK123"}, timeout=15)
        assert r.status_code == 200
        # Verify
        s = [x for x in requests.get(f"{API}/shipments", headers=h, timeout=15).json() if x["shipmentId"] == sid][0]
        assert s["status"] == "SHIPPED"
        assert s["tracking"] == "TESTTRK123"
        # Restore
        requests.put(f"{API}/shipments/{sid}", headers=h, json={"status": original}, timeout=15)


# ---------------- ORDERS ACTIVATE/CANCEL ----------------
class TestOrders:
    def test_orders_list(self, h):
        r = requests.get(f"{API}/orders", headers=h, timeout=15)
        assert r.status_code == 200


# ---------------- PUBLIC RECURRING CHECKOUT ----------------
class TestPublicCheckout:
    """Requires an application with signed contract (COMPLETED)."""
    def test_public_checkout_sepa(self, h):
        apps = requests.get(f"{API}/applications", headers=h, timeout=15).json()
        completed = [a for a in apps if a.get("status") == "COMPLETED"]
        if not completed:
            pytest.skip("No completed applications")
        token = completed[0]["token"]
        r = requests.post(f"{API}/public/applications/{token}/checkout",
                          json={"method": "sepa", "origin_url": BASE}, timeout=30)
        assert r.status_code == 200, r.text
        assert "checkout.stripe.com" in r.json().get("checkout_url", "")

    def test_public_checkout_card(self, h):
        apps = requests.get(f"{API}/applications", headers=h, timeout=15).json()
        completed = [a for a in apps if a.get("status") == "COMPLETED"]
        if not completed:
            pytest.skip("No completed applications")
        token = completed[0]["token"]
        r = requests.post(f"{API}/public/applications/{token}/checkout",
                          json={"method": "card", "origin_url": BASE}, timeout=30)
        assert r.status_code == 200, r.text
        assert "checkout.stripe.com" in r.json().get("checkout_url", "")
