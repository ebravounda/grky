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

### Iteración 2026-07 (sincronización real con Likes Telecom)
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
