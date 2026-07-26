"""
Iteration 9 - Admin app-users management + Coverage (Likes 3-step) + Public coverage.
Uses REAL admin/client credentials from /app/memory/test_credentials.md.
Cleanup: leaves cliente@goroky.com UNBLOCKED with password Cliente2026!.
"""
import os
import time
import pytest
import requests

def _load_env():
    from pathlib import Path
    for p in (Path("/app/frontend/.env"),):
        if p.exists():
            for line in p.read_text().splitlines():
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
_load_env()
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@goroky.com", "password": "Goroky2026!"}
CLIENT_EMAIL = "cliente@goroky.com"
CLIENT_PW = "Cliente2026!"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN["email"], ADMIN["password"])
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------- app-users listing ----------------
class TestAppUsersList:
    def test_list_shape_and_contains_cliente(self, admin_headers):
        r = requests.get(f"{API}/admin/app-users", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        users = r.json()
        assert isinstance(users, list) and len(users) > 0
        u0 = users[0]
        for k in ("id", "email", "name", "fiscalId", "lastLogin",
                  "appBlocked", "activeServices", "totalServices"):
            assert k in u0, f"missing key {k} in app-user row"
        cliente = next((u for u in users if u["email"] == CLIENT_EMAIL), None)
        assert cliente is not None, "cliente@goroky.com not present"
        assert cliente["activeServices"] > 0, "cliente should have >0 active services"

    def test_last_login_updates_after_client_login(self, admin_headers):
        r = _login(CLIENT_EMAIL, CLIENT_PW)
        assert r.status_code == 200
        time.sleep(1)
        r2 = requests.get(f"{API}/admin/app-users", headers=admin_headers, timeout=20)
        cliente = next((u for u in r2.json() if u["email"] == CLIENT_EMAIL), None)
        assert cliente and cliente["lastLogin"], "lastLogin should be set"


# ---------------- block/unblock ----------------
class TestBlockUnblock:
    def _cliente_id(self, admin_headers):
        r = requests.get(f"{API}/admin/app-users", headers=admin_headers, timeout=20).json()
        return next(u["id"] for u in r if u["email"] == CLIENT_EMAIL)

    def test_block_then_login_403_then_unblock(self, admin_headers):
        uid = self._cliente_id(admin_headers)
        # Get client token BEFORE blocking (to test /me invalidation)
        prev = _login(CLIENT_EMAIL, CLIENT_PW).json()["token"]
        try:
            # Block
            r = requests.post(f"{API}/admin/app-users/{uid}/block",
                              headers=admin_headers, json={"blocked": True}, timeout=20)
            assert r.status_code == 200 and r.json()["appBlocked"] is True
            # Login must be 403 now
            r_login = _login(CLIENT_EMAIL, CLIENT_PW)
            assert r_login.status_code == 403, f"expected 403 got {r_login.status_code}"
            # Old token to /me must be rejected. NOTE: implementation also increments
            # sessionEpoch on block, so 401 is returned first (epoch mismatch); 403
            # would only be returned if epoch still matched. Both == access denied.
            me = requests.get(f"{API}/auth/me",
                              headers={"Authorization": f"Bearer {prev}"}, timeout=20)
            assert me.status_code in (401, 403), f"expected 401/403 got {me.status_code}"
        finally:
            # Always unblock at the end
            requests.post(f"{API}/admin/app-users/{uid}/block",
                          headers=admin_headers, json={"blocked": False}, timeout=20)
        # Login should work again
        assert _login(CLIENT_EMAIL, CLIENT_PW).status_code == 200


# ---------------- force logout (session invalidation) ----------------
class TestForceLogout:
    def _cliente_id(self, admin_headers):
        r = requests.get(f"{API}/admin/app-users", headers=admin_headers, timeout=20).json()
        return next(u["id"] for u in r if u["email"] == CLIENT_EMAIL)

    def test_logout_invalidates_prior_token(self, admin_headers):
        uid = self._cliente_id(admin_headers)
        prev_token = _login(CLIENT_EMAIL, CLIENT_PW).json()["token"]
        # sanity - token works
        me1 = requests.get(f"{API}/auth/me",
                           headers={"Authorization": f"Bearer {prev_token}"}, timeout=20)
        assert me1.status_code == 200
        # Force logout
        r = requests.post(f"{API}/admin/app-users/{uid}/logout",
                          headers=admin_headers, timeout=20)
        assert r.status_code == 200
        # Prior token must now be 401 (epoch mismatch)
        me2 = requests.get(f"{API}/auth/me",
                          headers={"Authorization": f"Bearer {prev_token}"}, timeout=20)
        assert me2.status_code == 401, f"expected 401 got {me2.status_code}"
        # Fresh login still works
        assert _login(CLIENT_EMAIL, CLIENT_PW).status_code == 200


# ---------------- set-password (manual) + reset-password ----------------
class TestPasswordOps:
    def _cliente_id(self, admin_headers):
        r = requests.get(f"{API}/admin/app-users", headers=admin_headers, timeout=20).json()
        return next(u["id"] for u in r if u["email"] == CLIENT_EMAIL)

    def _second_client_id(self, admin_headers):
        r = requests.get(f"{API}/admin/app-users", headers=admin_headers, timeout=20).json()
        # any client that is not cliente@goroky.com
        others = [u for u in r if u["email"] != CLIENT_EMAIL]
        assert others, "need a second client user"
        # prefer Yeily Cadena if present
        y = next((u for u in others if "yeily" in (u.get("name") or "").lower()), None)
        return (y or others[0])["id"], (y or others[0])["email"]

    def test_set_manual_password_and_restore(self, admin_headers):
        uid = self._cliente_id(admin_headers)
        # Prior token
        prev = _login(CLIENT_EMAIL, CLIENT_PW).json()["token"]
        # Set new password
        r = requests.post(f"{API}/admin/app-users/{uid}/set-password",
                          headers=admin_headers, json={"password": "Temp1234"}, timeout=20)
        assert r.status_code == 200 and r.json()["ok"] is True
        # Old token invalid
        me = requests.get(f"{API}/auth/me",
                          headers={"Authorization": f"Bearer {prev}"}, timeout=20)
        assert me.status_code == 401
        # Login with new password
        r2 = _login(CLIENT_EMAIL, "Temp1234")
        assert r2.status_code == 200
        # RESTORE original password
        r3 = requests.post(f"{API}/admin/app-users/{uid}/set-password",
                           headers=admin_headers, json={"password": CLIENT_PW}, timeout=20)
        assert r3.status_code == 200
        assert _login(CLIENT_EMAIL, CLIENT_PW).status_code == 200

    def test_reset_password_second_client(self, admin_headers):
        uid, email = self._second_client_id(admin_headers)
        r = requests.post(f"{API}/admin/app-users/{uid}/reset-password",
                          headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "emailed" in body


# ---------------- coverage 3-step (admin auth) ----------------
class TestCoverage:
    def test_3_step_flow(self, admin_headers):
        # Step 1: search
        r = requests.get(f"{API}/coverage/search",
                         params={"label": "Gran Via Madrid"},
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "sessionId" in data
        assert isinstance(data.get("items"), list) and data["items"], "no items"
        session_id = data["sessionId"]
        item = data["items"][0]
        assert "gescal" in item and "address" in item

        # Step 2: buildings
        r2 = requests.get(f"{API}/coverage/buildings",
                          params={"gescal": item["gescal"], "sessionId": session_id},
                          headers=admin_headers, timeout=30)
        assert r2.status_code == 200, r2.text
        b = r2.json()
        verticals = b.get("verticals") or []
        assert verticals, "no verticals returned"
        vid = verticals[0].get("id")
        assert vid

        # Step 3: check
        r3 = requests.post(f"{API}/coverage/check",
                           headers=admin_headers,
                           json={"gescal37": vid, "sessionId": session_id}, timeout=30)
        assert r3.status_code == 200, r3.text
        c = r3.json()
        for k in ("valid", "products", "coverage"):
            assert k in c
        assert isinstance(c["products"], list)
        assert isinstance(c["coverage"], dict)
        # if valid we should have at least one product
        if c["valid"]:
            assert len(c["products"]) >= 1


# ---------------- public coverage (no auth) ----------------
class TestPublicCoverage:
    def test_public_flow_no_auth(self):
        r = requests.get(f"{API}/public/coverage/search",
                         params={"label": "Gran Via Madrid"}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("sessionId") and d.get("items")
        session_id = d["sessionId"]
        it = d["items"][0]
        r2 = requests.get(f"{API}/public/coverage/buildings",
                          params={"gescal": it["gescal"], "sessionId": session_id}, timeout=30)
        assert r2.status_code == 200
        verticals = r2.json().get("verticals") or []
        assert verticals
        r3 = requests.post(f"{API}/public/coverage/check",
                           json={"gescal37": verticals[0]["id"], "sessionId": session_id}, timeout=30)
        assert r3.status_code == 200
        c = r3.json()
        assert "valid" in c and "products" in c and "coverage" in c
