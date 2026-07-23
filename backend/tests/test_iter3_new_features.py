"""
Iteration 3 regression tests - new features:
- Tariffs CRUD (/api/tariffs)
- eSIM detail (/api/lines/{n}/esim)
- Line SIM actions: sim-duplicate, sim info (IMSI/PIN/PUK), spn update, credit-limit
- Subscriptions advanced: change-titular, optional-products (list/add/terminate)
- Installations: list, detail (with availableAppointments), appointment, cancel
- Portabilities: list, cancel (IN only)
- Resources: list, download (CSV)
- Customer documents: list + upload (base64)
- /api/settings + email endpoints returning 400 controlled when email not configured
- send-tracking returns 400 controlled when email not configured
- coverage/address (Likes mock)
"""
import os
import io
import uuid
import base64
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "admin@goroky.com"
ADMIN_PASS = "Goroky2026!"
CLIENT_EMAIL = "cliente@goroky.com"
CLIENT_PASS = "Cliente2026!"


def _login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def client_token():
    return _login(CLIENT_EMAIL, CLIENT_PASS)


def _h(t):
    return {"Authorization": f"Bearer {t}"}


# ---------- TARIFFS CRUD ----------
class TestTariffs:
    def test_list_tariffs_admin(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/tariffs", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        assert all("productId" in t and "productName" in t and "price" in t for t in data)

    def test_list_tariffs_client_forbidden(self, client_token):
        r = requests.get(f"{BASE_URL}/api/tariffs", headers=_h(client_token), timeout=20)
        assert r.status_code == 403

    def test_full_crud(self, admin_token):
        # Create
        pid = f"T{uuid.uuid4().hex[:4].upper()}"
        payload = {"productId": pid, "productName": "TEST_Tarifa QA",
                   "family": "Mobile", "type": "Main", "price": 11.11,
                   "features": ["10GB", "Ilimitadas"], "active": True}
        r = requests.post(f"{BASE_URL}/api/tariffs", headers=_h(admin_token), json=payload, timeout=20)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["productId"] == pid
        assert c["productName"] == "TEST_Tarifa QA"
        assert c["price"] == 11.11
        assert c["active"] is True

        # Appears in list
        r2 = requests.get(f"{BASE_URL}/api/tariffs", headers=_h(admin_token), timeout=20).json()
        assert any(t["productId"] == pid for t in r2)

        # Also appears in catalog when active + family filter
        prods = requests.get(f"{BASE_URL}/api/products?family=Mobile",
                             headers=_h(admin_token), timeout=20).json()
        assert any(p["productId"] == pid for p in prods)

        # Update
        upd = {"productName": "TEST_Tarifa QA v2", "family": "Mobile",
               "type": "Main", "price": 22.22,
               "features": ["50GB"], "active": False}
        r3 = requests.put(f"{BASE_URL}/api/tariffs/{pid}",
                          headers=_h(admin_token), json=upd, timeout=20)
        assert r3.status_code == 200
        assert r3.json()["productName"] == "TEST_Tarifa QA v2"
        assert r3.json()["price"] == 22.22
        assert r3.json()["active"] is False

        # Inactive => not in /products
        prods2 = requests.get(f"{BASE_URL}/api/products?family=Mobile",
                              headers=_h(admin_token), timeout=20).json()
        assert all(p["productId"] != pid for p in prods2), \
            "Inactive tariff must not appear in /products"

        # Delete
        r4 = requests.delete(f"{BASE_URL}/api/tariffs/{pid}",
                             headers=_h(admin_token), timeout=20)
        assert r4.status_code == 200
        # 404 on second delete
        r5 = requests.delete(f"{BASE_URL}/api/tariffs/{pid}",
                             headers=_h(admin_token), timeout=20)
        assert r5.status_code == 404


# ---------- ESIM + SIM ACTIONS ----------
class TestLineActions:
    def _mobile_line(self, admin_token):
        lines = requests.get(f"{BASE_URL}/api/lines", headers=_h(admin_token), timeout=20).json()
        return next(l for l in lines if l["family"] == "Mobile")

    def test_esim_data(self, admin_token):
        ln = self._mobile_line(admin_token)["lineNumber"]
        r = requests.get(f"{BASE_URL}/api/lines/{ln}/esim", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ["icc", "activationCode", "qrUrl", "smdpAddress"]:
            assert k in d, f"missing {k}"
        assert d["qrUrl"].startswith("http")

    def test_esim_client_own(self, client_token, admin_token):
        # get client's own mobile line via me/summary
        summ = requests.get(f"{BASE_URL}/api/me/summary", headers=_h(client_token), timeout=20).json()
        mob = next(l for l in summ["lines"] if l["family"] == "Mobile")
        r = requests.get(f"{BASE_URL}/api/lines/{mob['lineNumber']}/esim",
                         headers=_h(client_token), timeout=20)
        assert r.status_code == 200
        assert "qrUrl" in r.json()

    def test_sim_info(self, admin_token):
        ln = self._mobile_line(admin_token)["lineNumber"]
        r = requests.get(f"{BASE_URL}/api/lines/{ln}/sim", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ["icc", "imsi", "pin", "puk", "spn"]:
            assert k in d

    def test_sim_duplicate(self, admin_token):
        ln = self._mobile_line(admin_token)["lineNumber"]
        old = requests.get(f"{BASE_URL}/api/lines/{ln}", headers=_h(admin_token), timeout=20).json()["icc"]
        r = requests.post(f"{BASE_URL}/api/lines/{ln}/sim-duplicate",
                          headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        new = r.json()["icc"]
        assert new and new != old
        after = requests.get(f"{BASE_URL}/api/lines/{ln}", headers=_h(admin_token), timeout=20).json()
        assert after["icc"] == new

    def test_change_spn(self, admin_token):
        ln = self._mobile_line(admin_token)["lineNumber"]
        r = requests.put(f"{BASE_URL}/api/lines/{ln}/spn", headers=_h(admin_token),
                         json={"spn": "GOROKY_QA"}, timeout=20)
        assert r.status_code == 200
        d = requests.get(f"{BASE_URL}/api/lines/{ln}", headers=_h(admin_token), timeout=20).json()
        assert d["spn"] == "GOROKY_QA"
        # revert
        requests.put(f"{BASE_URL}/api/lines/{ln}/spn", headers=_h(admin_token),
                     json={"spn": "GOROKY"}, timeout=20)

    def test_credit_limit(self, admin_token):
        ln = self._mobile_line(admin_token)["lineNumber"]
        r = requests.put(f"{BASE_URL}/api/lines/{ln}/credit-limit",
                         headers=_h(admin_token), json={"creditLimit": 75.5}, timeout=20)
        assert r.status_code == 200
        d = requests.get(f"{BASE_URL}/api/lines/{ln}", headers=_h(admin_token), timeout=20).json()
        assert d["creditLimit"] == 75.5


# ---------- SUBSCRIPTIONS ADVANCED ----------
class TestSubscriptionsAdvanced:
    def test_compatible_optionals(self, admin_token):
        subs = requests.get(f"{BASE_URL}/api/subscriptions?fiscalId=12345678A",
                            headers=_h(admin_token), timeout=20).json()
        mob_sub = next(s for s in subs if s["family"] == "Mobile")
        r = requests.get(
            f"{BASE_URL}/api/subscriptions/{mob_sub['subscriptionId']}/optional-products",
            headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        opts = r.json()
        assert isinstance(opts, list)
        # There should be optional Mobile tariffs in the seed
        assert all(o["family"] == "Mobile" and o["type"] == "Optional" for o in opts)

    def test_add_and_terminate_optional(self, admin_token):
        subs = requests.get(f"{BASE_URL}/api/subscriptions?fiscalId=12345678A",
                            headers=_h(admin_token), timeout=20).json()
        mob_sub = next(s for s in subs if s["family"] == "Mobile")
        opts = requests.get(
            f"{BASE_URL}/api/subscriptions/{mob_sub['subscriptionId']}/optional-products",
            headers=_h(admin_token), timeout=20).json()
        if not opts:
            pytest.skip("no optionals")
        opt = opts[0]
        # add
        r = requests.post(f"{BASE_URL}/api/subscriptions/add-optional",
                         headers=_h(admin_token),
                         json={"subscriptionId": mob_sub["subscriptionId"],
                               "productId": opt["productId"]}, timeout=20)
        assert r.status_code == 200
        # duplicate add should fail
        r2 = requests.post(f"{BASE_URL}/api/subscriptions/add-optional",
                          headers=_h(admin_token),
                          json={"subscriptionId": mob_sub["subscriptionId"],
                                "productId": opt["productId"]}, timeout=20)
        assert r2.status_code == 400
        # terminate
        r3 = requests.post(f"{BASE_URL}/api/subscriptions/terminate-optional",
                          headers=_h(admin_token),
                          json={"subscriptionId": mob_sub["subscriptionId"],
                                "productId": opt["productId"]}, timeout=20)
        assert r3.status_code == 200

    def test_change_titular(self, admin_token):
        # create a fresh customer + order so we don't touch seed
        new_fid = f"T{uuid.uuid4().hex[:8].upper()}"
        requests.post(f"{BASE_URL}/api/customers", headers=_h(admin_token), json={
            "fiscalId": new_fid, "name": "TEST_Titular Nuevo",
            "email": f"newt_{new_fid.lower()}@qa.com", "contactPhone": "600000001"
        }, timeout=20)
        prods = requests.get(f"{BASE_URL}/api/products?family=Mobile",
                             headers=_h(admin_token), timeout=20).json()
        ord_r = requests.post(f"{BASE_URL}/api/orders", headers=_h(admin_token),
                              json={"fiscalId": new_fid, "productId": prods[0]["productId"]},
                              timeout=20).json()
        # find the sub for this new customer
        subs = requests.get(f"{BASE_URL}/api/subscriptions?fiscalId={new_fid}",
                            headers=_h(admin_token), timeout=20).json()
        assert subs
        sub_id = subs[0]["subscriptionId"]
        # change titular to another existing customer
        target = "45678912C"
        r = requests.post(f"{BASE_URL}/api/subscriptions/change-titular",
                          headers=_h(admin_token),
                          json={"subscriptionId": sub_id, "newFiscalId": target},
                          timeout=20)
        assert r.status_code == 200
        # verify sub now belongs to target
        subs2 = requests.get(f"{BASE_URL}/api/subscriptions?fiscalId={target}",
                             headers=_h(admin_token), timeout=20).json()
        assert any(s["subscriptionId"] == sub_id for s in subs2)


# ---------- INSTALLATIONS ----------
class TestInstallations:
    def test_list_and_detail(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/installations", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        if not items:
            pytest.skip("no installations seeded")
        target = next((i for i in items if i["status"] != "CANCELLED"), items[0])
        d = requests.get(f"{BASE_URL}/api/installations/{target['installationId']}",
                         headers=_h(admin_token), timeout=20).json()
        assert "availableAppointments" in d and len(d["availableAppointments"]) > 0

    def test_schedule_and_cancel(self, admin_token):
        items = requests.get(f"{BASE_URL}/api/installations", headers=_h(admin_token), timeout=20).json()
        target = next((i for i in items if i["status"] == "PENDING_APPOINTMENT"), None)
        if not target:
            pytest.skip("no pending installation")
        d = requests.get(f"{BASE_URL}/api/installations/{target['installationId']}",
                         headers=_h(admin_token), timeout=20).json()
        slot = d["availableAppointments"][0]
        r = requests.post(
            f"{BASE_URL}/api/installations/{target['installationId']}/appointment",
            headers=_h(admin_token), json=slot, timeout=20)
        assert r.status_code == 200
        # confirm scheduled
        items2 = requests.get(f"{BASE_URL}/api/installations",
                              headers=_h(admin_token), timeout=20).json()
        updated = next(i for i in items2 if i["installationId"] == target["installationId"])
        assert updated["status"] == "SCHEDULED"
        # cancel
        r2 = requests.post(
            f"{BASE_URL}/api/installations/{target['installationId']}/cancel",
            headers=_h(admin_token), json={"reason": "TEST_cancel"}, timeout=20)
        assert r2.status_code == 200


# ---------- PORTABILITIES ----------
class TestPortabilities:
    def test_list(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/portabilities", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_cancel_in_progress(self, admin_token):
        items = requests.get(f"{BASE_URL}/api/portabilities",
                             headers=_h(admin_token), timeout=20).json()
        target = next((p for p in items if p["type"] == "IN" and p["status"] == "IN_PROGRESS"), None)
        if not target:
            pytest.skip("no IN_PROGRESS entrante")
        r = requests.post(
            f"{BASE_URL}/api/portabilities/{target['portabilityId']}/cancel",
            headers=_h(admin_token), json={"reason": "TEST_reason"}, timeout=20)
        assert r.status_code == 200


# ---------- RESOURCES ----------
class TestResources:
    def test_list_and_download(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/resources", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        groups = r.json()
        assert isinstance(groups, list) and len(groups) > 0
        # find any document
        g = groups[0]
        f = g["folders"][0]
        doc = f["documents"][0]
        # download
        r2 = requests.get(f"{BASE_URL}/api/resources/download",
                          params={"path": f["path"], "name": doc},
                          headers=_h(admin_token), timeout=20)
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("text/csv")
        assert len(r2.content) > 0


# ---------- CUSTOMER DOCUMENTS ----------
class TestCustomerDocuments:
    def test_upload_and_list(self, admin_token):
        fiscal = "12345678A"
        content = base64.b64encode(b"hello TEST doc").decode()
        r = requests.post(f"{BASE_URL}/api/customers/{fiscal}/documents",
                          headers=_h(admin_token),
                          json={"type": "DNI", "filename": "TEST_dni.txt", "contentBase64": content},
                          timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["filename"] == "TEST_dni.txt" and d["type"] == "DNI"
        lst = requests.get(f"{BASE_URL}/api/customers/{fiscal}/documents",
                           headers=_h(admin_token), timeout=20).json()
        assert any(x["filename"] == "TEST_dni.txt" for x in lst)


# ---------- SETTINGS + EMAIL (Resend not configured) ----------
class TestSettingsAndEmail:
    def test_settings(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/settings", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ["issuer", "likes", "emailConfigured", "stripeMode"]:
            assert k in d
        # Email must NOT be configured (per iteration 3 context)
        assert d["emailConfigured"] is False
        assert d["stripeMode"]
        assert d["likes"]["live"] is False  # mock mode

    def test_email_test_returns_400_when_not_configured(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/email/test", headers=_h(admin_token),
                          json={"email": "qa@example.com"}, timeout=20)
        assert r.status_code == 400
        assert "Email no configurado" in r.text or "RESEND" in r.text.upper()

    def test_invoice_email_returns_400_when_not_configured(self, admin_token):
        invs = requests.get(f"{BASE_URL}/api/invoices",
                            headers=_h(admin_token), timeout=20).json()
        assert invs
        r = requests.post(f"{BASE_URL}/api/invoices/{invs[0]['id']}/email",
                          headers=_h(admin_token), timeout=20)
        assert r.status_code == 400

    def test_order_send_tracking_returns_400(self, admin_token):
        orders = requests.get(f"{BASE_URL}/api/orders",
                              headers=_h(admin_token), timeout=20).json()
        if not orders:
            pytest.skip("no orders")
        r = requests.post(f"{BASE_URL}/api/orders/{orders[0]['orderId']}/send-tracking",
                          headers=_h(admin_token), timeout=20)
        assert r.status_code == 400


# ---------- COVERAGE ADDRESS ----------
class TestCoverageAddress:
    def test_address_search(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/coverage/address",
                          headers=_h(admin_token),
                          json={"label": "Calle Mayor"}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and len(d["items"]) > 0
