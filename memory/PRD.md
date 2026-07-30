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

### Iteración 2026-06 (fork) — PIN/PUK reales + Titular/CDRs + auditoría total de sync
- **OpenAPI oficial guardado permanentemente** en `/app/backend/likes_openapi.json` (v2.1, 45 endpoints). NO volver a buscarlo online; consultarlo aquí.
- **PIN/PUK reales (P0 resuelto)**: `_refresh_line_live` y `reconcile_customer` traen `GET /line?withSimsInfo=true&withOwners=true` y persisten `pins{pin,puk,pin2,puk2}`, `imsi`, `esimData` (para eSIM), `titularName`, `activationDate` (campo `created` de Likes), `spn`, `icc` y `creditLimit` (`GET /line/credit-limit`). `GET /lines/{n}/sim` ahora refresca en vivo y devuelve el PIN/PUK EXACTO de Likes (antes eran aleatorios locales `_sim_pins`).
- **Titular + fecha de activación en la vista de línea (P1)**: `GET /lines/{n}` devuelve `titular{name,fiscalId,customerType,email,phone}` (desde `customers` local, fallback owner de Likes) y `activationDate`. Nueva tarjeta "Titular" en `LinePanel.js` (data-testid `line-titular-card`). Fix bug "Límite de crédito: undefined €".
- **CDRs reales (P1)**: `_refresh_line_live`/reconcile traen `GET /line/cdrs` y persisten `cdrs[:50]`. Tabla ya existente en LinePanel. En preview MOCK las líneas source=likes muestran 0 CDRs (sin datos reales); en VPS traen los reales.
- **Auditoría total push CRM→Likes** (usando spec oficial):
  - ✅ CON endpoint y ahora conectados: Suspender/Reactivar (`PUT /line/block`), SVAs/Roaming/Barrings/Desvío (`PUT /line/svas`), Límite crédito/gasto (`PUT /line/credit-limit`), Duplicar SIM (`POST /line/changeSim`), SPN (`PUT /line/spn`), **Cambio de titular** línea+suscripción (`POST /changeTitular`), **Cambio de tarifa/pack** (`POST /changeProduct`), **Añadir/Terminar opcional** (`POST /addOptionalProduct` / `POST /terminateOptionalProduct`).
  - ⚠️ SIN endpoint de escritura en Likes (imposible push directo, la API no lo expone): **Bono de datos** (solo vía orden/opcional), **Baja definitiva de línea main** (no hay endpoint; `terminate` ahora hace `PUT /line/block` para cortar servicio + requiere ticket para baja real), **Cambio de número** (no expuesto). Estos quedan locales y así se documenta al usuario.
  - Nuevas funciones en `likes_client.py`: `change_titular_remote`, `change_product_remote`, `add_optional_remote`, `terminate_optional_remote`, `get_credit_limit`.
- **PENDIENTE DESPLIEGUE VPS** (SIEMPRE tras cambios): Save to Github → `git pull` en VPS → recompilar frontend (`yarn build`, cambió LinePanel.js) → `systemctl restart goroky-api.service`. En preview la IP no está autorizada (MOCK) → el push a Likes no se ejecuta; se valida en el VPS.

### Iteración 2026-06 (fork) — Portabilidad en el alta pública (paridad con Likes)
- **Respuesta al flujo de alta**: al firmar en el portal público → se crea cliente+línea+suscripción+orden+factura locales, se envían emails (crear=“Firma tu contrato”, firmar=“Contrato firmado/aprovisionamiento”, Resend), y se ejecuta el alta REAL en Likes (`POST /customer` + subir DNI + `POST /signupv2` + subir contrato firmado). Estados espejo vía reconciliación.
- **NUEVO: Portabilidad implementada** (antes hardcodeada `portability:false`). Asistente `SignupWizard.js` con paso "Tu línea" idéntico a Likes:
  - **Tipo de línea**: Número nuevo / Portabilidad / Portabilidad prepago (móvil y fibra).
  - Portabilidad pide: **Operador donante** (`GET /public/donor-operators`), **Número a portar** (MSISDN), **ICC actual** (opcional), y **cambio de titular** (nombre+NIF del titular actual).
  - **Tipo de SIM** (móvil): eSIM / SIM física (pide ICC) / Enviar SIM (→ PENDING_MANUAL_SHIPPING).
- **Backend**: `ApplicationCreate` + doc de solicitud + orden guardan lineType/portability/portabilityType/donorOperatorId/portMsisdn/simType/simIcc/currentHolder*. En la firma la línea usa el MSISDN portado como número, se crea registro en `portabilities` (status INITIATED), y `_products_payload` (likes_sync) envía `portability`, `donorOperatorId`, `lineNumber`, `icc`/`eSim`+`eSimEmail` según el spec. `_app_to_contract` refleja portabilidad+operador+titular en el PDF.
- **Provincia ahora OBLIGATORIA** (Likes rechaza con `BILLING_ADDRESS_PROVINCE_NAME_REQUIRED`). Validado en wizard + backend. Al firmar con cliente existente se actualiza también su `billingAddress`.
- **Verificado**: payloads correctos por python (customer con provinceName, products con portability+donor+icc); flujo E2E create→sign por curl (orden portability=true, portabilidad INITIATED, línea con MSISDN); UI por screenshot (paridad con panel Likes).
- ⚠️ **IMPORTANTE productId**: `signupv2` debe recibir el **productId de Likes** (`tariff.likesProductId`). Hay que ejecutar "Importar catálogo/sync-catalog" para mapear los IDs reales; si una tarifa no tiene `likesProductId`, se envía el id local y Likes lo rechazará. Revisar antes de altas reales.
- ⚠️ **Likes conectado desde el pod de preview** en esta sesión (devolvió 98 operadores reales y validaciones reales en `/customer`). Aun así, el despliegue productivo es el VPS: Save to Github → git pull → yarn build → restart.

### Iteración 2026-06 (fork) — Configuración de Stripe en Ajustes + confirmación de subida de documentos
- **NUEVO: UI de Stripe en Ajustes** (`Settings.js`, tarjeta `stripe-config-card`): clave secreta, publicable, secreto del webhook y modo test/live. Se guardan en `app_settings` (Mongo). `GET /admin/settings` devuelve los secretos **enmascarados** (`••••XXXX`) y nunca en claro. Muestra la URL del webhook a configurar en Stripe.
- **Backend**: `_stripe_apply()` aplica la clave desde BD (fallback `.env`) antes de CADA operación de pago (create_checkout, payment_status, webhook, _ensure_stripe_customer/recurring, charge off-session, billing_daily_job) y en el startup. El webhook usa el signing secret de BD (fallback env). `GET /settings` devuelve `stripeConfigured/stripeMode/stripeWebhookConfigured/stripePublishableKey`. Verificado por curl (enmascarado, sin fugas, configured=true) y screenshot.
- **Documentos a Likes (confirmado en `likes_sync.py`)**: se suben **DNI/NIE anverso (obverseDocument) + reverso (reverseDocument)** y el **contrato firmado (signedContract)**. El **selfie NO** (Likes no lo requiere; es solo para KYC interno). **CIF/escrituras/IAE** aplican solo a empresas/autónomos y el alta pública actual es solo **Residential** → si se necesita alta de empresa con esos docs, es una feature futura (P2).
- **Auditoría botones→Likes (resumen para el usuario)**: CON push real: suspender/reactivar, SVAs, roaming, barrings, desvío, límite crédito/gasto, duplicar SIM, SPN, cambio de titular (línea+suscripción), cambio de tarifa, añadir/terminar opcional, alta con portabilidad. SIN endpoint en la API de Likes (no se puede push directo): bono de datos, baja definitiva (se hace bloqueo + ticket), cambio de número.

