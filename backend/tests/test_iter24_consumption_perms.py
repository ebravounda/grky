# Iter24: RBAC role permission toggling + consumption.view + reseller scope
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
DEFAULT_RESELLER = ["customers.edit", "customers.view", "invoices.view"]


def login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return login("admin@goroky.com", "Goroky2026!")


@pytest.fixture(scope="module")
def reseller():
    return login("revendedor@goroky.com", "Revende2026!")


@pytest.fixture(scope="module", autouse=True)
def restore(admin):
    yield
    admin.put(f"{BASE_URL}/api/roles/reseller", json={"permissions": DEFAULT_RESELLER})


def set_perms(admin, perms):
    r = admin.put(f"{BASE_URL}/api/roles/reseller", json={"permissions": perms})
    assert r.status_code == 200
    assert sorted(r.json()["permissions"]) == sorted(perms)
    g = admin.get(f"{BASE_URL}/api/roles").json()
    assert sorted(g["roles"]["reseller"]) == sorted(perms)
    assert "consumption.view" in g["allPermissions"]


class TestConsumptionPerms:
    def test_default_forbidden(self, admin, reseller):
        set_perms(admin, DEFAULT_RESELLER)
        me = reseller.get(f"{BASE_URL}/api/access/me").json()
        assert "consumption.view" not in me["permissions"]
        assert reseller.get(f"{BASE_URL}/api/consumption").status_code == 403
        assert reseller.get(f"{BASE_URL}/api/customers/12345678A/consumption").status_code == 403
        assert reseller.get(f"{BASE_URL}/api/lines").status_code == 403
        assert reseller.get(f"{BASE_URL}/api/customers").status_code == 200

    def test_grant_consumption(self, admin, reseller):
        set_perms(admin, DEFAULT_RESELLER + ["consumption.view"])
        me = reseller.get(f"{BASE_URL}/api/access/me").json()
        assert "consumption.view" in me["permissions"]
        r = reseller.get(f"{BASE_URL}/api/consumption")
        assert r.status_code == 200
        rows = r.json()
        fids = {x["fiscalId"] for x in rows}
        own = {c["fiscalId"] for c in reseller.get(f"{BASE_URL}/api/customers").json()} if isinstance(
            reseller.get(f"{BASE_URL}/api/customers").json(), list) else None
        print("reseller consumption fiscalIds:", fids, "own:", own)
        if own is not None:
            assert fids <= own
        for x in rows:
            for k in ["lineNumber", "callsCount", "callMinutes", "customerName"]:
                assert k in x
            assert "_id" not in x
        # still restricted elsewhere
        assert reseller.get(f"{BASE_URL}/api/lines").status_code == 403
        assert reseller.get(f"{BASE_URL}/api/dashboard/stats").status_code == 403

    def test_customer_consumption_detail(self, admin, reseller):
        r = reseller.get(f"{BASE_URL}/api/customers/12345678A/consumption")
        print("reseller 12345678A:", r.status_code)
        assert r.status_code in (200, 404)
        if r.status_code == 200:
            for x in r.json():
                assert "calls" in x
        a = admin.get(f"{BASE_URL}/api/customers/12345678A/consumption")
        assert a.status_code == 200
        assert isinstance(a.json(), list)

    def test_search_filter(self, admin):
        allr = admin.get(f"{BASE_URL}/api/consumption").json()
        assert len(allr) > 0
        ln = next(x["lineNumber"] for x in allr if x.get("lineNumber"))
        f = admin.get(f"{BASE_URL}/api/consumption", params={"q": ln}).json()
        assert len(f) >= 1
        assert any(x["lineNumber"] == ln for x in f)
        none = admin.get(f"{BASE_URL}/api/consumption", params={"q": "zzzNOPE999"}).json()
        assert none == []

    def test_admin_sees_more_than_reseller(self, admin, reseller):
        a = admin.get(f"{BASE_URL}/api/consumption").json()
        r = reseller.get(f"{BASE_URL}/api/consumption").json()
        assert len(a) >= len(r)

    def test_grant_lines_then_revoke(self, admin, reseller):
        set_perms(admin, DEFAULT_RESELLER + ["lines.view"])
        assert reseller.get(f"{BASE_URL}/api/lines").status_code == 200
        assert reseller.get(f"{BASE_URL}/api/consumption").status_code == 403
        set_perms(admin, DEFAULT_RESELLER)
        assert reseller.get(f"{BASE_URL}/api/lines").status_code == 403
        assert reseller.get(f"{BASE_URL}/api/consumption").status_code == 403

    def test_admin_role_immutable(self, admin):
        r = admin.put(f"{BASE_URL}/api/roles/admin", json={"permissions": []})
        assert r.status_code == 400

    def test_agent_toggle_persists(self, admin):
        orig = admin.get(f"{BASE_URL}/api/roles").json()["roles"]["agent"]
        new = list(set(orig) | {"consumption.view"})
        admin.put(f"{BASE_URL}/api/roles/agent", json={"permissions": new})
        assert "consumption.view" in admin.get(f"{BASE_URL}/api/roles").json()["roles"]["agent"]
        admin.put(f"{BASE_URL}/api/roles/agent", json={"permissions": orig})
        assert sorted(admin.get(f"{BASE_URL}/api/roles").json()["roles"]["agent"]) == sorted(orig)

    def test_reseller_cannot_edit_roles(self, reseller):
        assert reseller.put(f"{BASE_URL}/api/roles/reseller", json={"permissions": ["users.manage"]}).status_code == 403
