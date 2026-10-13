"""Motor SEO falso para pruebas locales: uvicorn tests.mock_blog_engine:app --port 9999"""
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response

app = FastAPI()
KEY = "testkey123456"
TRACK, LEADS = [], []
ART = {"id": "a1", "title": "Cómo ahorrar en tu tarifa móvil", "slug": "ahorrar-tarifa-movil",
       "excerpt": "Guía práctica para pagar menos.", "meta_title": "Ahorrar en tu tarifa móvil | Goroky",
       "meta_description": "Consejos para ahorrar.", "cover_url": "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200",
       "published_at": "2026-06-01T10:00:00Z", "cluster": "Ahorro",
       "html": '<h2>Introducción</h2><p>Texto del artículo.</p><a href="#" data-track="cta_click">Ver tarifas</a>',
       "faq": [], "key_points": [], "author": {"name": "Ana Pérez", "bio": "Experta en telecom.", "photo_url": "", "credentials": "10 años en el sector"},
       "jsonld": {"@context": "https://schema.org", "@type": "Article", "headline": "Cómo ahorrar"}}


def chk(key):
    if key != KEY:
        raise HTTPException(status_code=401)


@app.get("/api/public/site1/connect")
def connect(key: str):
    chk(key)
    return {"ok": True, "brand": "Goroky", "published": 1, "api_base": "http://localhost:9999/api/public/site1", "key": KEY}


@app.get("/api/public/site1/articles")
def articles(key: str):
    chk(key)
    return [{k: ART[k] for k in ("id", "title", "slug", "excerpt", "meta_title", "meta_description", "cover_url", "published_at", "cluster")}]


@app.get("/api/public/site1/articles/{slug}")
def article(slug: str, key: str):
    chk(key)
    if slug != ART["slug"]:
        raise HTTPException(status_code=404)
    return ART


@app.post("/api/public/site1/track")
async def track(req: Request):
    b = await req.json(); chk(b.get("key")); TRACK.append(b); return {"ok": True}


@app.post("/api/public/site1/lead")
async def lead(req: Request):
    b = await req.json(); chk(b.get("key")); LEADS.append(b); return {"ok": True}


@app.get("/api/public/site1/sitemap.xml")
def sitemap(key: str):
    chk(key)
    return Response('<?xml version="1.0"?><urlset><url><loc>https://goroky.com/blog/ahorrar-tarifa-movil</loc></url></urlset>', media_type="application/xml")


@app.get("/api/public/site1/styles.css")
def styles():
    return Response(".mseo-root h2{color:#015EEF}", media_type="text/css")


@app.get("/debug")
def debug():
    return {"track": TRACK, "leads": LEADS}
