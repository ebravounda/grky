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

## Implementado (2026-06)
- **Factura PDF formato Goroky** (emisor TRAMILEX GLOBAL SERVICE SL, bloque Factura, FACTURAR A, caja PAGO Y TOTALES base/IVA/total, tabla Concepto/Detalle/Precio, página 2 legal) + **desglose de consumo por línea** (minutos nacionales, SMS, datos y listado de números llamados).
- **Campos de consumo por línea en el CRM**: nationalMinutes, smsUsed, datos + listado CDRs (números llamados) en el detalle de línea (admin y portal).
- **Alta de cliente ampliada**: IBAN + método de pago (SEPA CORE/B2B/CASH/NO), reflejado en la factura.
- Auth JWT con roles + seed admin/cliente demo.
- Panel admin: dashboard con KPIs y gráfico, clientes (CRUD + alta portal), líneas (detalle, consumo GB, bloqueo/desbloqueo, SVAs, CDRs), catálogo + cobertura, contratación (crea línea+suscripción+**factura PDF**), facturas (listado + PDF + cobro Stripe), tickets, suscripciones.
- Portal cliente: resumen, tarjetas de líneas con consumo, detalle de línea, **cambio de pack**, facturas (PDF + pago Stripe), tickets.
- Facturas PDF con reportlab (IVA 21%). Pagos Stripe checkout EUR + página de resultado.
- Scoping por rol verificado (cliente no accede a datos de otros).
- Testing agent: backend 29/29, frontend 100% flujos críticos.

## Backlog priorizado
- **P0**: Conectar API real de Likes al autorizar la IP (sustituir mock por live en `likes_client.py` — ya intenta live automáticamente).
- **P1**: Flujo real de alta con documentación (subida DNI/contrato a uploadURL de Likes), portabilidades e instalaciones (endpoints Likes ya documentados). Firma digital de contratos.
- **P1**: Facturación recurrente mensual automática + remesas SEPA.
- **P2**: Multi-marca/multi-usuario admin, notificaciones email (seguimiento de orden), eSIM QR, gestión PBX/centralitas.
- **P2 (calidad)**: dividir server.py en routers; testids de nav explícitos.

## Próximas tareas
1. Autorizar IP en Likes y validar datos reales (token /token).
2. Implementar alta completa con subida de documentación y contrato.
3. Facturación recurrente + cobro automático.
