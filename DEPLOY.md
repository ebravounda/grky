# 🚀 Despliegue en producción — GoRoky Telecom CRM (aaPanel + SSH)

Repo: https://github.com/ebravounda/grky · Dominio: **portal.goroky.com**

Arquitectura: **React (build estático)** + **FastAPI/uvicorn** (`/api`) + **MongoDB**.
El backend arranca con `uvicorn server:app` desde la carpeta `backend/`. Todas las rutas del backend usan el prefijo `/api`.

> ✅ En el primer arranque, la app **auto-siembra** el catálogo (tarifas + planes Likes Tramo 1), el admin, la plantilla de contrato, promos y roles. Una base de datos vacía queda operativa sola. Si quieres conservar tus ediciones del preview (precios de tarifa, plantilla de contrato…), usa el script de migración (paso 8).

---

## 0) Requisitos en el VPS (desde aaPanel)
- **Nginx** (App Store de aaPanel)
- **Python 3.11+** (App Store → "Python project manager" o instala python3.11)
- **Node.js 18+** (App Store → "PM2 Manager" trae Node, o instala Node LTS)
- **MongoDB 6/7** (App Store → "MongoDB") o usa **MongoDB Atlas**
- Acceso **SSH** al servidor

---

## 1) Clonar el repositorio
```bash
cd /www/wwwroot
git clone https://github.com/ebravounda/grky.git goroky
cd goroky
```

---

## 2) Backend — entorno y dependencias
```bash
cd /www/wwwroot/goroky/backend
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
# La librería de integraciones de Emergent:
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
```

---

## 3) Backend — variables de entorno (`backend/.env`)
Crea `/www/wwwroot/goroky/backend/.env` con **tus valores de producción**:
```
# Base de datos
MONGO_URL=mongodb://127.0.0.1:27017
DB_NAME=goroky_prod

# Seguridad / CORS  ← ¡restringido a tu dominio! (ya no es *)
CORS_ORIGINS=https://portal.goroky.com
FRONTEND_URL=https://portal.goroky.com
JWT_SECRET=pon-aqui-un-secreto-largo-y-aleatorio

# Admin inicial (se crea al arrancar si no existe)
ADMIN_EMAIL=admin@goroky.com
ADMIN_PASSWORD=CambiaEstaClaveFuerte!

# Likes Telecom (IP del VPS debe estar autorizada por Likes)
LIKES_API_URL=https://api.likestelecom.com
LIKES_EMAIL=soporte@goroky.com
LIKES_PASSWORD=tu_password_likes

# Stripe (usa claves LIVE en producción)
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_MODE=live

# Emails (Resend — verifica el dominio goroky.es para envío masivo)
RESEND_API_KEY=re_xxx
SENDER_EMAIL=no-reply@goroky.es
GOROKY_LOGO_URL=https://portal.goroky.com/logo.png
```
> ⚠️ No dejes `CORS_ORIGINS=*` en producción. Con el valor de arriba solo tu dominio podrá llamar a la API.

---

## 4) Backend — servicio permanente (systemd)
Crea `/etc/systemd/system/goroky-api.service`:
```ini
[Unit]
Description=GoRoky API (FastAPI)
After=network.target mongod.service

[Service]
User=www
WorkingDirectory=/www/wwwroot/goroky/backend
EnvironmentFile=/www/wwwroot/goroky/backend/.env
ExecStart=/www/wwwroot/goroky/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 2
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```
Actívalo:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now goroky-api
sudo systemctl status goroky-api      # debe estar "active (running)"
curl -s http://127.0.0.1:8001/api/health   # o el endpoint de salud
```

---

## 5) Frontend — build de producción
```bash
cd /www/wwwroot/goroky/frontend
# Fija la URL del backend (mismo dominio, el proxy /api lo enruta):
echo "REACT_APP_BACKEND_URL=https://portal.goroky.com" > .env
echo "WDS_SOCKET_PORT=443" >> .env
corepack enable && yarn install
yarn build
# El resultado queda en: /www/wwwroot/goroky/frontend/build
```

---

## 6) aaPanel — crear el sitio y configurar Nginx
1. En aaPanel → **Website → Add site** → dominio `portal.goroky.com`.
2. Emite el **SSL** (Let's Encrypt) desde aaPanel para el dominio.
3. Website → `portal.goroky.com` → **Config file (Nginx)** y deja el `location` así:
```nginx
# Servir el build de React
root /www/wwwroot/goroky/frontend/build;
index index.html;

# API → backend uvicorn
location /api/ {
    proxy_pass http://127.0.0.1:8001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
    client_max_body_size 25m;      # subidas KYC / imágenes
}

# SPA: cualquier ruta que no sea un archivo → index.html
location / {
    try_files $uri $uri/ /index.html;
}
```
4. Guarda y **recarga Nginx** (aaPanel lo hace desde el botón, o `nginx -s reload`).

> Con esta config, el **frontend y el API viven bajo el mismo dominio** (`portal.goroky.com` sirve la web y `portal.goroky.com/api/*` va al backend). Por eso `REACT_APP_BACKEND_URL=https://portal.goroky.com`.

---

## 7) Stripe — webhook de producción
En el dashboard de Stripe (modo Live) → Developers → Webhooks → **Add endpoint**:
- URL: `https://portal.goroky.com/api/billing/webhook`
- Eventos: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`
- Copia el **Signing secret** (`whsec_...`) a `STRIPE_WEBHOOK_SECRET` en el `.env` y reinicia: `sudo systemctl restart goroky-api`.

---

## 8) (Opcional) Migrar tus datos del preview → producción
Para llevar tarifas editadas, plantilla de contrato, promos, roles y ajustes:
```bash
# En el entorno preview (Emergent), exporta:
python3 backend/migrate_data.py export /tmp/goroky_dump.json
# Copia el archivo al VPS (scp) y en el VPS importa:
python3 backend/migrate_data.py import /tmp/goroky_dump.json
```
> Migra las colecciones de configuración/catálogo. Los clientes/líneas/facturas del preview son datos de demo; en producción empiezas limpio.

---

## 9) Likes Telecom — autorizar la IP fija ✅
Obtén la IP pública de salida de tu VPS y dásela a Likes para el whitelisting:
```bash
curl -s https://api.ipify.org ; echo
```
En cuanto Likes autorice esa IP, la app pasa **sola** de MOCK a datos reales (el cliente detecta el 200 en `/token`).

---

## ✅ Checklist final
- [ ] `systemctl status goroky-api` → running
- [ ] `https://portal.goroky.com` carga la web (login GoRoky)
- [ ] `https://portal.goroky.com/api/...` responde (login admin funciona)
- [ ] SSL activo (candado verde)
- [ ] `CORS_ORIGINS` = tu dominio (no `*`)
- [ ] Webhook de Stripe verificado (evento de prueba OK)
- [ ] IP del VPS enviada a Likes
- [ ] Dominio de Resend `goroky.es` verificado (envío de facturas por email)

## Actualizar la app en el futuro
```bash
cd /www/wwwroot/goroky && git pull
# backend:
cd backend && source venv/bin/activate && pip install -r requirements.txt && sudo systemctl restart goroky-api
# frontend:
cd ../frontend && yarn install && yarn build
```
