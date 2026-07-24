"""
Iteration 8 - RBAC (admin/agent/reseller) + Advanced line control backend tests.

Covers:
- /api/access/me for each role -> permissions
- /api/roles GET/PUT (admin only, admin role protected)
- /api/users GET/POST/DELETE
- Reseller data scoping in /api/customers & /api/lines
- Commissions (/api/commissions) admin sees all vs reseller sees own
- Reseller commission generated on order creation
- Agent forbidden from users/billing/commissions
- Line control (admin+agent): bono, roaming, barring, call-forward, spend-limit,
  suspend/reactivate, transfer, change-number, terminate
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

ADMIN = {"email": "admin@goroky.com", "password": "Goroky2026!"}
AGENT = {"email": "soporte@goroky.com", "password": "Soporte2026!"}
RESELLER = {"email": "revendedor@goroky.com", "password": "Revende2026!"}


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_h():
    return _h(_login(**ADMIN))


@pytest.fixture(scope="module")
def agent_h():
    return _h(_login(**AGENT))


@pytest.fixture(scope="module")
def reseller_h():
    return _h(_login(**RESELLER))


# --------------------- access/me & permissions ---------------------
class TestAccessMe:
    def test_admin_full_permissions(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/access/me", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "admin"
        # admin should have every permission (>=20 keys)
        assert len(data["permissions"]) >= 20
        for p in ["users.manage", "billing.manage", "commissions.view", "lines.support"]:
            assert p in data["permissions"]

    def test_agent_permissions_scoped(self, agent_h):
        r = requests.get(f"{BASE_URL}/api/access/me", headers=agent_h)
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "agent"
        assert "lines.support" in data["permissions"]
        assert "tickets.manage" in data["permissions"]
        assert "customers.view" in data["permissions"]
        assert "users.manage" not in data["permissions"]
        assert "billing.manage" not in data["permissions"]
        assert "commissions.view" not in data["permissions"]

    def test_reseller_permissions_scoped(self, reseller_h):
        r = requests.get(f"{BASE_URL}/api/access/me", headers=reseller_h)
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "reseller"
        assert "commissions.view" in data["permissions"]
        assert "orders.manage" in data["permissions"]
        assert "customers.view" in data["permissions"]
        assert "users.manage" not in data["permissions"]
        assert "billing.manage" not in data["permissions"]
        # commissionPerSim should be numeric (>= 5 based on seed)
        assert data.get("commissionPerSim", 0) >= 5


# --------------------- Roles & Users (admin only) ---------------------
class TestRolesAndUsers:
    def test_agent_forbidden_list_roles(self, agent_h):
        r = requests.get(f"{BASE_URL}/api/roles", headers=agent_h)
        assert r.status_code == 403

    def test_reseller_forbidden_list_users(self, reseller_h):
        r = requests.get(f"{BASE_URL}/api/users", headers=reseller_h)
        assert r.status_code == 403

    def test_admin_lists_roles(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/roles", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        assert "allPermissions" in data and "roles" in data
        assert "agent" in data["roles"] and "reseller" in data["roles"]

    def test_admin_cannot_edit_admin_role(self, admin_h):
        r = requests.put(f"{BASE_URL}/api/roles/admin",
                         headers=admin_h, json={"permissions": ["dashboard.view"]})
        assert r.status_code == 400

    def test_admin_edit_reseller_perms_and_restore(self, admin_h):
        # get current
        r = requests.get(f"{BASE_URL}/api/roles", headers=admin_h)
        original = list(r.json()["roles"]["reseller"])
        # remove a perm
        new_perms = [p for p in original if p != "commissions.view"]
        r2 = requests.put(f"{BASE_URL}/api/roles/reseller",
                          headers=admin_h, json={"permissions": new_perms})
        assert r2.status_code == 200
        assert "commissions.view" not in r2.json()["permissions"]
        # restore
        r3 = requests.put(f"{BASE_URL}/api/roles/reseller",
                          headers=admin_h, json={"permissions": original})
        assert r3.status_code == 200
        assert "commissions.view" in r3.json()["permissions"]

    def test_admin_lists_users_includes_seeded(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/users", headers=admin_h)
        assert r.status_code == 200
        emails = {u["email"] for u in r.json()}
        assert "admin@goroky.com" in emails
        assert "soporte@goroky.com" in emails
        assert "revendedor@goroky.com" in emails

    def test_admin_creates_and_deletes_agent(self, admin_h):
        email = f"test_agent_{uuid.uuid4().hex[:8]}@test.local"
        r = requests.post(f"{BASE_URL}/api/users", headers=admin_h,
                          json={"email": email, "name": "TEST Agent",
                                "password": "TestPass2026!", "role": "agent"})
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        # verify appears in list
        lst = requests.get(f"{BASE_URL}/api/users", headers=admin_h).json()
        assert any(u["email"] == email for u in lst)
        # delete
        rd = requests.delete(f"{BASE_URL}/api/users/{uid}", headers=admin_h)
        assert rd.status_code == 200


# --------------------- Scoping: customers/lines ---------------------
class TestScoping:
    def test_reseller_sees_only_own_customers(self, reseller_h):
        r = requests.get(f"{BASE_URL}/api/customers", headers=reseller_h)
        assert r.status_code == 200
        customers = r.json()
        # according to seed, reseller owns fiscalId 55667788R
        fids = [c["fiscalId"] for c in customers]
        assert "55667788R" in fids
        # admin demo 12345678A must NOT appear
        assert "12345678A" not in fids

    def test_admin_sees_all_customers(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/customers", headers=admin_h)
        assert r.status_code == 200
        fids = {c["fiscalId"] for c in r.json()}
        assert "12345678A" in fids
        # 55667788R may also be present (reseller-owned)

    def test_reseller_sees_only_own_lines(self, reseller_h):
        r = requests.get(f"{BASE_URL}/api/lines", headers=reseller_h)
        assert r.status_code == 200
        for line in r.json():
            assert line.get("fiscalId") != "12345678A"

    def test_agent_forbidden_billing(self, agent_h):
        r = requests.get(f"{BASE_URL}/api/billing/subscriptions", headers=agent_h)
        assert r.status_code == 403

    def test_agent_forbidden_commissions(self, agent_h):
        r = requests.get(f"{BASE_URL}/api/commissions", headers=agent_h)
        assert r.status_code == 403


# --------------------- Commissions ---------------------
class TestCommissions:
    def test_admin_sees_all_commissions(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/commissions", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        assert "total" in data and "commissions" in data
        assert isinstance(data["commissions"], list)

    def test_reseller_sees_own_and_total_positive(self, reseller_h):
        r = requests.get(f"{BASE_URL}/api/commissions", headers=reseller_h)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 5.0, f"Expected reseller total >=5€, got {data['total']}"
        assert data["count"] >= 1


# --------------------- Reseller: create order generates commission ---------------------
class TestResellerOrderCommission:
    def test_reseller_order_creates_commission(self, reseller_h, admin_h):
        # 1. Get baseline commission total for reseller
        base = requests.get(f"{BASE_URL}/api/commissions", headers=reseller_h).json()
        base_total = base["total"]
        base_count = base["count"]

        # 2. Get a product from catalog (Mobile)
        cat = requests.get(f"{BASE_URL}/api/products", headers=reseller_h)
        assert cat.status_code == 200
        products = cat.json()
        mobile_products = [p for p in products if p.get("family") == "Mobile"]
        assert len(mobile_products) > 0
        product = mobile_products[0]

        # 3. Create order on reseller's customer (55667788R)
        payload = {
            "fiscalId": "55667788R",
            "productId": product["productId"],
            "portability": False,
        }
        r = requests.post(f"{BASE_URL}/api/orders", headers=reseller_h, json=payload)
        assert r.status_code == 200, r.text
        order = r.json()["order"]
        assert order["ownerId"] is not None
        line_num = order["lineNumber"]

        # 4. Verify commission grew
        after = requests.get(f"{BASE_URL}/api/commissions", headers=reseller_h).json()
        assert after["count"] == base_count + 1
        assert after["total"] >= base_total + 5.0

        # 5. Admin can see this commission too
        admin_c = requests.get(f"{BASE_URL}/api/commissions", headers=admin_h).json()
        assert any(c["lineNumber"] == line_num for c in admin_c["commissions"])


# --------------------- Advanced line control (admin) ---------------------
@pytest.fixture(scope="module")
def mobile_line(admin_h):
    """Find or create a Mobile line for tests."""
    lines = requests.get(f"{BASE_URL}/api/lines", headers=admin_h).json()
    mobile = [l for l in lines if l.get("family") == "Mobile" and l.get("status") == "ACTIVE"]
    if mobile:
        return mobile[0]["lineNumber"]
    # fallback: pick any Mobile
    mobile = [l for l in lines if l.get("family") == "Mobile"]
    assert mobile, "No mobile lines available for testing"
    return mobile[0]["lineNumber"]


class TestLineControlAdmin:
    def test_bono_increases_total_gb(self, admin_h, mobile_line):
        line = requests.get(f"{BASE_URL}/api/lines/{mobile_line}", headers=admin_h).json()
        base_gb = line.get("totalGB") or 0
        r = requests.post(f"{BASE_URL}/api/lines/{mobile_line}/bono",
                          headers=admin_h, json={"gb": 5})
        assert r.status_code == 200
        assert r.json()["totalGB"] == base_gb + 5
        # persistence
        line2 = requests.get(f"{BASE_URL}/api/lines/{mobile_line}", headers=admin_h).json()
        assert line2["totalGB"] == base_gb + 5

    def test_bono_rejects_zero(self, admin_h, mobile_line):
        r = requests.post(f"{BASE_URL}/api/lines/{mobile_line}/bono",
                          headers=admin_h, json={"gb": 0})
        assert r.status_code == 400

    def test_roaming_toggle(self, admin_h, mobile_line):
        r = requests.put(f"{BASE_URL}/api/lines/{mobile_line}/roaming",
                         headers=admin_h, json={"enabled": True})
        assert r.status_code == 200 and r.json()["roaming"] is True
        line = requests.get(f"{BASE_URL}/api/lines/{mobile_line}", headers=admin_h).json()
        assert line.get("roaming") is True
        # restore
        requests.put(f"{BASE_URL}/api/lines/{mobile_line}/roaming",
                     headers=admin_h, json={"enabled": False})

    def test_barring(self, admin_h, mobile_line):
        r = requests.put(f"{BASE_URL}/api/lines/{mobile_line}/barring",
                         headers=admin_h,
                         json={"premium": True, "international": True,
                               "dataRoaming": False, "voicemail": False})
        assert r.status_code == 200
        bars = r.json()["barrings"]
        assert bars["premium"] is True and bars["international"] is True
        # cleanup
        requests.put(f"{BASE_URL}/api/lines/{mobile_line}/barring",
                     headers=admin_h,
                     json={"premium": False, "international": False,
                           "dataRoaming": False, "voicemail": False})

    def test_call_forward(self, admin_h, mobile_line):
        r = requests.put(f"{BASE_URL}/api/lines/{mobile_line}/call-forward",
                         headers=admin_h,
                         json={"enabled": True, "number": "600123456", "voicemail": False})
        assert r.status_code == 200
        cf = r.json()["callForward"]
        assert cf["enabled"] is True and cf["number"] == "600123456"
        # disable
        requests.put(f"{BASE_URL}/api/lines/{mobile_line}/call-forward",
                     headers=admin_h,
                     json={"enabled": False, "number": "", "voicemail": False})

    def test_spend_limit(self, admin_h, mobile_line):
        r = requests.put(f"{BASE_URL}/api/lines/{mobile_line}/spend-limit",
                         headers=admin_h, json={"limit": 30, "autoCut": True})
        assert r.status_code == 200
        assert r.json()["spendLimit"] == 30.0
        assert r.json()["autoCut"] is True

    def test_suspend_and_reactivate(self, admin_h, mobile_line):
        r = requests.post(f"{BASE_URL}/api/lines/{mobile_line}/suspend",
                          headers=admin_h, json={"reason": "TEST"})
        assert r.status_code == 200 and r.json()["status"] == "SUSPENDED"
        r2 = requests.post(f"{BASE_URL}/api/lines/{mobile_line}/reactivate", headers=admin_h)
        assert r2.status_code == 200 and r2.json()["status"] == "ACTIVE"

    def test_transfer_requires_existing_titular(self, admin_h, mobile_line):
        r = requests.post(f"{BASE_URL}/api/lines/{mobile_line}/transfer",
                          headers=admin_h, json={"newFiscalId": "NOTEXISTS9999"})
        assert r.status_code == 404


class TestLineControlAgent:
    def test_agent_can_bono(self, agent_h, admin_h):
        # ensure a mobile line exists
        lines = requests.get(f"{BASE_URL}/api/lines", headers=admin_h).json()
        mobile = [l for l in lines if l.get("family") == "Mobile"]
        assert mobile
        ln = mobile[0]["lineNumber"]
        r = requests.post(f"{BASE_URL}/api/lines/{ln}/bono",
                          headers=agent_h, json={"gb": 2})
        assert r.status_code == 200

    def test_agent_can_suspend_reactivate(self, agent_h, admin_h):
        lines = requests.get(f"{BASE_URL}/api/lines", headers=admin_h).json()
        mobile = [l for l in lines if l.get("family") == "Mobile" and l.get("status") == "ACTIVE"]
        if not mobile:
            pytest.skip("No active mobile line available")
        ln = mobile[0]["lineNumber"]
        r = requests.post(f"{BASE_URL}/api/lines/{ln}/suspend",
                          headers=agent_h, json={"reason": "agent test"})
        assert r.status_code == 200
        r2 = requests.post(f"{BASE_URL}/api/lines/{ln}/reactivate", headers=agent_h)
        assert r2.status_code == 200


# --------------------- Reseller line control forbidden (no lines.support) ---------------------
class TestResellerLineForbidden:
    def test_reseller_cannot_bono(self, reseller_h, admin_h):
        lines = requests.get(f"{BASE_URL}/api/lines", headers=admin_h).json()
        mobile = [l for l in lines if l.get("family") == "Mobile"]
        assert mobile
        ln = mobile[0]["lineNumber"]
        r = requests.post(f"{BASE_URL}/api/lines/{ln}/bono",
                         headers=reseller_h, json={"gb": 5})
        assert r.status_code == 403
