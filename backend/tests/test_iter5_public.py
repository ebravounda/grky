"""Iteration 5: Public catalog + application + KYC + signature contract flow."""
import os
import base64
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://likes-telecom-app.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@goroky.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Goroky2026!")

# 1x1 transparent PNG data URL
PNG_1PX = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def catalog():
    r = requests.get(f"{BASE_URL}/api/public/catalog", timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- Public catalog ----------------
class TestPublicCatalog:
    def test_catalog_groups(self, catalog):
        assert set(["Mobile", "Fiber", "Satellite", "TV"]).issubset(catalog.keys())
        assert len(catalog["Mobile"]) > 0
        assert len(catalog["Fiber"]) > 0

    def test_tv_and_satellite_have_channels(self, catalog):
        tv_items = catalog["TV"]
        sat_items = catalog["Satellite"]
        assert tv_items, "TV catalog empty"
        assert sat_items, "Satellite catalog empty"
        assert any(isinstance(p.get("channels"), list) and len(p["channels"]) > 0 for p in tv_items), \
            "No TV product has channels"
        assert any(isinstance(p.get("channels"), list) and len(p["channels"]) > 0 for p in sat_items), \
            "No Satellite product has channels"

    def test_public_product_detail(self, catalog):
        pid = catalog["Mobile"][0]["productId"]
        r = requests.get(f"{BASE_URL}/api/public/products/{pid}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["productId"] == pid

    def test_public_product_404(self):
        r = requests.get(f"{BASE_URL}/api/public/products/DOES_NOT_EXIST", timeout=15)
        assert r.status_code == 404


# ---------------- Application creation + sign flow ----------------
def _payload(product_id, fiscal_id, with_files=True):
    return {
        "productId": product_id,
        "docType": "DNI",
        "fiscalId": fiscal_id,
        "name": "Testy",
        "firstSurname": "McTest",
        "lastSurname": "Auto",
        "dob": "1990-01-15",
        "address": "Calle Falsa 123",
        "city": "Madrid",
        "postalCode": "28001",
        "province": "Madrid",
        "iban": "ES9121000418450200051332",
        "bank": "CaixaBank",
        "contactPhone": "600123123",
        "email": f"testy.{fiscal_id.lower()}@example.com",
        "acceptedTerms": True,
        "docFront": PNG_1PX if with_files else None,
        "docBack": PNG_1PX if with_files else None,
        "selfie": PNG_1PX if with_files else None,
    }


class TestApplicationFlow:
    fiscal = "T99912345Z"
    _state = {}

    def test_create_application_success(self, catalog):
        pid = catalog["Mobile"][0]["productId"]
        payload = _payload(pid, self.fiscal)
        r = requests.post(f"{BASE_URL}/api/public/applications", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 10
        assert data["contractCode"].startswith("GRK-")
        assert data["signUrl"].startswith("/firmar/")
        self._state["token"] = data["token"]
        self._state["contractCode"] = data["contractCode"]
        self._state["productId"] = pid

    def test_create_application_rejects_no_terms(self, catalog):
        pid = catalog["Fiber"][0]["productId"]
        payload = _payload(pid, "T88899999K")
        payload["acceptedTerms"] = False
        r = requests.post(f"{BASE_URL}/api/public/applications", json=payload, timeout=15)
        assert r.status_code == 400

    def test_get_application_pending(self):
        tk = self._state["token"]
        r = requests.get(f"{BASE_URL}/api/public/applications/{tk}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "PENDING_SIGN"
        assert d["contractCode"] == self._state["contractCode"]
        assert d["fiscalId"] == self.fiscal

    def test_contract_pdf(self):
        tk = self._state["token"]
        r = requests.get(f"{BASE_URL}/api/public/applications/{tk}/contract.pdf", timeout=20)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF", "Response is not a PDF"

    def test_sign_application_text(self):
        tk = self._state["token"]
        r = requests.post(f"{BASE_URL}/api/public/applications/{tk}/sign",
                          json={"signatureType": "text", "signerName": "Testy McTest"},
                          timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["contractCode"] == self._state["contractCode"]

    def test_application_status_completed(self):
        tk = self._state["token"]
        r = requests.get(f"{BASE_URL}/api/public/applications/{tk}", timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "COMPLETED"

    def test_customer_created_with_kyc(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{BASE_URL}/api/customers/{self.fiscal}/kyc", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["contractCode"] == self._state["contractCode"]
        assert d["contractOrderId"], "No contractOrderId set"
        assert d["kyc"] is not None
        kyc = d["kyc"]
        assert kyc["docType"] == "DNI"
        assert kyc["iban"].startswith("ES")
        assert kyc["signerName"] == "Testy McTest"
        assert kyc["fileIds"]["front"] and kyc["fileIds"]["back"] and kyc["fileIds"]["selfie"]

    def test_kyc_files_downloadable(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{BASE_URL}/api/customers/{self.fiscal}/kyc", headers=h, timeout=15)
        kyc = r.json()["kyc"]
        for kind in ("front", "back", "selfie"):
            fid = kyc["fileIds"][kind]
            fr = requests.get(f"{BASE_URL}/api/files/{fid}", headers=h, timeout=15)
            assert fr.status_code == 200, f"{kind} file failed"
            assert fr.headers.get("content-type", "").startswith("image/"), \
                f"{kind} file is not image, got {fr.headers.get('content-type')}"

    def test_files_endpoint_requires_admin(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{BASE_URL}/api/customers/{self.fiscal}/kyc", headers=h, timeout=15)
        fid = r.json()["kyc"]["fileIds"]["selfie"]
        # No auth
        fr = requests.get(f"{BASE_URL}/api/files/{fid}", timeout=15)
        assert fr.status_code in (401, 403)

    def test_customer_has_line_and_order(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{BASE_URL}/api/customers/{self.fiscal}", headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert len(d["lines"]) >= 1
        assert len(d["subscriptions"]) >= 1
        assert len(d["invoices"]) >= 1


# ---------------- Regression: admin still working ----------------
class TestAdminRegression:
    def test_admin_login_and_products(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{BASE_URL}/api/products", headers=h, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_settings(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{BASE_URL}/api/settings", headers=h, timeout=15)
        assert r.status_code == 200
        assert "issuer" in r.json()

    def test_admin_customers_list(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{BASE_URL}/api/customers", headers=h, timeout=15)
        assert r.status_code == 200
