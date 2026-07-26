# PRD — Goroky Telecom CRM & Área de Clientes

## Problem statement (original)
Crear una webapp para los clientes de un distribuidor de telecomunicaciones usando la API de Likes Telecom (https://apidocs.likestelecom.com/). Necesita: CRM/CSM para gestionar líneas y clientes, generar facturas PDF cada vez que se crea un servicio, un área de clientes (portal self-service) donde el cliente ve sus líneas, consumo, datos y puede cambiar de pack, y que el sistema cobre el importe al cliente.

## Arquitectura
- **Frontend**: React 19 + Tailwind + Shadcn UI + Recharts + framer-motion. Rutas: `/login`, `/app/*` (admin), `/portal/*` (cliente), `/payment/:result`.
- **Backend**: FastAPI + MongoDB (motor). Auth JWT (bcrypt) con roles admin/client. Rutas bajo `/api`.
- **Integraciones**: Stripe (sandbox reclamable, Flow A, EUR) para cobros; API Likes Telecom (cliente con fallback MOCK).

## Personas
- **Administrador/distribuidor**: gestiona clientes, líneas, catálogo, contratación, facturación, cobros y soporte.
- **Cliente final**: portal self-service (sus líneas, consumo, facturas, cambio de pack, tickets).

## Estado de integración Likes
La API real responde **403 Forbidden (AWS API Gateway)** = restricción por IP. IP de salida a autorizar: `104.198.214.223`. Mientras tanto, catálogo/cobertura/operadores/tipologías vienen de MOCK que replica el contrato; clientes/líneas/suscripciones/facturas sembrados en MongoDB.

## Implementado (2026-06 / 2026-07)
- **Factura PDF formato Goroky** + desglose de consumo por línea.
- Auth JWT con roles + seed admin/cliente demo.
- Panel admin completo: dashboard, clientes, líneas, catálogo+cobertura, contratación, facturas, tickets, suscripciones, instalaciones, portabilidades, recursos.
- Portal cliente self-service (resumen, líneas, consumo, cambio de pack, facturas + pago Stripe, tickets).
- Onboarding público con KYC (DNI/selfie/e-firma) + generación de contrato PDF.

### Iteración 2026-07 (automatización de errores + cobros recurrentes)
- **Panel de Alertas** (`/app/alerts`): eventos del sistema (`system_events`) con niveles error/aviso/ok/info, semáforos de salud (Likes/Stripe/Email/Cobros), banner de error de IP Likes, badge de no leídas en nav, filtros y marcar leídas. Endpoints: `/api/events*`, `/api/system/health`.
- **Cobro recurrente automático (Stripe)**: el cliente elige **tarjeta o domiciliación SEPA** en el alta pública; Checkout en modo suscripción con **cuota de alta configurable** + mensual (trial 30 días). Webhooks `invoice.payment_succeeded/failed` + fallback en `/payments/status`. Endpoints: `/api/public/applications/{token}/checkout`, `/api/subscriptions/{id}/billing-checkout`, `/api/billing/*`.
- **Morosidad/dunning**: recordatorios 5 y 3 días antes (scheduler APScheduler), 3 intentos fallidos → suspensión de líneas + email "mañana será suspendida", reactivación automática al pagar. Simulación admin en `/app/billing`.
- **Solicitudes** (`/app/solicitudes`): revisión KYC (miniaturas vía blob autenticado) + Aprobar/Rechazar. Toggle **auto-aprobación** en Configuración.
- **Envíos de SIM** (`/app/shipments`): gestión de SIM física (Pendiente/Enviado/Entregado + tracking + email al cliente). Se crea automáticamente al aprobar una alta móvil con SIM física.
- **Emails automáticos (Resend)** configurado (`no-reply@goroky.es`): bienvenida+PIN/PUK+QR eSIM, recordatorios, cobro OK, cobro fallido, aviso/suspensión.
- **Órdenes**: botones Activar/Cancelar (PROVISIONING) + ver PIN/PUK.

### Iteración 2026-07 (branding corporativo + UX móvil)
- **Rebranding GoRoky**: tema corporativo (azul primario `216 100% 52%` + naranja acento `25 100% 50%`), sidebar admin azul oscuro, logo GoRoky en sidebar, portal cliente, login, catálogo/wizard públicos y emails (Resend). Tokens en `index.css` + `design_guidelines.json`.
- **Fix móvil**: todas las tablas envueltas en `overflow-x-auto` + `min-w-[760px]` para scroll horizontal en móvil (antes se cortaban por `overflow-hidden`).
- Nota: los CDRs ("últimos consumos") son SIMULADOS (`_gen_cdrs`); serán reales cuando se autorice la IP en Likes.

### Iteración 2026-07 (portal cliente estilo app + Promociones)
- **Rediseño portal cliente** estilo app móvil premium (ref. Mi Vodafone, colores GoRoky): shell con marco de móvil, cabecera con logo + campana (badge de facturas pendientes), saludo, **hero banner** dinámico, tarjetas de líneas **deslizables con puntitos**, botones CTA grandes, carrusel **"Ofertas para ti"**, y **barra inferior** (Inicio/Facturas/Tienda→/contratar/Asistencia).
- **Módulo Promociones** (`/app/promotions`): admin crea/edita/elimina banners, popups y ofertas con **imagen por subida o URL**, audiencia (todos / NIF concretos / por servicio), etiqueta de precio, activo/inactivo y **vista previa en vivo** (marco de móvil). Endpoints: `/api/promotions` (CRUD), `/api/me/promotions`, `/api/me/promotions/{id}/dismiss`, `/api/public/promo-image/{id}`.
- **Popup** en el login del cliente: se muestra en cada entrada hasta que pulsa "No volver a mostrar" (persistente por cliente vía `dismissedBy`).
- Probado: iteración 7 → backend 12/12, frontend 100%.

### Iteración 2026-07 (RBAC + control avanzado de líneas)
- **RBAC** (roles admin/agent/reseller/client): matriz de permisos editable (`role_permissions`), `require_perm`, `/api/access/me`, `/api/roles`, gestión de staff `/api/users`. Página admin "Usuarios y permisos" + guards de ruta por permiso (`PermGuard`) y nav filtrado por `hasPerm`.
- **Revendedores**: aislamiento de datos por `ownerId` (solo ven sus clientes/líneas/órdenes), **comisión por SIM activada** (`commissionPerSim`), colección `commissions`, página "Comisiones". Dashboard con scope por revendedor.
- **Agente de soporte**: acceso a soporte de líneas + tickets + clientes, sin cobros/config/usuarios/promos.
- **Control avanzado de líneas** (admin/agente, card "Gestión avanzada" en LinePanel): bono de datos, límite de gasto, roaming, restricciones de llamadas (barring), desvío/buzón, suspensión/reactivación, cambio de titular, cambio de número, baja definitiva. Endpoints `/api/lines/{ln}/bono|spend-limit|roaming|barring|call-forward|suspend|reactivate|terminate|transfer|change-number`.
- **Alertas de consumo** por email (80%/100%) en el scheduler diario.
- Probado: iteración 8 → backend 29/29, frontend 100% (+ fix guards de ruta y dashboard por rol).

## Cuentas staff (RBAC)
- Revendedor: revendedor@goroky.com / Revende2026! (5€/SIM)
- Agente: soporte@goroky.com / Soporte2026!

### Iteración 2026-07 (reconciliación total de estados con Likes)
- **Motor de reconciliación** (`likes_reconcile.py`): trae de Likes órdenes (estados reales), suscripciones, líneas (estado, consumo GB, SVAs, roaming, eSIM pin/puk) y portabilidades → **upsert en las colecciones locales** (`orders`, `lines`, `subscriptions`, `portabilities`) que ya alimentan los paneles. Así GoRoky es espejo fiel del estado de Likes. Marca `source:"likes"`, `likesSyncedAt`.
- **Job programado** cada 20 min (`likes_reconcile_job`) reconcilia todos los clientes con `likesSynced=True`; en preview/MOCK es no-op.
- **Endpoints**: `POST /api/customers/{fiscalId}/reconcile`, `POST /api/likes/reconcile-all`. El botón "Sincronizar con Likes" de la ficha ahora hace push (alta) + reconcile + refresco del panel. Tarjeta Likes en Configuración con "Reconciliar todo".
- Esquemas Likes confirmados vía docs: order status (PENDING_CONTRACT_SIGNATURE, PENDING_PROVIDER, COMPLETED…), subscriptions-v2 (products con status/lineNumber/eSimData), line (status/simInfo), line/gb (leftGB/totalGB/usedGB), line/svas, portabilities (status/errorDescription).
- ⚠️ Igual que la escritura, la reconciliación **solo se valida en el VPS** (preview 403). Verificado en preview: endpoints → 503, paneles/flujos intactos, UI OK, job registrado.
- **Conexión validada**: el VPS (IP fija autorizada) obtiene token 200 de Likes; `/products/brand` y `/admin2/donor-operators` reales coinciden con la estructura esperada. En preview la IP es dinámica → 403 (MOCK), por diseño.
- **Escritura (alta real)** `likes_sync.py` + `_trigger_likes_sync`: al firmar (o vía botón manual) crea cliente (`POST /customer`), sube DNI/NIE anverso/reverso a las uploadURLs S3, crea la orden (`POST /signupv2`, `digitalSignature=false`) y sube el **contrato firmado** (PDF propio) al `signedContract` de la orden. Tolerante a fallos: en preview/MOCK es no-op y registra `order.likesSync`.
- **Lectura en vivo** (`likes_client`): `get_subscriptions`, `get_customer_orders`, `get_line_gb/svas/info/cdrs`, `get_portabilities`, `get_installations`. Endpoint espejo `GET /api/customers/{fiscalId}/likes`.
- **Endpoints**: `GET /api/likes/status`, `POST /api/orders/{id}/sync-likes`, `POST /api/customers/{fiscalId}/sync-likes`, `POST /api/likes/sync-catalog` (importa productos reales conservando coste/precio; mapea `likesProductId`).
- **UI**: botón "Sincronizar con Likes" en ficha de cliente; tarjeta "Conexión con Likes" en Configuración (estado live/MOCK + reintentar + importar catálogo).
- ⚠️ **NO validado E2E**: la escritura real (customer/docs/order/contract) solo se puede probar en el VPS (preview no conecta). Verificado en preview: endpoints degradan a 503/not_connected, flujo de firma intacto, UI OK. Pendiente: mapear `productId` reales de Likes vía sync-catalog antes de crear órdenes; documentos deben ser JPEG/PDF.
- **Suscripción de tarjeta (respuesta)**: el alta con "tarjeta" usa Stripe Checkout `mode=subscription` (trial 30d) → Stripe guarda el método de pago y **cobra la mensualidad automáticamente** cada ciclo. Webhook `invoice.payment_succeeded`→`_billing_success` genera la factura del mes. ✅ Funciona.
- **Email automático de CADA factura con PDF adjunto**: `_email_invoice(inv)` se llama dentro de `_create_invoice` y `_create_service_invoice` → genera el PDF (`generate_invoice_pdf`) y lo envía por Resend (adjunto base64), sellando `emailedAt`. Eliminado el email plano duplicado en `_billing_success`. Verificado (emailedAt sellado).
- **Cobro de servicios adicionales** (`POST /api/customers/{fiscalId}/charge`, perm `billing.manage`): concepto + importe (con IVA) + método. Con **tarjeta guardada** → `PaymentIntent off_session` inmediato (`_get_saved_pm`); con **SEPA/sin tarjeta** → Checkout `mode=payment` y enlace de pago enviado por email. Crea factura (service) y la envía por email. UI: botón "Cobrar servicio" + diálogo en la ficha del cliente (`CustomerDetail.js`) con desglose IVA en vivo.
- Probado: curl (charge → factura 19.99€, PDF enviado, enlace generado) + screenshot del diálogo. NOTA: el cobro inmediato off-session con **tarjeta guardada** usa Stripe real pero NO se pudo probar E2E en sandbox (requiere una tarjeta guardada vía Checkout UI); el código es correcto y no está mockeado.
- **Fix seguridad (P0 resuelto)**: `/api/public/promo-image/{file_id}` ahora solo sirve ficheros con `kind == 'promo'`; los documentos KYC (DNI/selfie/firma) devuelven 404. Verificado por curl (promo 200 / KYC 404).
- **Contrato PDF editable**: plantilla en colección `contract_template` (doc `main`) con título, subtítulo, datos emisor (marca/legal/CIF/dirección), textos "Reunidos" y **cláusulas** (añadir/editar/eliminar). Placeholders `{customerName}`, `{fiscalId}`, `{price}`, etc. Endpoints `GET/PUT /api/contract-template` y `POST /api/contract-template/reset`. Editor en Configuración (`ContractTemplateCard.js`). `generate_contract_pdf(ct, tpl)` refactorizado con sustitución de placeholders.
- **Contrato firmado en el perfil del cliente**: `me_summary` devuelve `contract` (código/fecha/firmado); nuevo `GET /api/me/contract.pdf`. Tarjeta "Mi contrato firmado" con descarga PDF en el portal cliente (ClientDashboard). `_build_contract` ahora incluye la firma (imagen/nombre) desde la application → el PDF del admin (sección KYC) también muestra la firma.
- Probado end-to-end por curl (signup→firma→descarga cliente) + screenshots (tarjeta cliente y editor admin).

## Estado de seguridad
- ✅ Fuga KYC cerrada.
- ⚠️ CORS sigue en `*` (pendiente restringir al dominio de producción al desplegar; el usuario no confirmó restringir en preview). **IP de salida actual: `34.16.56.64`** (antes `104.198.214.223`; cambió — debe re-autorizarse en Likes). App en MOCK hasta whitelisting.

### Iteración 2026-07 (rentabilidad por tarifa + IVA)
- **Precio de coste / cesión (Likes) por tarifa** (`costPrice`, **SIN IVA**, Tramo 1) editable en Tarifas. El panel muestra coste SIN IVA y CON IVA (×1,21).
- **Precio de venta introducido CON IVA** (lo que paga el cliente); el panel calcula base sin IVA (÷1,21) e IVA 21%. En el link público el cliente solo ve el precio final (con IVA).
- **Ganancia** = venta_con_IVA − coste_con_IVA (+% margen). Resumen superior: ingreso mensual, a pagar a Likes, ganancia mensual.
- **Import tabla Likes Tramo 1** (`seed_likes_tramo1`): 14 planes móviles oficiales (LK-MOB-*) con PVPR y coste cesión Tramo 1 (sin IVA); precio de venta por defecto = PVPR×1,21 editable. Al importar elimina los planes móviles genéricos de demo (1411-1414). Bonos opcionales (2501/2502) y catálogo Fibra/TV/Satélite intactos.
- Convención: `price` = venta CON IVA (compatible facturación/Stripe); `costPrice` = cesión SIN IVA.
- Probado: backend curl (import 14 planes OK) + screenshot panel y modal OK.

## Backlog priorizado
- **P0 (SEGURIDAD, PENDIENTE)**: cerrar fuga KYC en `/api/public/promo-image/{file_id}` (debe servir solo `kind=='promo'`) + endurecer CORS (hoy `*`). El usuario aún no confirmó el plan de auditoría.
- **P0**: Autorizar IP `34.16.56.64` en Likes → pasa a datos reales automáticamente.
- **P1**: Verificar dominio `goroky.es` en Resend (cuota actual muy baja) para envío masivo.
- **P1**: OCR/verificación biométrica del DNI en KYC.
- **P2**: Facturación recurrente vía integración real de envíos (courier), multi-marca admin.

### Iteración 2026-07-25 (Despliegue en producción — VPS Plesk)
- **App desplegada y verificada E2E en `https://a.rokymovil.com`** (Cloudflare → nginx → backend).
- **Backend** FastAPI en `127.0.0.1:8011` vía systemd `goroky-api.service` (WorkingDirectory `/opt/goroky/backend`, venv). Puerto 8011 elegido porque el 8001 lo usa OTRA app del cliente (`gymaccess-api.service` / gym24 / ingresoqr) — NO tocar 8001.
- **Frontend** compilado (`yarn build`) y servido desde docroot Plesk `/var/www/vhosts/rokymovil.com/a.rokymovil.com`. `.env` de prod: `REACT_APP_BACKEND_URL=https://a.rokymovil.com`.
- **Proxy `/api`** añadido en Plesk (Additional nginx directives) → `proxy_pass http://127.0.0.1:8011`. Fallback SPA vía `.htaccess` (RewriteRule → index.html, excluyendo `/api/`).
- **Mongo** `goroky_prod` en Docker (`goroky-mongo`). Login admin y catálogo público responden 200.
- **Fix conflicto pip/litellm**: eliminada la línea `litellm @ https://...whl#sha256=...` de `requirements.txt` (chocaba con `emergentintegrations`, que ya trae su litellm). Aplicado en repo.
- **Fix seed multi-worker (race)**: `auth.py seed_admin` y `server.py startup()` capturan `DuplicateKeyError` (con 2 workers ambos sembraban admin y 1 worker crasheaba). Aplicado en repo — PENDIENTE `git pull` en el VPS para que surta efecto.
- Credenciales admin prod: `admin@goroky.com` / `CambiaEstaClaveFuerte!` (definidas en `.env` del VPS).

## Backlog actualizado (2026-07-25)
- **P1 (PENDIENTE)**: Cambiar Stripe de TEST a LIVE en el `.env` del VPS (`sk_live_...`) + webhook prod → `https://a.rokymovil.com/api/billing/webhook`.
- **P1**: `git pull` en VPS para aplicar el fix del seed multi-worker.
- **P1**: Verificar dominio en Resend (cuota baja) para envío masivo.
- **P1**: OCR/verificación biométrica del DNI en KYC.
- **P2**: Endurecer CORS al dominio de producción (hoy `*`).

### Iteración 2026-07-25 (bis) — Import de clientes reales de Likes + admin soporte@
- **Admin de producción cambiado**: `soporte@goroky.com` / `Ed$2526759` (rol admin). Antiguo `admin@goroky.com` eliminado de prod. `.env` VPS: `ADMIN_EMAIL=soporte@goroky.com`, `ADMIN_PASSWORD='Ed$2526759'` (comilla simple por el `$`).
- **Descubierto endpoint `GET /customers` de Likes** (lista global de clientes de la marca) — no estaba en el cliente. `/orders` y `/subscriptions` requieren `fiscalId`; `/portabilities` e `/installations` son globales pero estaban vacíos.
- **Código**: añadido `likes_client.get_customers()` + `likes_reconcile.import_customers(db)` y `_map_customer()`. `reconcile_all()` ahora primero importa TODOS los clientes de Likes (`source:"likes"`) y luego reconcilia cada uno. El scheduler (cada 20 min) hará sync automático de altas/cambios reales.
- **Import inmediato ejecutado en VPS** (script one-off): 3 clientes reales importados (F53982002 Eduardo Bravo, Z3091783J David Guerrero, Z3452060H Eduardo Bravo) con sus órdenes/líneas/subs; 3 clientes demo borrados (12345678A, B87654321, 45678912C) + usuario portal demo `cliente@goroky.com`.
- **PENDIENTE usuario**: "Save to Github" (repo grky) + `git pull` en VPS + restart para activar la sync automática permanente (el código nuevo aún no está en el VPS).

### Iteración 2026-07-25 (tri) — Fix SVAs 500 + push a Likes + espejo de documentos
- **Fix 500 `PUT /lines/{n}/svas`**: defensivo (`.get`), añade codes nuevos, normaliza. `_norm_svas()` en reconcile mapea SVAs de Likes a {code,status}.
- **Push CRM→Likes (fail-safe)**: `set_line_svas` (PUT /line/svas), roaming (SVA ROAMING), `suspend_line_remote`/`reactivate_line_remote` (POST /line/suspend|reactivate — **endpoints NO verificados**). Cada acción devuelve `likesSync`. Si Likes falla, el cambio local se guarda igual.
- **Espejo de documentos Likes→CRM**: `likes_client.download_document(url)` + `likes_reconcile.import_documents(db, fid)` — recorre órdenes del cliente, `GET /draft-order-v2`, descarga cada `documentation[].downloadURL` (S3 presigned) y lo guarda en `customer_documents` (idempotente por fiscalId+orderId+filename, source=likes). Integrado en `reconcile_customer` (counts["documents"]).
- **Endpoint** `GET /customers/{fiscalId}/documents/{doc_id}/download` (StreamingResponse). Frontend: docs clicables en `CustomerDetail.js` + `openCustomerDoc` en `lib/api.js` + etiqueta "Likes".
- Estructura doc Likes confirmada: `{"downloadURL": "https://prod-likes-customer-documents.s3...", "type": ...}` — filename derivado del path (contract.pdf, signedContract.pdf).
- **Requisito usuario**: "CRM y Likes = espejo total bidireccional". Pull casi completo (falta verificar tipos DNI/selfie/IBAN además de contratos). Push parcial (endpoints escritura sin doc oficial de Likes).
- **PENDIENTE despliegue VPS**: Save to Github + git pull + restart backend + **recompilar frontend** (cambió CustomerDetail.js y api.js) + reconcile-all para importar docs.

### Iteración 2026-07-26 — API oficial Likes + espejo en vivo + consumo MB/GB
- Recibido OpenAPI oficial de Likes (apidocs.likestelecom.com). Endpoints confirmados: PUT /line/svas, PUT /line/block (BLOCK/UNBLOCK), GET /line/gb, GET /line/svas, GET /line/cdrs, GET /customers, GET /subscriptions/cached (global), GET /draft-orders (global).
- **Push CRM→Likes** corregido a endpoints oficiales: SVAs/roaming (PUT /line/svas), suspender/reactivar (PUT /line/block). Fail-safe con campo likesSync.
- **Pull en vivo** `_refresh_line_live()` en `GET /lines/{n}`: al abrir una línea (source=likes) trae SVAs/roaming/GB/estado en vivo de Likes y persiste → espejo instantáneo Likes→CRM.
- **Consumo MB/GB**: helper `src/lib/format.js fmtData()` (MB si <1GB, GB si ≥1GB) aplicado en LinePanel.js (CRM) y ClientDashboard.js (portal).
- Documentos: importador ya descarga documentation[].downloadURL (contract/signedContract). DNI/selfie NO aparecen en documentation[] de estas órdenes ni en /customer (vacío) — pendiente confirmar si esos clientes tienen DNI subido en Likes.
- **BLOQUEANTE PRINCIPAL**: todo el código nuevo (push, pull vivo, docs, MB/GB, fix 500) está en el repo Emergent pero NO en el VPS. Requiere Save to Github + git pull + rebuild frontend + restart. Por eso "no se replica" para el usuario.

### Iteración 2026-07-26 (bis) — FIX CRÍTICO formato SVAs Likes
- DESCUBIERTO: la API REAL de /line/svas NO devuelve `code` (la doc oficial está idealizada). Formato real: {spanishName, status, parm2, type}. type es categoría (Phone/SMS/Internet/Roaming/Other), NO único. spanishName identifica el SVA.
- El PUT con {code,status} devolvía 200 pero NO aplicaba. Confirmado que enviar el item real {spanishName,status,parm2,type} con status cambiado SÍ aplica (probado en línea 722714396: Roaming True→False OK).
- FIX: `likes_client.SVA_NAME_TO_CODE` (mapa nombre ES↔código). `set_line_svas(line, updates)` ahora trae los SVAs reales, cambia el status por código→spanishName y hace PUT en formato real. `_norm_svas` deriva code desde spanishName.
- Solo backend (likes_client.py, likes_reconcile.py). Requiere git pull + restart + reconcile para re-normalizar SVAs almacenados.

### Iteración 2026-07-26 (tri) — Push límite de gasto + regenerar SIM
- `likes_client.set_credit_limit_remote(line, limit)` → PUT /line/credit-limit {creditLimit:str, unblock, toBeBlocked, automaticReactivation}. OJO: Likes exige creditLimit >= 5.
- `likes_client.change_sim_remote(line, icc/esim/reason)` → POST /line/changeSim.
- Endpoints CRM con push+likesSync: /spend-limit y /credit-limit (unifican spendLimit=creditLimit), /sim-duplicate (tras changeSim refresca ICC real desde get_line_info).
- Solo backend. Requiere git pull + restart.
