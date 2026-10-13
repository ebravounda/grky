"""Blog SEO: proxy hacia un motor de contenidos externo. La clave nunca llega al navegador."""
import time
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

TIMEOUT = 15.0
CACHE_TTL = 300
_cache = {}


class ConnectBody(BaseModel):
    url: str


class TrackBody(BaseModel):
    type: str
    article_id: Optional[str] = None


class LeadBody(BaseModel):
    email: str
    name: Optional[str] = ""
    message: Optional[str] = ""
    article_id: Optional[str] = None


def _mask(k: str) -> str:
    return (k[:4] + "•" * 8 + k[-4:]) if k and len(k) > 8 else "•" * 8


def create_blog_router(db, require_admin):
    r = APIRouter(prefix="/api")

    async def cfg():
        d = await db.blog_settings.find_one({"_id": "config"})
        return d if d and d.get("enabled") and d.get("api_base") and d.get("key") else None

    async def fetch_connect(url: str) -> dict:
        if not url.lower().startswith("https://") or "/connect" not in url:
            raise HTTPException(status_code=400, detail="El enlace debe ser https://…/api/public/{id}/connect?key=…")
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as c:
                res = await c.get(url)
            data = res.json()
        except Exception as e:  # noqa
            raise HTTPException(status_code=400, detail=f"No se pudo conectar con el motor: {str(e)[:120]}")
        if not isinstance(data, dict) or not data.get("ok"):
            raise HTTPException(status_code=400, detail=(data or {}).get("error") or "El motor no aceptó la conexión (ok=false)")
        return data

    async def upstream(method: str, path: str, *, params=None, json=None, cache=False):
        c = await cfg()
        if not c:
            return None, None
        url = c["api_base"].rstrip("/") + path
        params = {**(params or {}), **({"key": c["key"]} if method == "GET" and path != "/styles.css" else {})}
        ck = (url, tuple(sorted(params.items())))
        if cache and ck in _cache and time.time() - _cache[ck][0] < CACHE_TTL:
            return _cache[ck][1], c
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as cl:
                res = await cl.request(method, url, params=params, json=({"key": c["key"], **json} if json is not None else None))
        except Exception:  # noqa
            raise HTTPException(status_code=502, detail="El motor de contenidos no responde")
        if cache and res.status_code == 200:
            _cache[ck] = (time.time(), res)
        return res, c

    # ---------- Admin ----------
    @r.get("/admin/blog/settings")
    async def get_settings(request: Request):
        await require_admin(request)
        d = await db.blog_settings.find_one({"_id": "config"})
        if not d:
            return {"enabled": False}
        return {"enabled": bool(d.get("enabled")), "api_base": d.get("api_base"), "keyMasked": _mask(d.get("key", "")),
                "brand": d.get("brand"), "published": d.get("published"), "savedAt": d.get("savedAt")}

    @r.post("/admin/blog/test")
    async def test_conn(body: ConnectBody, request: Request):
        await require_admin(request)
        d = await fetch_connect(body.url.strip())
        return {"ok": True, "brand": d.get("brand"), "published": d.get("published", 0)}

    @r.post("/admin/blog/save")
    async def save(body: ConnectBody, request: Request):
        user = await require_admin(request)
        d = await fetch_connect(body.url.strip())
        if not d.get("api_base") or not d.get("key"):
            raise HTTPException(status_code=400, detail="La respuesta del motor no incluye api_base y key")
        await db.blog_settings.update_one({"_id": "config"}, {"$set": {
            "api_base": d["api_base"].rstrip("/"), "key": d["key"], "enabled": True, "brand": d.get("brand"),
            "published": d.get("published", 0), "savedAt": datetime.now(timezone.utc).isoformat(),
            "savedBy": user.get("email")}}, upsert=True)
        _cache.clear()
        return {"ok": True, "brand": d.get("brand"), "published": d.get("published", 0), "keyMasked": _mask(d["key"])}

    @r.delete("/admin/blog/settings")
    async def disconnect(request: Request):
        await require_admin(request)
        await db.blog_settings.delete_one({"_id": "config"})
        _cache.clear()
        return {"ok": True}

    # ---------- Público ----------
    @r.get("/blog/status")
    async def status():
        return {"enabled": bool(await cfg())}

    @r.get("/blog/articles")
    async def articles():
        res, _ = await upstream("GET", "/articles", cache=True)
        if res is None or res.status_code != 200:
            return []
        data = res.json()
        return data if isinstance(data, list) else (data.get("articles") or data.get("items") or [])

    @r.get("/blog/articles/{slug}")
    async def article(slug: str):
        res, _ = await upstream("GET", f"/articles/{quote(slug, safe='')}", cache=True)
        if res is None or res.status_code == 404:
            raise HTTPException(status_code=404, detail="Artículo no encontrado")
        if res.status_code != 200:
            raise HTTPException(status_code=502, detail="El motor de contenidos devolvió un error")
        return res.json()

    @r.post("/blog/track")
    async def track(body: TrackBody):
        try:
            await upstream("POST", "/track", json={"type": body.type[:60], "article_id": body.article_id})
        except HTTPException:
            pass
        return {"ok": True}

    @r.post("/blog/lead")
    async def lead(body: LeadBody):
        if "@" not in body.email or len(body.email) > 200:
            raise HTTPException(status_code=400, detail="Email no válido")
        res, _ = await upstream("POST", "/lead", json={"email": body.email.strip(), "name": (body.name or "")[:200],
                                                       "message": (body.message or "")[:5000], "article_id": body.article_id})
        if res is None:
            raise HTTPException(status_code=404, detail="Blog no conectado")
        if res.status_code >= 400:
            raise HTTPException(status_code=502, detail="No se pudo enviar el mensaje")
        return {"ok": True}

    @r.get("/blog-sitemap.xml")
    async def sitemap():
        res, _ = await upstream("GET", "/sitemap.xml", cache=True)
        if res is None or res.status_code != 200:
            raise HTTPException(status_code=404, detail="Sitemap no disponible")
        return Response(content=res.content, media_type="application/xml")

    @r.get("/blog/styles.css")
    async def styles():
        res, _ = await upstream("GET", "/styles.css", cache=True)
        if res is None or res.status_code != 200:
            return Response(content="", media_type="text/css")
        return Response(content=res.content, media_type="text/css", headers={"Cache-Control": "public, max-age=300"})

    return r
