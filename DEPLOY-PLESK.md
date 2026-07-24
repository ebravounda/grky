# 🚀 Despliegue en Plesk — GoRoky Telecom CRM

Dominio: **a.rokymovil.com** · Repo: https://github.com/ebravounda/grky
Servidor Plesk compartido con otros proyectos (ingresoqr, gym24, tramilex, mvg…).

Arquitectura: React (build estático) + FastAPI/uvicorn (`/api`, puerto 8001) + MongoDB (Docker).

> ⚠️ **IP nueva**: este servidor tiene otra IP pública. Hay que **autorizarla en Likes** o dará 403. Obtenla con `curl -s https://api.ipify.org`.

---

## 0) Prerrequisitos (por SSH, como root/sudo)
```bash
curl -s https://api.ipify.org ; echo          # IP pública → dársela a Likes
docker --version                               # ¿hay Docker?
python3 --version ; node -v ; git --version
```
Si falta algo:
```bash
sudo apt update && sudo apt install -y python3-venv python3-pip git curl
# Docker (si no está):
curl -fsSL https://get.docker.com | sudo sh
# Node 20 (si no está):
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
```

## 1) MongoDB dedicado (Docker) — puerto propio para no chocar con otros proyectos
```bash
docker run -d --name goroky-mongo --restart unless-stopped -p 127.0.0.1:27021:27017 -v goroky_mongo_data:/data/db -e MONGO_INITDB_ROOT_USERNAME=goroky -e 'MONGO_INITDB_ROOT_PASSWORD=PonU$5naCl&ave(Fue4$$teAqui' mongo:7
docker ps | grep goroky-mongo
```

## 2) Clonar el proyecto (fuera del docroot, en /opt)
```bash
sudo mkdir -p /opt/goroky && sudo chown -R $USER:$USER /opt/goroky
git clone https://github.com/ebravounda/grky.git /opt/goroky
ls /opt/goroky        # debe verse backend/ y frontend/
```

## 3) Backend (FastAPI)
```bash
cd /opt/goroky/backend
python3 -m venv venv && source venv/bin/activate
pip install --upgrade pip && pip install -r requirements.txt
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
```
Crea `/opt/goroky/backend/.env`:
```bash
cat > /opt/goroky/backend/.env <<'EOF'
MONGO_URL=mongodb://goroky:PonU%245naCl%26ave%28Fue4%24%24teAqui@127.0.0.1:27021/?authSource=admin
DB_NAME=goroky_prod
CORS_ORIGINS=https://a.rokymovil.com
FRONTEND_URL=https://a.rokymovil.com
JWT_SECRET=CAMBIA_por_un_secreto_largo_aleatorio
ADMIN_EMAIL=admin@goroky.com
ADMIN_PASSWORD=CambiaEstaClaveFuerte!
LIKES_API_URL=https://api.likestelecom.com
LIKES_EMAIL=soporte@goroky.com
LIKES_PASSWORD=M0KZEvI6pNp8uU@N
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_MODE=live
RESEND_API_KEY=re_xxx
SENDER_EMAIL=no-reply@goroky.es
EOF
```
Servicio systemd `/etc/systemd/system/goroky-api.service`:
```ini
[Unit]
Description=GoRoky API
After=network.target docker.service
[Service]
WorkingDirectory=/opt/goroky/backend
EnvironmentFile=/opt/goroky/backend/.env
ExecStart=/opt/goroky/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 2
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now goroky-api
sudo systemctl status goroky-api
curl -s http://127.0.0.1:8001/api/health ; echo
```

## 4) Frontend (build)
```bash
cd /opt/goroky/frontend
printf "REACT_APP_BACKEND_URL=https://a.rokymovil.com\nWDS_SOCKET_PORT=443\n" > .env
corepack enable && yarn install && yarn build   # genera /opt/goroky/frontend/build
```

## 5) Plesk — crear el dominio y enlazar el build
1. Plesk → **Websites & Domains → Add Subdomain** → `a.rokymovil.com`.
2. Cambia el **Document Root** a: `/opt/goroky/frontend/build`
   (o crea un symlink desde el docroot del vhost a esa carpeta).
3. **SSL/TLS Certificates** → emite **Let's Encrypt** para `a.rokymovil.com`.

## 6) Plesk — proxy del API + SPA (nginx directives)
Plesk → dominio `a.rokymovil.com` → **Apache & nginx Settings** → **Additional nginx directives**:
```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
    client_max_body_size 25m;
}
location / {
    try_files $uri $uri/ /index.html;
}
```
Marca "Proxy mode" si Plesk lo pide y **Apply**.

## 7) Stripe webhook
Stripe (Live) → Webhooks → endpoint `https://a.rokymovil.com/api/billing/webhook`
(eventos: checkout.session.completed, invoice.payment_succeeded, invoice.payment_failed) → copia el `whsec_...` al `.env` y `sudo systemctl restart goroky-api`.

## 8) Likes — autorizar la IP nueva
```bash
curl -s https://api.ipify.org ; echo    # dásela a Likes
# comprobar cuando la autoricen:
curl -s -X POST https://api.likestelecom.com/token -H "Content-Type: application/json" -d '{"email":"soporte@goroky.com","password":"M0KZEvI6pNp8uU@N"}' ; echo
```
Token 200 → GoRoky conectará real. Luego en Configuración: **Importar catálogo desde Likes** → **Reconciliar todo**.

## ✅ Checklist
- [ ] `systemctl status goroky-api` running · `curl 127.0.0.1:8001/api/health` OK
- [ ] `https://a.rokymovil.com` carga la web · `/api/...` responde
- [ ] SSL activo · CORS = dominio (no `*`)
- [ ] IP del server enviada a Likes · token 200
- [ ] Webhook Stripe verificado · dominio Resend `goroky.es` verificado

## Actualizar
```bash
cd /opt/goroky && git pull
cd backend && source venv/bin/activate && pip install -r requirements.txt && sudo systemctl restart goroky-api
cd ../frontend && yarn install && yarn build
```