### Iteración 2026-06 (fork) — PWA lista para PWABuilder (Google Play / App Store)
- **Login rediseñado** (`Login.js`) estilo app móvil (cabecera degradado azul de marca + logo, tarjeta blanca redondeada, inputs con iconos, ver/ocultar contraseña, enlace "Contrata aquí"). **Eliminadas las credenciales de demo**.
- **PWA configurada** (CRA/craco):
  - `public/manifest.json`: id/name/short_name/description, display standalone, orientation portrait, theme_color/background_color `#0A6CFF`, lang es, categories, 4 iconos (192/512 any + 192/512 maskable).
  - `public/sw.js`: service worker (network-first para navegación SPA con fallback a index cacheado; stale-while-revalidate para estáticos; NO intercepta `/api`). Registrado en `public/index.html` on load.
  - Iconos generados de marca (azul #0A6CFF + wordmark GoRoky) con PIL: `icon-192/512`, `icon-maskable-192/512`, `apple-touch-icon` (180), favicons 16/32/ico.
  - `index.html`: link manifest, theme-color, apple-mobile-web-app-*, application-name, viewport con viewport-fit=cover.
  - Verificado: manifest/sw/iconos servidos HTTP 200; en navegador SW registrado + controller activo + manifest en DOM.
- **Uso de PWABuilder** (hacerlo contra el dominio PRODUCTIVO, p. ej. https://a.rokymovil.com, tras desplegar): pwabuilder.com → introducir URL → Package for stores. Android genera .aab (Play Console $25 único) + requiere hostear `/.well-known/assetlinks.json` que PWABuilder proporciona (para TWA sin barra de URL). iOS genera proyecto Xcode → requiere Mac + Apple Developer ($99/año).
- ⚠️ Empaquetar SIEMPRE contra el dominio productivo (no el preview). Screenshots del manifest omitidos (opcionales); se pueden añadir para mejorar la ficha de la tienda.

### Iteración 2026-06 (fork) — Gestión de acceso a la app + credenciales por email + cobertura de fibra real
- **Auth (auth.py)**: JWT ahora lleva `epoch`; login comprueba `appBlocked` (→403), actualiza `lastLogin`; `get_current_user` valida `epoch==sessionEpoch` (→401 si no) y `appBlocked` (→403). Verificado.
- **Menú admin "Usuarios de la app"** (`/app/app-users`, `AppUsers.js`): lista clientes con servicios activos, último acceso y estado; acciones: **restablecer contraseña** (genera + email "Contraseña de la app restablecida"), **poner contraseña manual**, **cerrar sesión** (invalida token), **bloquear/desbloquear**. Endpoints: GET `/admin/app-users`, POST `/admin/app-users/{id}/reset-password|set-password|logout|block`.
- **Acceso automático al activar servicio**: `_do_activate_order` llama `_ensure_client_access(cust)` → crea usuario cliente con contraseña temporal + envía email con datos de acceso (solo si no existía). Helper `_send_app_credentials`.
- **Cobertura/factibilidad de fibra REAL (Likes 3 pasos)**: `search_address` (GET /coverage/address → {items:[{address,gescal}]}), `get_buildings` (GET /coverage/buildings → {verticals:[{label,id}]}, id=gescal37), `check_coverage` (POST /coverage/format-coverage → lista normalizada a {valid, products, coverage:{label,technology}}). Endpoints admin `/coverage/{search,buildings,check}` + públicos `/public/coverage/*`. UI en `Catalog.js` (3 pasos, muestra disponibilidad FTTH + productos + dirección igual que Likes). Fallback mock si Likes no conectado. **OJO**: `_live_post/_live_put` devuelven tupla `(data, err)` — desempaquetar siempre.
- **Envío de SIM**: Likes NO expone API de envíos; el "Enviar SIM" se gestiona dentro de Likes (orden PENDING_MANUAL_SHIPPING). El registro `shipments` local refleja el estado de la orden vía reconciliación (no hay push/tracking por API).
- Verificado por testing_agent (iteración 9): backend 8/8, frontend OK. Likes LIVE desde el pod (cobertura real de "Gran Via Madrid": 10 direcciones → 97 verticales → FTTH disponible + 15 productos).

### Iteración 2026-06 (fork) — Tienda pública rediseñada (estilo WOM) + cobertura fibra pública + SEO
- **Cobertura de fibra en el flujo público**: componente `CoverageChecker.js` (endpoints `/public/coverage/*`, flujo real Likes 3 pasos). Integrado en: (a) tienda pública `PublicCatalog.js` (sección azul "¿Llega la fibra a tu casa?") y (b) asistente `SignupWizard.js` paso "Tu línea" para Fibra — **bloquea continuar si no hay cobertura** (`coverageOk`). Verificado con direcciones reales (Gran Vía Madrid → FTTH).
- **Rediseño tienda `/contratar`** (blueprint design_agent en `/app/design_guidelines.json`): header glass, hero con imagen + badge promo + CTA naranja (#FF7A00), tabs Móvil/Fibra/Satélite/TV, tarjetas de tarifa con badge "Más popular" y CTA naranja, diálogo de canales TV, sección cobertura azul, tarjetas de confianza, marquee de ciudades (framer-motion), footer SEO. Marca azul #015EEF + acento naranja #FF7A00, headings Outfit.
- **SEO**: `index.html` con `lang=es`, title/description/keywords con marca (goroky, soyroky, roky móvil) + 14 ciudades (Madrid, Barcelona, Valencia, Alicante, Granada, Málaga, Fuengirola, Benidorm, Marbella, Cádiz, Cáceres, Segovia, Tarancón, Cuenca), Open Graph + Twitter Card + canonical, **JSON-LD** (Organization con alternateName + areaServed, Store). `public/robots.txt` + `public/sitemap.xml`. Contenido de ciudades en marquee + footer.
- ⚠️ **APRENDIZAJE (evitar doom loop)**: tras `create_file overwrite=true` de un componente grande, el hot-reload de CRA a veces NO recompila el bundle (sirve el antiguo aunque diga "Compiled successfully"). SOLUCIÓN: `sudo supervisorctl restart frontend` para forzar recompilación limpia. Verificar con `curl localhost:3000/static/js/bundle.js | grep <string-nuevo>`.
- ⚠️ **SEO SPA**: es CRA client-rendered; el meta estático + JSON-LD cubren lo esencial, pero para indexación máxima de contenido dinámico convendría prerender/SSR (react-snap o similar) — pendiente P2.

### Iteración 2026-06 (fork) — Tienda como web principal (home) + dominio SEO rokymovil.com
- Ruta `/` ahora renderiza `PublicCatalog` (la tienda es la home). `RootRedirect` queda sin uso (login/app/portal siguen accesibles vía "Mi cuenta").
- SEO actualizado a dominio raíz: canonical/OG → `https://rokymovil.com/`, JSON-LD/robots/sitemap → `rokymovil.com`.
- ⚠️ Para que se vea en `rokymovil.com` (no solo `a.rokymovil.com`): el usuario debe apuntar el dominio raíz al app en su VPS (DNS A/CNAME + Nginx `server_name rokymovil.com www.rokymovil.com` + certificado/Cloudflare). Es config de infraestructura del VPS, no de código.

### Iteración 2026-06 (fork) — Rediseño PRO estilo WOM + CMS de contenido web + quitar "sin permanencia"
- **Rediseño `PublicCatalog.js`** (home `/` y `/contratar`) siguiendo `/app/design_guidelines.json` (bold, spacious, mobile-first estilo www.wom.cl). Header fixed glass (backdrop-blur-2xl), menú hamburguesa móvil (Sheet). Hero 12-col asimétrico con headline Outfit `font-black text-7xl`, imagen energética + tarjeta flotante "Portabilidad gratis". Tabs pill (Móvil/Fibra/Satélite/TV). Tarjetas: la del medio destacada en azul sólido #0033ff con badge "Más popular" y CTA naranja; resto blancas con sombra suave. Sección cobertura azul full-width. Ventajas (4 bloques). Marquee SEO con ciudades en outline text (WebkitTextStroke). Footer #0A0A0A. Colores: primary #0033ff, accent #FF7A00.
- **Fuentes**: `index.html` amplía Outfit a pesos 800;900 y Manrope 800 (para font-black de headings).
- **CMS "Contenido web"** (NUEVO). Backend: colección `db.site_content` (`_id:"home"`), `DEFAULT_SITE_CONTENT`, helper `get_site_content()` (merge con defaults). Endpoints: `GET /api/public/site-content` (público), `GET /api/admin/site-content` + `PUT /api/admin/site-content` (require_admin, body `{content: dict}`). Frontend: `pages/admin/SiteContent.js` en ruta `/app/site-content` (perm `settings.manage`), ítem nav "Contenido web" (icono Globe). Edita: hero (badge/título/destacada/subtítulo/CTAs), sección tarifas, sección cobertura, ventajas (add/remove + icono), ciudades (add/remove), footer (descripción SEO + datos legales). `PublicCatalog` lee de `/public/site-content` en tiempo real.
- **"Sin permanencia" ELIMINADO** de toda la UI pública (hero, ventajas, footer) porque la fibra SÍ tiene permanencia. La cláusula legal en `contracts.py` (duración/permanencia del contrato) se mantiene intacta (correcta).
- Verificado: backend curl (PUT guarda + público refleja + merge preserva ciudades), screenshots home desktop/planes OK, panel admin CMS OK. NO se usó testing_agent (cambios acotados a 1 endpoint CRUD + 1 página).
- ⚠️ DESPLIEGUE VPS: usuario debe hacer `cd /opt/goroky && git pull && cd frontend && sed -i 's#^REACT_APP_BACKEND_URL=.*#REACT_APP_BACKEND_URL=https://rokymovil.com#' .env && yarn install && yarn build && rm -rf /var/www/vhosts/rokymovil.com/a.rokymovil.com/* && cp -r build/* /var/www/vhosts/rokymovil.com/a.rokymovil.com/ && sudo systemctl restart goroky-api.service` (conservar `.htaccess` SPA).

### Iteración 2026-06 (fork) — Detalle de servicio tras icono "i" en tarjetas de tienda
- **Problema (prod)**: tras sincronizar catálogo de Likes, `marketingText` trae muchas líneas de detalle que estiraban las tarjetas y rompían la visual en rokymovil.com.
- **Fix (`PublicCatalog.js`)**: la tarjeta muestra máx. 3 features (con `line-clamp-2`); icono "i" (`data-testid=detail-{productId}`) junto al nombre abre Dialog "Detalle · {tarifa}" con TODO el marketingText + botón Contratar; si hay >3 items, enlace "Ver todo el detalle" (`more-{productId}`). Altura de tarjeta uniforme independiente del catálogo Likes.
- Verificado con screenshot (icono i + modal detalle OK). ⚠️ Tras editar componentes grandes, CRA no recompiló hasta `supervisorctl restart frontend`.

### Iteración 2026-06 (fork) — Alta pública SIN datos falsos: aprobación crea la orden REAL en Likes
- **Problema (crítico)**: al firmar en la web (`/public/applications/{token}/sign`) se creaba una línea local con datos FICTICIOS (nº "6"+uuid, ICC "8934"+uuid, `_sim_pins()` PIN/PUK aleatorios, `_gen_cdrs()` llamadas falsas, 50GB, esim_data mock) + suscripción, y `_trigger_likes_sync` corría ANTES de la aprobación del admin. El CRM mostraba datos inventados.
- **Nuevo flujo**:
  1. **Firmar** (`sign_application`): crea/actualiza cliente (datos reales del solicitante), crea ORDER en estado `PENDING_REVIEW` (sin línea, sin SIM, sin PIN/CDR/GB — `lineNumber` = nº a portar real o `None`), crea invoice y registro de portabilidad (estado `PENDING_APPROVAL`). NO crea línea/suscripción ni llama a Likes. Nada inventado.
  2. **Aprobar** (admin `/applications/{token}/approve` → helper `_provision_via_likes`): crea el alta REAL en Likes (`_trigger_likes_sync`: POST /customer + subida DNI + POST /signupv2 + subida contrato) → si Likes no conectado devuelve **503** / si falla **502** (NO fabrica nada); luego `likes_reconcile.reconcile_customer` espeja datos 100% reales (nº línea, ICC, PIN/PUK, SVAs, GB, estado, CDRs, eSIM) → activa servicio (email bienvenida con datos reales + acceso app).
  3. **Auto-aprobación tras pago** (webhook Stripe): también pasa por `_provision_via_likes` (envuelto en try/except HTTPException para no romper el webhook).
- `_do_activate_order`: ya NO sobrescribe el estado de una línea con `source=="likes"` (respeta el estado real).
- Frontend `Solicitudes.js`: el toast de éxito ahora dice "Alta aprobada y creada en Likes"; los errores 502/503 de Likes se muestran vía `apiErr`.
- **Verificado (curl preview)**: firmar → 0 líneas, 0 suscripciones, orden `PENDING_REVIEW`, `lineNumber=None`; aprobar sin Likes real → 502 `"No se pudo crear el alta en Likes: customer_failed"` en 0.79s y **0 líneas creadas**. En PRODUCCIÓN (Likes live) el alta se crea de verdad y se espejan los datos reales.
- ⚠️ **PENDIENTE (mismo espíritu)**: el alta manual del admin `create_order` (línea ~1206) TODAVÍA fabrica línea con `_gen_cdrs()`/`_sim_pins()`/ICC/50GB. Si se quiere 100% real también ahí, hay que enrutarla por Likes igual que el flujo público. Confirmar con el usuario.
- ⚠️ Preview: Likes en MOCK/403 (`customer_failed`), no se puede validar el alta real; validar en el VPS.

### Iteración 2026-06 (fork) — Todo 100% real + rechazo con motivo + reenvío + wizard móvil
- **Alta MANUAL admin (`create_order`) ahora 100% real vía Likes**: elimina línea/SIM/PIN/CDR/50GB ficticios. Crea el alta en Likes (`likes_client.create_order` signupv2) → reconcilia datos reales → orden con `likesOrderId` + `lineNumber` real. Si Likes no conectado → 503; si Likes rechaza → 502 (verificado: `INVALID_FISCAL_ID`, 0 líneas creadas, 0.45s). `commissions`/`installations`/`portabilities` solo si hay `line_number` real.
- **Email de aprobación**: `_do_activate_order` → asunto y título "¡Enhorabuena! Tu pedido se ha procesado correctamente".
- **Rechazo con motivo + corrección (no terminal)**: `RejectBody` añade `category`. Diccionario `REJECT_REASONS` (incomplete_data, doc_quality, doc_mismatch, selfie_issue, iban_issue, address_issue, other). `reject_application` → `reviewStatus=CHANGES_REQUESTED`, order `ON_HOLD`, envía email con el motivo + enlace `FRONTEND_URL/corregir/{token}`. Frontend `Solicitudes.js`: diálogo con selector de motivos (botones) + detalle opcional; badge naranja "Corrección pedida"; envía `{category, reason}`.
- **Reenvío del cliente**: `ResubmitBody` + `POST /public/applications/{token}/resubmit` (re-sube docFront/docBack/selfie + iban/phone/email opcionales, `reviewStatus→PENDING_REVIEW`, limpia rechazo, sync a customer.kyc). `_app_public_view` amplía con reviewStatus/rejectReason/rejectLabel/docs/iban/contactPhone. Nueva página pública `pages/public/ResubmitDocs.js` en ruta `/corregir/:token` (banner motivo + re-subida + CameraCapture). Verificado ciclo completo por curl (reject→CHANGES_REQUESTED→resubmit→PENDING_REVIEW) y screenshot de la página.
- **Wizard móvil (`SignupWizard.js`)**: grids `grid-cols-2` → `grid-cols-1 sm:grid-cols-2` (pasos Datos, Dirección/pago, resumen, cambio titular); indicador "Paso X de N · Nombre"; tarjetas `rounded-2xl` con sombra; padding responsive. Verificado con screenshot.
- ⚠️ Likes-dependiente (approve, alta manual) NO validable en preview (Likes MOCK/403). Validar en VPS con Likes live. En preview: comportamiento honesto confirmado (error claro + 0 datos falsos).

### Iteración 2026-06 (fork) — Control de tienda: mostrar/ocultar productos + elegir "Más popular"
- **Backend (tariffs)**: campos `storefront` (bool, visible en tienda, default True) y `popular` (bool). `TariffBody` +`storefront`. `create_tariff`/`update_tariff` persisten `storefront`. Nuevos endpoints admin: `PATCH /tariffs/{pid}/storefront` {visible} y `PUT /tariffs/{pid}/popular` {popular} (marca uno por familia, desmarca el resto de la misma familia). `public_catalog` y `public_product` filtran `storefront != False`. clean() expone `popular`/`storefront`.
- **Frontend `PublicCatalog.js`**: la tarjeta destacada usa `p.popular` (si hay alguno marcado en la familia); fallback al 2º si ninguno marcado.
- **Frontend `Tariffs.js`**: switch "Mostrar en la tienda pública" en el formulario; en cada tarjeta botones rápidos "Visible/Oculta" (toggle storefront) y "Marcar popular/Más popular" (toggle popular) + badges. Nota: `active` = disponibilidad interna; `storefront` = visibilidad en tienda (independientes).
- Verificado por curl (ocultar baja Mobile 14→13; popular aparece en catálogo público) y screenshot del panel de Tarifas.

### Iteración 2026-06 (fork) — Sincronización de estado de envío de SIM desde Likes (admin + cliente)
- **Modelo Likes** (openapi): el envío va por el ESTADO de la orden `PENDING_MANUAL_SHIPPING` y el tracking en `extCarrierId` del producto; existe `POST /draft-order-v2/send-order-tracking`.
- **`likes_reconcile.reconcile_customer`**: bucle de órdenes ampliado → detecta `PENDING_MANUAL_SHIPPING`/`extCarrierId`, hace upsert en `db.shipments` (status PENDING→SHIPPED, tracking=extCarrierId, likesOrderStatus raw, source=likes) y guarda `shippingStatus`/`tracking` en la orden. En el bucle de líneas refleja `shippingStatus`/`tracking` en la línea y marca DELIVERED cuando la línea pasa a ACTIVE (actualiza shipment + línea). `import uuid` añadido.
- **`update_shipment` (admin manual)**: al cambiar estado/tracking propaga `shippingStatus`/`tracking`/`carrier` a la línea (para que el cliente lo vea) + email al cliente en SHIPPED.
- **Frontend**:
  - `components/LinePanel.js` (compartido admin+cliente): banner `ShippingBanner` con estados Preparando/En camino/Entregada + nº de seguimiento (lee `line.shippingStatus`/`tracking`/`carrier`).
  - `pages/admin/Shipments.js`: botón "Actualizar desde Likes" (`POST /likes/reconcile-all`), columna Producto, sub-línea con el estado raw de Likes, badge source.
- Verificado con datos simulados + screenshots (panel Envíos y banner en detalle de línea). ⚠️ El poblado real depende de Likes live (preview MOCK): validar en VPS que las órdenes con SIM física reflejan PENDING_MANUAL_SHIPPING/extCarrierId.

### Iteración 2026-06 (fork) — Tarifas agrupadas por servicio + edición de info del catálogo de tienda
- **Backend**: `_features_to_marketing(features)` parsea líneas "Título: Valor" (o solo "Valor" → title vacío) a `marketingText`. `create_tariff`/`update_tariff` lo usan en lugar del genérico {title:"Incluye"}. Refleja títulos reales en `/public/catalog`.
- **Frontend `Tariffs.js`**: render agrupado por familia (FAMILY_ORDER: Mobile, Fiber, Satellite, TV + "Otros") con cabecera (icono + label + nº tarifas), ordenado por precio dentro de cada grupo. Card extraída a `renderCard(t)`. La tarjeta muestra la info del catálogo (marketingText, primeras 4 líneas). Formulario: textarea "Información del catálogo (así se ve en la tienda)" con formato Título: Valor + ayuda; `openEdit` reconstruye "title: value" (omite title genérico "Incluye"). `PublicCatalog` ya renderiza `title: value`.
- Verificado: PUT con features "Datos: 30 GB…" → marketingText con títulos correctos, reflejado en catálogo público; screenshot del panel agrupado.

### Iteración 2026-06 (fork) — Contrato oficial replicado + 100% editable desde admin
- **PDF oficial extraído** (contrato OFICIAL.pdf) y replicado en `contracts.py` (reescrito completo). Secciones en orden: cabecera con LOGO (assets/goroky_logo.png) + Nº contrato/fecha, "Datos de tu Contrato" (bienvenida), "Nuestros Datos" (operadores XFERA/Likes), "Tus Datos" (caja 2 col: CLIENTE, doc, NACIONALIDAD, TELÉFONO/EMAIL, DIR. FACTURACIÓN, DIR. ENVÍOS), "Importe total" (base/IVA/total), "Lo que vas a tener de {familia}" (tabla servicios + Subtotal + nota), "Lo que tienes que saber y aceptar" (legal + tratamiento datos + casilla ✓ + firma electrónica + enlaces), FIRMA CLIENTE/FECHA (firma imagen o nombre), "Aviso Legal" (apartados). Renderer `_Doc` con paginación automática, cabecera+pie en todas las páginas, wrap con salto de página.
- **Plantilla editable**: `DEFAULT_TEMPLATE` en contracts.py con todos los textos + `avisoSections` (lista). Placeholders: {customerName}{fiscalId}{docLabel}{customerAddress}{shippingAddress}{nationality}{customerEmail}{customerPhone}{contractNumber}{date}{productName}{lineNumber}{price}{priceBase}{priceIva}{priceTotal}{issuer*}{support*}{website}.
- **Backend**: `_get_contract_template` ahora MERGE con defaults; `PUT /contract-template` acepta dict libre (merge); nuevo `GET /contract-template/preview.pdf` (muestra ejemplo con datos ficticios). `_app_to_contract` y `_build_contract` amplían contexto (docLabel por docType, nationality, shippingAddress, products[], priceBase/Iva). Logo descargado a backend/assets/goroky_logo.png (1094x364).
- **Frontend `ContractTemplateCard.js`** (reescrito, en Settings): grupos Emisor/soporte, Textos, Condiciones, y editor de apartados de Aviso Legal (add/remove). Botones Ver ejemplo (abre PDF), Restaurar oficial, Guardar.
- Verificado: generación PDF sin errores (297KB, 2 págs), análisis confirma todas las secciones en orden y sin solapes; reset devuelve oficial; preview 200; screenshot del editor OK.

### Iteración 2026-06 (fork) — Tarifas (filtro/familias/sync/borrado/info) + Tipo cliente/doc + Facturación de alta
- **Tarifas admin**: agrupadas por familia con FILTRO (chips) — familias ampliadas: Mobile, Fiber, M2M, PBX, TV, Satellite, Bonos, Paquetes. Botón "i" (info-tariff-{id}) muestra condiciones del catálogo ordenadas. Botón "Sincronizar Likes" (POST /api/likes/sync-catalog: upsert por productId, actualiza costPrice=cesión, sin duplicar, conserva PVP editado) y "Vaciar catálogo" (DELETE /api/tariffs). BUG corregido: diálogo de edición con max-h-[90vh] overflow-y-auto (scroll). public_catalog dinámico por familia; PublicCatalog tabs dinámicas.
- **Tipo de cliente + documento (sync Likes)**: customerType (Residential/Freelance/Society = Particular/Autónomo/Empresa) y docType/fiscalIdType (DNI/NIE/CIF/Passport). En wizard público (customer-type-select, doc-type-select) y alta interna admin (cust-type, cust-doctype). likes_sync._customer_payload envía customerType + fiscalIdType mapeado. Confirmado por testing: Pasaporte aparece en ambos y se persiste.
- **Facturación del alta** (SIN cuota de alta): AppSettings + UI (Ajustes → Facturación): shippingFeePeninsula (def 8€), shippingFeeIslands (def 10€), billingDay (def 5). PUT /api/admin/settings. Helpers `_is_islands(postal)` (Canarias 35/38, Baleares 07) y `_proration(price, billingDay)`. `_create_invoice` reescrito: primera factura = línea "Envío de SIM" (8/10 según zona) + parte proporcional de la cuota (días hasta el día 5). Campos: shippingFee, proratedAmount, daysProrated, isFirstInvoice. El checkout cobra inv.total. Verificado (Península 8+0.28=8.28; Islas 10€).
- Testing iteration_11.json: 100% backend (9/9) + 100% frontend, 0 issues, retest_needed=false.

### Iteración 2026-06 (fork) — FIX 502 Gateway Timeout (event loop bloqueado) + facturación recurrente
- **Causa raíz del 502**: `likes_client.py` usa la librería síncrona `requests` y se invocaba dentro de endpoints `async` de FastAPI. En el alta/portabilidad, el flujo `aprobar → sync_alta_to_likes → reconcile_customer` encadena ~15-20 llamadas HTTP lentas y secuenciales que **congelaban el único worker de Uvicorn**; Nginx/Cloudflare no recibían respuesta a tiempo → 502.
- **Fix 1 (event loop libre)**: TODAS las llamadas de red a Likes (`likes_client.*`) ahora se ejecutan en un hilo con `await asyncio.to_thread(...)`. Cambios en `likes_reconcile.py` (todo el motor de reconciliación), `likes_sync.py` (create_customer/uploads/create_order/draft), y `server.py` (`_refresh_line_live`, todos los endpoints de gestión de líneas/suscripciones, coverage, donor-operators, sync-catalog, resources, create_order, health_job). `_app_to_contract` convertida a `async`.
- **Fix 2 (petición de alta rápida)**: en `_provision_via_likes` (aprobar/auto-aprobar) y en `create_order` (alta manual) la parte esencial en Likes (crear cliente + orden) es síncrona, pero la **reconciliación + activación** (lo más lento) se lanza en segundo plano con `_spawn_bg()` (`asyncio.create_task` con referencia anti-GC). Helpers nuevos: `_post_provision_bg(fiscal_id, contract_code)` y `_post_create_order_bg(fiscal_id, order_id)`. La orden se devuelve al instante con estado PROVISIONING/lineNumber=None; el email de bienvenida se envía en background con los datos reales ya espejados; los registros dependientes (comisión/instalación/portabilidad) se crean en background al obtener el nº de línea real.
- **Fix 3 (facturación recurrente)**: `_create_invoice(..., first=True)`. Con `first=False` (cobro recurrente en `_billing_success`, webhook Stripe `invoice.payment_succeeded`) → sin envío de SIM, sin prorrateo, cuota mensual completa, `isFirstInvoice=False`. El alta sigue usando `first=True` (envío + prorrateo hasta el día 5).
- **Validado en preview (Likes LIVE desde este pod)**: reconcile-all → 200 (3 clientes, 3 órdenes, 2 líneas). **Prueba de concurrencia CLAVE**: mientras reconcile-all corre (~27s de llamadas a Likes), `/auth/me` responde en **0.097s** (antes se habría bloqueado ~27s → 502). Smoke test: catálogo público, portal cliente, `me/contract.pdf`, contract PDF → todos 200.
- ⚠️ NO se usó testing_agent para el alta real: crearía **órdenes REALES en la cuenta de producción de Likes** del cliente (destructivo). Validado por concurrencia + smoke test de endpoints no destructivos + revisión de código. El alta real con portabilidad debe validarla el usuario en el VPS.
- **DESPLIEGUE VPS**: `cd /opt/goroky && git pull && sudo systemctl restart goroky-api.service` (solo backend cambió; NO hace falta recompilar frontend). Si se recompila igualmente: `cd frontend && yarn build && rm -rf /var/www/vhosts/rokymovil.com/a.rokymovil.com/* && cp -r build/* /var/www/vhosts/rokymovil.com/a.rokymovil.com/` (conservar `.htaccess` SPA).

### Iteración 2026-06 (fork) — Etiquetas de familia ES + rediseño público WOM/Entel
- **Etiquetas de familia**: Likes devuelve familias en inglés (Mobile, Fiber, Fixed, Convergent, TV, Satellite, Energy, Device, International, Other) que se mostraban crudas (p.ej. "Fixed", "Other"). Añadido mapeo a español en `PublicCatalog.js` (TAB_META) y `Tariffs.js` (famLabel/famIcon/FAMILY_ORDER): Móvil, Fibra (Fiber+Fixed), Paquetes, Satélite, TV, Internacional, Dispositivos, Energía, Otros.
- **Rediseño público** (`/app/frontend/src/pages/public/PublicCatalog.js`): tras probar variante oscura, el usuario pidió **fondo blanco + carrusel dinámico de imágenes** estilo wom.cl/entel.cl. Estado final: hero BLANCO con carrusel auto-rotativo (4s, framer-motion AnimatePresence + puntitos `hero-dot-{i}`, `hero-carousel-img`) de imágenes lifestyle (mujer con móvil, amigas, familia con fibra, calle de Madrid); tarjeta flotante "Portabilidad gratis"; tarifas con tabs pill en español y tarjeta destacada azul `#015EEF` + badge/CTA naranja `#FF7A00`; sección cobertura AZUL con comprobador en tarjeta blanca; marquee cinético de ciudades; footer oscuro. Se conservaron TODOS los data-testid y la estructura de datos/CMS (site_content). Blueprint del design_agent en `/app/design_guidelines.json`.
- Validado por screenshots (hero blanco con carrusel, tarifas con familias ES, cobertura azul). Cambio SOLO frontend → **desplegar requiere `yarn build`** en el VPS.
- Nota: hay dos pestañas "Fibra" (familias Fiber y Fixed de Likes ambas → "Fibra"). Si el usuario quiere fusionarlas, hacerlo en el backend `public_catalog`.

### Iteración 2026-06 (fork) — FIX precio contrato (coste vs PVP) + firma de contrato con Likes
- **FIX P0 precio en PDF del contrato (coste en vez de PVP)**. Causa raíz: `likes_reconcile.reconcile_customer` sobrescribía `order["price"]` con `o.get("price")` de Likes = **precio de cesión/wholesale** (p.ej. 5,92 €) en cada reconciliación. Como `_build_contract`/`_app_to_contract` usaban ese `price`, el PDF (admin y cliente) mostraba el coste, no el PVP de venta (10,83 €).
  - `likes_reconcile.py`: el precio wholesale de Likes ahora se guarda en `likesPrice` (NO pisa el PVP local). 
  - `server.py`: nuevo helper `_contract_price(product_id, fallback)` → el PDF SIEMPRE toma el `price` (PVP con IVA) actual de la tarifa por `productId`; `_build_contract` y `_app_to_contract` usan este helper. Robusto incluso para órdenes ya corruptas.
  - Verificado por curl+extract: orden con `price=5.92` (coste) + tarifa `LK-MOB-80` PVP=10,83 → el PDF muestra Precio total **10,83 €** (base 8,95 + IVA 1,88), NO 5,92.
- **Firma de contrato con Likes (bidireccional)**:
  - **Likes → CRM** (`likes_reconcile.py`): constante `SIGNED_ORDER_STATUSES` (SIGNATURE_COMPLETED, PENDING_PROVIDER, PROCESSING, PROVISIONING, ACTIVE, COMPLETED). Si Likes reporta la orden con firma completada, la orden local se marca `signed=True` + `signedAt` (idempotente). PENDING_CONTRACT_SIGNATURE = aún NO firmado.
  - **CRM envía correo de firma** (`server.py`): `POST /api/orders/{order_id}/send-signature-email` (admin) genera `signToken` en la orden y envía email (Resend) con enlace `/firmar-contrato/{token}`. Botón "Enviar firma" en `Orders.js` (`data-testid=order-send-sign-{orderId}`).
  - **Página pública de firma** `pages/public/ContractSign.js` (ruta `/firmar-contrato/:token`, endpoints `GET/POST /api/public/contract-sign/{token}` + `/contract.pdf`). Al firmar: marca la orden `signed=True/signedAt/signerName/signatureImage`, refleja la firma en `customer.kyc`, **sube el contrato firmado a Likes** en segundo plano (`likes_sync.upload_signed_contract` → `signedContract` de la orden, fail-safe) y envía email de confirmación.
  - Verificado E2E en preview por curl (enviar→token guardado; GET info precio 10,83; POST firma→signed=True, kyc actualizado) + screenshot de la página de firma. El push real a Likes es no-op en preview (MOCK); se valida en el VPS.
- ⚠️ **DESPLIEGUE VPS** (cambió backend Y frontend): `cd /opt/goroky && git pull && cd frontend && yarn install && yarn build && rm -rf /var/www/vhosts/rokymovil.com/a.rokymovil.com/* && cp -r build/* /var/www/vhosts/rokymovil.com/a.rokymovil.com/ && sudo systemctl restart goroky-api.service` (conservar `.htaccess` SPA). Tras desplegar, ejecutar una reconciliación para re-normalizar precios/firmas de órdenes existentes.

### Iteración 2026-06 (fork) — Alta manual con Titularidad + Tipo de SIM (paridad con Likes)
- **Problema/pedido**: el alta manual del CRM (`Orders.js` → "Nueva contratación") no tenía las opciones que sí muestra el panel de Likes en portabilidad: **Titularidad de la línea (Mantener / Cambiar titular)** y **Tipo de SIM (física / eSIM / Enviar SIM)**.
- **Backend** (`server.py`): `OrderCreate` ampliado con `portabilityType`, `simType`, `simIcc`, `changeHolder`, `currentHolderName`, `currentHolderFiscalId`. En `create_order` el `prod_payload` a `signupv2` ahora manda: eSim+eSimEmail / icc / (ship→PENDING_MANUAL_SHIPPING) según `simType`; y en portabilidad con cambio de titular añade `formerOwner={fiscalId,name}` (campo oficial de la spec para el titular anterior). Los campos se guardan en la orden local.
- **Frontend** (`Orders.js`): en el diálogo de nueva contratación, al activar Portabilidad aparece "Titularidad de la línea" (botones Mantener/Cambiar titular + inputs Nombre y NIF del titular actual si se cambia); y para familia Mobile aparece "Tipo de SIM" (SIM física con ICC / eSIM / Enviar SIM). data-testids: `order-keep-holder`, `order-change-holder`, `order-holder-name`, `order-holder-fiscal`, `order-sim-physical|esim|ship`, `order-sim-icc`.
- Verificado por screenshot del formulario (opciones visibles y funcionales). El envío real a Likes se valida en el VPS (preview MOCK). ⚠️ `formerOwner` a nivel de producto en signupv2 no está 100% documentado con propiedades; se envía {fiscalId,name} como mejor aproximación — confirmar en el VPS que Likes lo acepta; si no, el cambio de titular se completa vía `POST /changeTitular` tras el alta.
- DESPLIEGUE VPS (backend + frontend): git pull + yarn build + copiar build + restart backend.

### Iteración 2026-06 (fork) — Cambio de titular en portabilidad 100% sincronizado con Likes
- **Descubierto (vía capturas del panel de Likes + draft-order-v2 real)**: la portabilidad con cambio de titular en Likes requiere en el producto el objeto `formerOwner` con estructura EXACTA: `{name, firstSurname, lastSurname, fiscalId, fiscalIdType, representative:{...}}` + flag `hasFormerOwner:true`. Antes se enviaba `{fiscalId,name}` incompleto → Likes lo ignoraba (quedaba "Mantener titular").
- **Fix payload** (`server.py create_order`): `OrderCreate` ampliado con `currentHolderName/FirstSurname/LastSurname/FiscalId/DocType`. Construye `formerOwner` con la estructura exacta + `hasFormerOwner` + `representative` vacío. Verificado que el JSON coincide byte a byte con el del panel de Likes.
- **Formulario** (`Orders.js`): "Cambiar titular" ahora pide Tipo de documento (DNI/NIE/Passport), Documento, Nombre, Primer apellido, Segundo apellido (data-testids order-holder-doctype/fiscal/name/surname1/surname2).
- **Documento de cambio de titularidad** (Likes exige `signedTitularChange` como `required:true` además del `signedContract`): nuevo `contracts.generate_titular_change_pdf(ct)` (número, operador donante, titular anterior, nuevo titular, firma). `likes_sync.upload_signed_titular_change(order_id, pdf)` sube al slot `signedTitularChange`. En `_push_signed_contract_bg`, tras firmar, si la orden tiene `changeHolder`, genera y sube TAMBIÉN ese documento a Likes (fail-safe). Verificado: PDF generado con todos los datos (extract OK).
- DESPLIEGUE VPS (backend + frontend). Validar en el VPS que Likes muestra "Cambiar titular" con los datos tras el alta.

### Iteración 2026-06 (fork) — Cambio de titular: VERIFICADO funcionando en producción
- El endpoint oficial `signupv2` IGNORA `formerOwner`. Solución que FUNCIONA (validada por el usuario en el VPS): tras crear la orden con signupv2, se lee el borrador (`GET /draft-order-v2`), se inyecta `formerOwner`+`hasFormerOwner` en la línea Main conservando todos los campos, y se reenvía por `PUT /draft-order-v2/lines?orderId=` (mismo endpoint interno que usa el panel de Likes). `likes_client.update_order_lines()`.
- Confirmado por el usuario: Likes ya muestra "Cambiar titular" con el titular anterior tras el alta desde el CRM. Log de diagnóstico temporal retirado.

### Iteración 2026-06 (fork) — Firma que desbloquea la orden en Likes (digitalSignature=false)
- PROBLEMA: la orden quedaba "Pendiente de firma de contrato" en Likes tras firmar en el CRM. Causa 1: `create_order` usaba `digitalSignature: true` → Likes esperaba enviar SUS propios emails de firma y NO aceptaba el contrato subido por el CRM. Causa 2: el botón admin `POST /orders/{id}/contract/sign` solo marcaba signed=true, NO subía el contrato a Likes.
- FIX: `create_order` ahora usa `digitalSignature: false` (modo "subir contrato" → Likes da uploadURL para signedContract/signedTitularChange). `sign_contract` ahora dispara `_push_signed_contract_bg` (sube contrato firmado + cambio de titular a Likes). El flujo del cliente (/firmar-contrato) ya lo hacía.
- Solo backend. Órdenes creadas ANTES del fix (con digitalSignature true) quedan en modo firma digital de Likes; completar desde el panel ("Firma digital sin KYC" con emails) o recrear.

### Iteración 2026-06 (fork) — Firma con APROBACIÓN del admin antes de sincronizar con Likes
- Flujo pedido: cliente recibe email → firma en enlace → contrato firmado VISIBLE en el CRM → admin REVISA y APRUEBA → recién entonces se sube a Likes. Admin puede "volver a solicitar firma".
- `public_contract_sign`: al firmar el cliente NO sube a Likes; deja `signed=True, signApproved=False` (pendiente de aprobación). Log "PENDIENTE DE APROBACIÓN".
- Nuevo `POST /orders/{id}/approve-signature` (admin): valida que esté firmado, marca `signApproved=True/signApprovedAt` y dispara `_push_signed_contract_bg` (sube contrato + cambio de titular a Likes).
- `sign_contract` (botón Firmar admin directo): marca signed+signApproved y sube a Likes en un paso.
- `send-signature-email`: ahora genera token NUEVO y RESETEA la firma anterior (signed/signApproved false, $unset firma) → sirve de "Volver a solicitar firma".
- Orders.js: columna Contrato con 3 estados → "Contrato/Firmar/Enviar firma" (sin firmar), "⏳ Firmado · pendiente aprobar + Aprobar + Volver a solicitar" (firmado no aprobado), "✓ Firmado y aprobado". "Ver firmado" abre el PDF. data-testids: order-approve-, order-resign-, order-pending-approval-, order-approved-.
- Verificado por curl: cliente firma→signed/no aprobado (no sube a Likes); admin aprueba→signApproved + push. Solo backend+frontend, desplegar ambos.

### Iteración 2026-06 (fork) — DECISIÓN: firma digital de Likes SIN KYC (Opción A)
- Con digitalSignature:false la orden se auto-completaba al instante y el cambio de titular no alcanzaba a aplicarse. Con digitalSignature:true la orden espera firma y el cambio de titular SÍ funciona.
- Decisión del usuario: usar firma digital NATIVA de Likes SIN KYC (gratis, kyc:false). `create_order` ahora envía `{digitalSignature: True, kyc: False,...}`.
- PENDIENTE VERIFICAR EN VPS: (1) si Likes envía el enlace de firma automáticamente al email del cliente al crear la orden, o si requiere disparar un endpoint interno "Enviar firma digital" (capturar del panel si hace falta). (2) que el cambio de titular (PUT /draft-order-v2/lines) se aplique en este modo.
- El API público NO expone endpoint de envío de firma; si no es automático, habrá que capturar el interno del panel.

### Iteración 2026-06 (fork) — Correos profesionales + reflejo del contrato firmado de Likes
- Opción A confirmada funcionando (firma digital Likes sin KYC; el correo de firma de Likes llega a SPAM del cliente).
- NUEVO correo BIENVENIDA (`_send_welcome_roky`): al crear cliente en el CRM (`POST /customers`) se envía "Bienvenido a Roky Móvil" profesional con CTA al área de cliente.
- NUEVO correo CONTRATACIÓN EN CURSO (`_send_contratacion_en_curso`): al crear venta manual (`create_order`, likes_signature=True → "revisa SPAM, la firma la envía Likes") y en alta pública (`create_application`, likes_signature=False → enlace de firma propio). Recalca revisar SPAM/correo no deseado.
- REFLEJO DEL CONTRATO FIRMADO DE LIKES: `_fetch_likes_signed_contract(order)` descarga el `signedContract`/`contract` desde Likes (get_order_draft→downloadURL→download_document). Endpoint `GET /orders/{id}/signed-contract.pdf`. Frontend: botón "Contrato firmado (Likes)" en Orders para órdenes firmadas (api.openLikesSignedContract). El estado firmado lo detecta la reconciliación (SIGNED_ORDER_STATUSES).
- Verificado: create_customer 200 + dispara bienvenida; endpoints y sintaxis OK. Emails reales se validan en VPS (Resend rechaza dominios de prueba). Desplegar backend+frontend.

### Iteración 2026-06 (fork) — Sección Tarifas PRO (orden, búsqueda, sin duplicados, contador de clientes)
- CAUSAS detectadas: sync-catalog creaba nuevas con storefront=True (auto-publicaba TODO) y no dedupe; duplicados = semillas antiguas LK-MOB-* (sin likesProductId, precios viejos) coincidentes por nombre con las reales de Likes (con likesProductId).
- BACKEND: 
  - `sync-catalog`: nuevas tarifas ahora `storefront=False` (NO auto-publicar); matching ampliado (likesProductId → productId → nombre+familia) para no duplicar; NUNCA toca productName/marketingText/storefront de existentes (solo costPrice + vínculo).
  - `GET /tariffs`: añade `customerCount` (fiscalIds distintos en lines por productId/likesProductId/nombre).
  - `POST /tariffs/dedupe`: elimina duplicados por nombre+familia, conservando la vinculada a Likes/publicada/popular/editada.
  - `POST /tariffs/bulk-storefront {storefront,family}`: publica/oculta en bloque (reset de publicaciones).
- FRONTEND (Tariffs.js): búsqueda por nombre, orden por precio asc/desc, filtro "Publicadas (n)", botón "Ocultar todas", "Quitar duplicados", badge contador de clientes por tarjeta, familias Fiber="Fibra"/Fixed="Fijo" diferenciadas.
- Verificado en preview: /tariffs con customerCount 167→dedupe eliminó 8→159; UI con todos los controles (screenshot). Desplegar backend+frontend. El usuario debe pulsar "Quitar duplicados" y, si quiere, "Ocultar todas" para resetear publicaciones y publicar solo lo que elija.

### Iteración 2026-06 (fork) — Eliminar líneas y órdenes manualmente (limpieza de datos)
- Bug reportado: el resumen de rentabilidad en Tarifas sumaba TODO el catálogo (daba ~20.000€). FIX: totales = precio × customerCount (líneas activas) por tarifa; nota aclaratoria "sobre N líneas activas". (Tariffs.js)
- NUEVO borrado manual (solo CRM, no toca Likes): `DELETE /lines/{lineNumber}` (borra línea + subscriptions) y `DELETE /orders/{order_id}`. Requieren perms lines.manage / orders.manage. Log de evento. Nota: si existe en Likes, la línea reaparece al reconciliar.
- Frontend: Lines.js botón papelera por fila (line-delete-{n}) con confirm; Orders.js botón papelera por fila (order-delete-{orderId}) con confirm.
- Verificado por curl (DELETE línea y orden OK). Desplegar backend+frontend.

---
## 2026-07-30 · IBAN, tarjeta anclada y CRUD de facturas en perfil de cliente

**Contexto**: continuación tras arreglar el borrado de líneas/órdenes (405 en VPS → cambiado a POST porque Plesk/ModSecurity bloquea el método DELETE; primera funcionalidad de la app que usaba DELETE).

**Implementado (backend `server.py`)**:
- `POST /api/customers/{fiscalId}/billing` → guarda/edita `iban` y `paymentMethod` del cliente (perm `billing.manage`). El IBAN solo se almacena para consulta (el usuario lo introducirá manualmente en Stripe).
- `POST /api/invoices` → crea factura manual con múltiples conceptos (`items[]`), opcionalmente adjunta consumo por línea (`lineNumbers[]` → `_line_usage`). Totales: total (IVA incl.) = suma de `amount`; subtotal = total/1.21; IVA = total−subtotal. Envía email opcional.
- `POST /api/invoices/{id}/update` → edita factura NO pagada (conceptos, periodo, consumo, método, status). Bloquea 400 si `status=="paid"`.
- `POST /api/invoices/{id}/delete` (+ alias `DELETE`) → elimina factura NO pagada; 400 si pagada. Se usa POST por el bloqueo de DELETE del VPS.
- `POST /api/customers/{fiscalId}/send-card-link` → genera un enlace hosted de Stripe (Checkout modo suscripción, tarjeta) para que el CLIENTE introduzca su tarjeta; queda anclada a una suscripción mensual con primer cobro el día de facturación (`billingDay`, por defecto 5) vía `trial_end`. NO incluye cuota de alta (`include_setup_fee=False`). Importe = suma de líneas ACTIVE (fallbacks: cualquier línea con precio, o product de la suscripción). Envía el enlace por email al cliente.
- Helpers: `_invoice_totals`, `_consumption_for`, `_next_billing_day_ts`, parámetros `anchor_billing_day`/`include_setup_fee` en `_create_recurring_checkout`.

**Implementado (frontend `CustomerDetail.js`)**:
- Botón "Editar cobro" → diálogo IBAN + método de pago.
- Botón "Enviar enlace tarjeta" en cabecera → llama send-card-link, avisa por toast y abre el checkout.
- Sección Facturas: botón "Nueva factura" (diálogo con conceptos dinámicos + selección de líneas para consumo + total en vivo + envío por email), iconos por factura de reenviar (Mail), editar (Pencil, solo no pagadas) y eliminar (Trash2, solo no pagadas).

**Testing**: iteration_12.json → 100% backend (pytest 9/1 skip) y 100% frontend (Playwright). Sin issues críticos/menores. Nota: la factura PDF (`invoices.py`) ya renderizaba conceptos + consumo por línea + detalle de llamadas.

**Pendiente de despliegue en VPS** (cambió backend + frontend): Save to Github → git pull → yarn build → copiar build (conservar .htaccess) → restart goroky-api.service.

**Deuda técnica anotada por review** (no bloqueante): modularizar `server.py` (~4850 líneas) en routers; `InvoiceItemBody.quantity` se ignora en los totales (amount = total de línea).


---
## 2026-07-30 (b) · Marcar pagada, facturación mensual auto (día 5), descuentos y recordatorio de tarjeta

**Implementado (backend `server.py`)**:
- `POST /api/invoices/{id}/mark-paid` → marca factura como pagada manualmente (`paidManually`, `paidAt`, `paidBy`). Idempotente.
- **Facturación mensual automática**: `monthly_billing_job()` (cron diario 06:00 UTC, actúa solo el día `billingDay`=5). Emite la cuota mensual (kind=`recurring`, dedup por fiscalId+period) de cada cliente con líneas ACTIVE; si tiene tarjeta guardada, cobra off-session (PaymentIntent) y marca pagada. Omite clientes con suscripción Stripe activa (los cobra Stripe vía webhook). Trigger manual: `POST /api/billing/run-monthly`.
- **Descuentos**: `_invoice_totals` admite importes negativos; guard `total > 0` en crear/editar factura (400 si ≤0).
- **Recordatorio de tarjeta**: `card_reminder_job()` (cron diario 09:00 UTC). Reenvía el enlace de tarjeta a clientes con `cardLink.sentAt` que aún no la han añadido (`_has_card_on_file`), cada `CARD_REMINDER_DAYS` (3) hasta `CARD_REMINDER_MAX` (3) veces. `send-card-link` refactorizado a helper `_send_card_link` que persiste el seguimiento `cardLink`.

**Implementado (frontend `CustomerDetail.js`)**:
- Botón "marcar pagada" (check) en facturas pendientes.
- Botón "Añadir descuento" en el diálogo de factura (importe negativo); validación de total>0 en cliente.

**Testing**: iteration_13.json → 100% backend (pytest 8/8) y 100% frontend. Sin issues.

**Config (env opcional)**: `CARD_REMINDER_INTERVAL_DAYS` (3), `CARD_REMINDER_MAX` (3). Día de facturación = `billingDay` en app_settings (5).

**Pendiente despliegue VPS** (backend + frontend): Save to Github → git pull → yarn build → copiar build (conservar .htaccess) → restart goroky-api.service.

