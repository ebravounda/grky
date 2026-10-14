"""Iteration 23: Blog SEO proxy module tests."""
import os
import re
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "admin@goroky.com", "password": "Goroky2026!"}
RESELLER = {"email": "revendedor@goroky.com", "password": "Revende2026!"}
MOCK_KEY = "testkey123456"


def _login(creds):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login {creds['email']} -> {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def reseller():
    return _login(RESELLER)


# ---- Seeding helpers (restore state after disconnect test) ----
def _reseed_blog_settings():
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient

    async def go():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        await db.blog_settings.update_one(
            {"_id": "config"},
            {"$set": {"api_base": "http://localhost:9999/api/public/site1",
                      "key": MOCK_KEY, "enabled": True, "brand": "Goroky", "published": 1}},
            upsert=True,
        )
        c.close()
    asyncio.run(go())


# ---- Public proxy endpoints ----
class TestPublicBlog:
    def test_status_connected(self):
        r = requests.get(f"{BASE}/api/blog/status", timeout=15)
        assert r.status_code == 200
        assert r.json()["enabled"] is True

    def test_articles_list(self):
        r = requests.get(f"{BASE}/api/blog/articles", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        assert data[0]["slug"] == "ahorrar-tarifa-movil"
        # key must NOT be leaked
        assert MOCK_KEY not in r.text

    def test_article_detail(self):
        r = requests.get(f"{BASE}/api/blog/articles/ahorrar-tarifa-movil", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["title"].startswith("Cómo ahorrar")
        assert "data-track" in d["html"]
        assert MOCK_KEY not in r.text

    def test_article_404(self):
        r = requests.get(f"{BASE}/api/blog/articles/no-existe", timeout=15)
        assert r.status_code == 404

    def test_track(self):
        r = requests.post(f"{BASE}/api/blog/track", json={"type": "view", "article_id": "a1"}, timeout=15)
        assert r.status_code == 200
        # verify mock received key
        dbg = requests.get("http://localhost:9999/debug", timeout=5).json()
        assert any(t.get("key") == MOCK_KEY for t in dbg["track"])

    def test_lead_valid(self):
        r = requests.post(f"{BASE}/api/blog/lead",
                          json={"email": "lead@test.com", "name": "L", "message": "hola", "article_id": "a1"},
                          timeout=15)
        assert r.status_code == 200
        dbg = requests.get("http://localhost:9999/debug", timeout=5).json()
        assert any(l.get("email") == "lead@test.com" and l.get("key") == MOCK_KEY for l in dbg["leads"])

    def test_lead_invalid_email(self):
        r = requests.post(f"{BASE}/api/blog/lead", json={"email": "not-an-email"}, timeout=15)
        assert r.status_code == 400

    def test_sitemap_xml(self):
        r = requests.get(f"{BASE}/api/blog-sitemap.xml", timeout=15)
        assert r.status_code == 200
        assert "xml" in r.headers.get("content-type", "")
        assert "<urlset" in r.text

    def test_styles_css(self):
        r = requests.get(f"{BASE}/api/blog/styles.css", timeout=15)
        assert r.status_code == 200
        assert "text/css" in r.headers.get("content-type", "")
        assert ".mseo-root" in r.text


# ---- Admin endpoints ----
class TestAdminBlog:
    def test_get_settings_admin(self, admin):
        r = admin.get(f"{BASE}/api/admin/blog/settings", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["enabled"] is True
        assert d["keyMasked"] and MOCK_KEY not in d["keyMasked"]
        assert "•" in d["keyMasked"]

    def test_get_settings_reseller_forbidden(self, reseller):
        r = reseller.get(f"{BASE}/api/admin/blog/settings", timeout=15)
        assert r.status_code == 403

    def test_test_connection_rejects_http(self, admin):
        r = admin.post(f"{BASE}/api/admin/blog/test",
                       json={"url": "http://localhost:9999/api/public/site1/connect?key=testkey123456"},
                       timeout=15)
        assert r.status_code == 400
        assert "https" in r.text.lower()

    def test_test_connection_rejects_malformed(self, admin):
        r = admin.post(f"{BASE}/api/admin/blog/test",
                       json={"url": "https://example.com/no-connect-path"}, timeout=15)
        assert r.status_code == 400

    def test_disconnect_and_reseed(self, admin):
        # Disconnect
        r = admin.delete(f"{BASE}/api/admin/blog/settings", timeout=15)
        assert r.status_code == 200

        # Public returns [] and 404
        r2 = requests.get(f"{BASE}/api/blog/articles", timeout=15)
        assert r2.status_code == 200 and r2.json() == []
        r3 = requests.get(f"{BASE}/api/blog/articles/ahorrar-tarifa-movil", timeout=15)
        assert r3.status_code == 404
        r4 = requests.get(f"{BASE}/api/blog/status", timeout=15)
        assert r4.json()["enabled"] is False

        # Admin GET settings -> enabled false
        r5 = admin.get(f"{BASE}/api/admin/blog/settings", timeout=15)
        assert r5.status_code == 200 and r5.json().get("enabled") is False

        # Reseed via Mongo (mock is http, cannot use /save endpoint)
        _reseed_blog_settings()
        r6 = requests.get(f"{BASE}/api/blog/status", timeout=15)
        assert r6.json()["enabled"] is True
