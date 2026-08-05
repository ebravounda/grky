"""Sincroniza el contenido web (CMS) del inicio en la BD de PRODUCCIÓN.

Copia los banners del carrusel, los partners y el resto del contenido del CMS
que se configuró en el preview a la base de datos de producción. Las imágenes
son URLs públicas (CDN), así que cargan igual en producción.

Uso en el VPS (una sola vez, tras git pull):
    cd /opt/goroky/backend && python3 seed_site_content.py

Lee MONGO_URL y DB_NAME del .env de producción. Es idempotente: se puede
ejecutar las veces que haga falta.
"""
import asyncio
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

HERE = Path(__file__).parent
DATA_FILE = HERE / "site_content_export.json"


async def main():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        content = json.load(f)
    content.pop("_id", None)

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    existing = await db.site_content.find_one({"_id": "home"})
    await db.site_content.update_one(
        {"_id": "home"}, {"$set": content}, upsert=True)

    saved = await db.site_content.find_one({"_id": "home"})
    print("OK — contenido web sincronizado en producción")
    print(f"  DB: {os.environ['DB_NAME']}")
    print(f"  documento existía antes: {'sí' if existing else 'no (creado)'}")
    print(f"  heroBanners: {len(saved.get('heroBanners') or [])}")
    print(f"  partners: {len(saved.get('partners') or [])}")
    print("\nRecarga a.rokymovil.com y verás el carrusel de banners y los partners.")


if __name__ == "__main__":
    asyncio.run(main())
