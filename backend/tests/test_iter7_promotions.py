"""
Iteration 7 - Promotions feature backend tests.
Covers: admin CRUD /api/promotions, client /api/me/promotions + dismiss.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

ADMIN = {"email": "admin@goroky.com", "password": "Goroky2026!"}
CLIENT = {"email": "cliente@goroky.com", "password": "Cliente2026!"}


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(**ADMIN)


@pytest.fixture(scope="module")
def client_token():
    return _login(**CLIENT)


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def client_headers(client_token):
    return {"Authorization": f"Bearer {client_token}", "Content-Type": "application/json"}


# --------------------- Admin promotions CRUD ---------------------
class TestPromotionsCRUD:
    def test_list_seeded(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/promotions", headers=admin_headers)
        assert r.status_code == 200
        promos = r.json()
        assert isinstance(promos, list)
        assert len(promos) >= 4  # 4 seeded
        ids = {p["promoId"] for p in promos}
        for pid in ["promo0001", "promo0002", "promo0003", "promo0004"]:
            assert pid in ids

    def test_list_requires_admin(self, client_headers):
        r = requests.get(f"{BASE_URL}/api/promotions", headers=client_headers)
        assert r.status_code == 403

    def test_create_promotion_banner_all(self, admin_headers):
        payload = {
            "title": "TEST_Banner_All",
            "subtitle": "sub",
            "imageUrl": "https://example.com/x.jpg",
            "ctaText": "Ir",
            "ctaLink": "/contratar",
            "placement": "banner",
            "audience": "all",
            "priceBadge": "-10%",
            "active": True,
        }
        r = requests.post(f"{BASE_URL}/api/promotions", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["title"] == "TEST_Banner_All"
        assert p["placement"] == "banner"
        assert p["audience"] == "all"
        assert "promoId" in p
        pytest.new_promo_id = p["promoId"]

        # verify GET
        g = requests.get(f"{BASE_URL}/api/promotions", headers=admin_headers)
        assert any(x["promoId"] == p["promoId"] for x in g.json())

    def test_create_promotion_offer_service(self, admin_headers):
        payload = {
            "title": "TEST_Offer_Service_Mobile",
            "subtitle": "s",
            "imageUrl": "https://example.com/y.jpg",
            "ctaText": "Ver",
            "ctaLink": "/contratar",
            "placement": "offer",
            "audience": "service",
            "audienceService": "Mobile",
            "active": True,
        }
        r = requests.post(f"{BASE_URL}/api/promotions", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["placement"] == "offer"
        assert p["audience"] == "service"
        assert p["audienceService"] == "Mobile"
        pytest.svc_promo_id = p["promoId"]

    def test_update_promotion(self, admin_headers):
        pid = pytest.new_promo_id
        payload = {
            "title": "TEST_Banner_All_UPDATED",
            "subtitle": "updated sub",
            "imageUrl": "https://example.com/z.jpg",
            "ctaText": "Nuevo",
            "ctaLink": "/contratar",
            "placement": "banner",
            "audience": "all",
            "priceBadge": "-20%",
            "active": True,
        }
        r = requests.put(f"{BASE_URL}/api/promotions/{pid}", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["title"] == "TEST_Banner_All_UPDATED"
        assert p["ctaText"] == "Nuevo"

        # verify persistence
        g = requests.get(f"{BASE_URL}/api/promotions", headers=admin_headers)
        found = next(x for x in g.json() if x["promoId"] == pid)
        assert found["title"] == "TEST_Banner_All_UPDATED"
        assert found["priceBadge"] == "-20%"

    def test_update_nonexistent_returns_404(self, admin_headers):
        payload = {"title": "x", "placement": "banner", "audience": "all"}
        r = requests.put(f"{BASE_URL}/api/promotions/nonexistent-id", json=payload, headers=admin_headers)
        assert r.status_code == 404

    def test_delete_promotion(self, admin_headers):
        pid = pytest.new_promo_id
        r = requests.delete(f"{BASE_URL}/api/promotions/{pid}", headers=admin_headers)
        assert r.status_code == 200
        g = requests.get(f"{BASE_URL}/api/promotions", headers=admin_headers)
        assert all(x["promoId"] != pid for x in g.json())

        # cleanup service promo too
        requests.delete(f"{BASE_URL}/api/promotions/{pytest.svc_promo_id}", headers=admin_headers)


# --------------------- Client promotions ---------------------
class TestMyPromotions:
    def test_client_gets_banner_popup_offer(self, client_headers):
        r = requests.get(f"{BASE_URL}/api/me/promotions", headers=client_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "banner" in data and "popup" in data and "offer" in data
        assert isinstance(data["banner"], list)
        # Seeded: 1 banner, 2 offers, 1 popup (all audience=all)
        assert len(data["banner"]) >= 1
        assert len(data["offer"]) >= 2

    def test_client_dismiss_persists(self, client_headers):
        r = requests.get(f"{BASE_URL}/api/me/promotions", headers=client_headers)
        data = r.json()
        # If popup already dismissed by previous test run, skip
        if not data["popup"]:
            pytest.skip("No popup available - already dismissed previously")
        popup_id = data["popup"][0]["promoId"]
        d = requests.post(f"{BASE_URL}/api/me/promotions/{popup_id}/dismiss", headers=client_headers)
        assert d.status_code == 200
        # re-fetch -> popup should be filtered out
        r2 = requests.get(f"{BASE_URL}/api/me/promotions", headers=client_headers)
        popup_ids2 = [p["promoId"] for p in r2.json()["popup"]]
        assert popup_id not in popup_ids2

    def test_service_audience_filter(self, admin_headers, client_headers):
        # Create satellite-only offer -> client (Juan) has no Satellite line -> should NOT see it
        payload = {
            "title": "TEST_SatelliteOnly",
            "placement": "offer",
            "audience": "service",
            "audienceService": "Satellite",
            "imageUrl": "https://example.com/s.jpg",
            "ctaText": "x", "ctaLink": "/contratar", "active": True,
        }
        c = requests.post(f"{BASE_URL}/api/promotions", json=payload, headers=admin_headers)
        assert c.status_code == 200
        pid = c.json()["promoId"]

        # Client should NOT see it
        r = requests.get(f"{BASE_URL}/api/me/promotions", headers=client_headers)
        offer_ids = [p["promoId"] for p in r.json()["offer"]]
        assert pid not in offer_ids, "Satellite-only promo should be filtered out for non-satellite client"

        # Create mobile-only offer -> client (has mobile line) -> should see it
        payload["title"] = "TEST_MobileOnly"
        payload["audienceService"] = "Mobile"
        c2 = requests.post(f"{BASE_URL}/api/promotions", json=payload, headers=admin_headers)
        pid2 = c2.json()["promoId"]

        r2 = requests.get(f"{BASE_URL}/api/me/promotions", headers=client_headers)
        offer_ids2 = [p["promoId"] for p in r2.json()["offer"]]
        assert pid2 in offer_ids2, "Mobile-only promo should be visible to client with mobile line"

        # cleanup
        requests.delete(f"{BASE_URL}/api/promotions/{pid}", headers=admin_headers)
        requests.delete(f"{BASE_URL}/api/promotions/{pid2}", headers=admin_headers)

    def test_inactive_promo_not_visible(self, admin_headers, client_headers):
        payload = {
            "title": "TEST_Inactive",
            "placement": "banner",
            "audience": "all",
            "imageUrl": "https://example.com/i.jpg",
            "ctaText": "x", "ctaLink": "/contratar", "active": False,
        }
        c = requests.post(f"{BASE_URL}/api/promotions", json=payload, headers=admin_headers)
        pid = c.json()["promoId"]

        r = requests.get(f"{BASE_URL}/api/me/promotions", headers=client_headers)
        all_ids = [p["promoId"] for group in r.json().values() for p in group]
        assert pid not in all_ids

        requests.delete(f"{BASE_URL}/api/promotions/{pid}", headers=admin_headers)


# --------------------- Image upload via data URL ---------------------
class TestPromoImageUpload:
    def test_data_url_image_saved_and_public(self, admin_headers):
        # tiny 1x1 png data url
        data_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        payload = {
            "title": "TEST_ImageUpload",
            "imageData": data_url,
            "placement": "banner",
            "audience": "all",
            "ctaText": "x", "ctaLink": "/contratar", "active": True,
        }
        r = requests.post(f"{BASE_URL}/api/promotions", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["imageUrl"].startswith("/api/public/promo-image/"), p["imageUrl"]
        file_id = p["imageUrl"].rsplit("/", 1)[-1]

        # public endpoint should work without auth
        img = requests.get(f"{BASE_URL}/api/public/promo-image/{file_id}")
        assert img.status_code == 200
        assert img.headers.get("content-type", "").startswith("image/")

        requests.delete(f"{BASE_URL}/api/promotions/{p['promoId']}", headers=admin_headers)
