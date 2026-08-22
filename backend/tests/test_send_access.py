"""Backend tests for send-access endpoint (iteration 16)."""
import os
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://likes-telecom-app.preview.emergentagent.com"
ADMIN = {"email": "admin@goroky.com", "password": "Goroky2026!"}
CLIENT_EMAIL = "cliente@goroky.com"
CLIENT_PW = "Cliente2026!"


def _admin_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    return s


def test_admin_login_and_list_app_users():
    s = _admin_session()
    r = s.get(f"{BASE}/api/admin/app-users")
    assert r.status_code == 200
    users = r.json()
    assert isinstance(users, list) and len(users) > 0
    emails = [u["email"] for u in users]
    assert CLIENT_EMAIL in emails


def test_send_access_returns_ok_and_restores_password():
    s = _admin_session()
    r = s.get(f"{BASE}/api/admin/app-users")
    uid = next(u["id"] for u in r.json() if u["email"] == CLIENT_EMAIL)

    r = s.post(f"{BASE}/api/admin/app-users/{uid}/send-access")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    assert body.get("emailed") is True

    # Old password should now be invalid
    r_login_bad = requests.post(f"{BASE}/api/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PW})
    assert r_login_bad.status_code in (401, 400)

    # Restore known password so client login tests still work
    r = s.post(f"{BASE}/api/admin/app-users/{uid}/set-password", json={"password": CLIENT_PW})
    assert r.status_code == 200

    # Verify restored login works
    r_login_ok = requests.post(f"{BASE}/api/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PW})
    assert r_login_ok.status_code == 200


def test_send_access_invalid_id_returns_404():
    s = _admin_session()
    r = s.post(f"{BASE}/api/admin/app-users/507f1f77bcf86cd799439011/send-access")
    assert r.status_code == 404


def test_send_access_requires_admin():
    r = requests.post(f"{BASE}/api/admin/app-users/507f1f77bcf86cd799439011/send-access")
    assert r.status_code in (401, 403)
