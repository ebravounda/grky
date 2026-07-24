"""Migración de datos de configuración/catálogo entre entornos (preview → producción).

Uso:
    python3 migrate_data.py export /ruta/goroky_dump.json
    python3 migrate_data.py import /ruta/goroky_dump.json

Migra: tarifas, plantilla de contrato, promociones, permisos de rol,
ajustes de la app y contadores. NO migra clientes/líneas/facturas (datos de demo).
Lee MONGO_URL y DB_NAME de backend/.env del entorno donde se ejecuta.
"""
import sys
import os
import json
import asyncio
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

COLLECTIONS = ["tariffs", "contract_template", "promotions", "role_permissions",
               "app_settings", "counters"]


def _encode(doc):
    out = {}
    for k, v in doc.items():
        out[k] = str(v) if isinstance(v, ObjectId) else v
    return out


async def do_export(path):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    data = {}
    for col in COLLECTIONS:
        docs = await db[col].find().to_list(5000)
        data[col] = [_encode(d) for d in docs]
        print(f"  {col}: {len(data[col])} documentos")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✅ Exportado a {path}")


async def do_import(path):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    for col in COLLECTIONS:
        docs = data.get(col, [])
        for d in docs:
            _id = d.get("_id")
            # _id string (contract_template/role_permissions/counters) se mantiene;
            # _id de ObjectId se descarta para que Mongo genere uno nuevo (upsert por clave lógica)
            if isinstance(_id, str) and len(_id) != 24:
                await db[col].replace_one({"_id": _id}, d, upsert=True)
            else:
                d.pop("_id", None)
                key = "productId" if col == "tariffs" else ("promoId" if col == "promotions" else None)
                if key and d.get(key) is not None:
                    await db[col].replace_one({key: d[key]}, d, upsert=True)
                else:
                    await db[col].insert_one(d)
        print(f"  {col}: {len(docs)} importados")
    print("✅ Importación completada")


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("export", "import"):
        print(__doc__)
        sys.exit(1)
    action, path = sys.argv[1], sys.argv[2]
    asyncio.get_event_loop().run_until_complete(
        do_export(path) if action == "export" else do_import(path))


if __name__ == "__main__":
    main()
