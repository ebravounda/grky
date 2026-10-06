import { FileText, Store, CreditCard, Calculator, ShieldCheck, ScanLine, Bot, Building2 } from "lucide-react";

export const OF_URL = "https://openfactura.es";
export const OF_REGISTER = "https://openfactura.es/registro";
export const OF_LOGIN = "https://openfactura.es/login";

export const OF_SERVICES = [
  { id: "facturas", icon: FileText, title: "Facturas en segundos", desc: "Crea, envía y cobra facturas profesionales. Series, rectificativas y PDF automático con tu logo.", points: ["Series y rectificativas", "Plantillas con tu logo por sector", "Presupuestos que se convierten en factura"] },
  { id: "tpv", icon: Store, title: "TPV hostelería y retail", desc: "Punto de venta rápido para bares, restaurantes y tiendas: mesas, comandas, stock y tickets.", points: ["Mesas, comandas y propinas", "Stock, tallas, colores y códigos de barras", "Arqueo de caja y tickets 80/58 mm"] },
  { id: "cobros", icon: CreditCard, title: "Cobros con tarjeta (Stripe)", desc: "Envía un enlace de pago y la factura se marca pagada automáticamente al cobrar.", points: ["Botón «Enviar cobro» por email", "Conciliación automática", "RedSys próximamente"] },
  { id: "impuestos", icon: Calculator, title: "IVA e IRPF automáticos", desc: "Tus impuestos se calculan solos mientras facturas: modelos 303, 130 y resumen 390.", points: ["Modelos 303, 130 y 390", "IRPF 7% para nuevos autónomos", "Facturación intracomunitaria y 349"] },
  { id: "verifactu", icon: ShieldCheck, title: "Compatible VeriFactu", desc: "Cumple la ley antifraude de la AEAT: huella encadenada, QR y firma con tu certificado.", points: ["Registro y anulación con huella", "Código QR en cada factura", "Firma con certificado .pfx"] },
  { id: "gastos", icon: ScanLine, title: "Escaneo de gastos con IA", desc: "Haz una foto a tus tickets: la IA extrae proveedor, base e IVA por ti.", points: ["Lectura automática de tickets", "Categorización de gastos", "Almacenamiento digital seguro"] },
  { id: "fiscalbot", icon: Bot, title: "Asistente IA FiscalBot", desc: "Tu experto fiscal 24/7: resuelve dudas y revisa tus facturas antes de emitirlas.", points: ["Dudas de IVA e IRPF al instante", "Revisión previa de facturas", "Disponible 24/7"] },
  { id: "gestorias", icon: Building2, title: "Marca blanca para gestorías", desc: "Incorpora a todos tus clientes bajo tu propia marca, con tu logo y tus colores.", points: ["Tu logo y tu branding", "Todos tus clientes en un panel", "Reventa con margen"] },
];

export const OF_PLANS = [
  { id: "basico", name: "Básico", price: "0", tagline: "Para empezar a facturar", features: ["Hasta 10 facturas al mes", "Clientes y presupuestos", "Cálculo de IVA e IRPF"] },
  { id: "medio", name: "Medio", price: "9,99", tagline: "Para autónomos en activo", features: ["Hasta 100 facturas al mes", "Envío de facturas por email", "Escáner de gastos con IA"] },
  { id: "platino", name: "Platino", price: "24,99", tagline: "Sin límites y con VeriFactu", popular: true, features: ["Facturas ilimitadas", "VeriFactu AEAT + tu certificado", "Cobros con tarjeta (Stripe)"] },
  { id: "multiempresas", name: "Multiempresas", price: "49,99", tagline: "Para asesorías y grupos", badge: "Nuevo", features: ["Hasta 20 empresas y autónomos", "Todo lo de Platino en cada empresa", "Certificado y contabilidad por empresa"] },
];

export const OF_STATS = [
  { value: "15 h", label: "ahorradas al mes en gestión" },
  { value: "100%", label: "compatible con VeriFactu AEAT" },
  { value: "14 días", label: "de prueba gratis, sin tarjeta" },
];

export const OF_FAQ = [
  { q: "¿Qué es OpenFactura?", a: "Un programa de facturación online para autónomos y pymes en España: facturas, presupuestos, TPV, IVA/IRPF, VeriFactu y gastos con IA en una sola plataforma en la nube." },
  { q: "¿Es compatible con VeriFactu y la Agencia Tributaria?", a: "Sí. Registra y anula facturas con huella encadenada y QR, y firma con tu certificado digital conforme a la normativa de la AEAT." },
  { q: "¿Sirve para autónomos y para empresas (SL)?", a: "Sí. Hay planes para autónomos, pymes y un plan Multiempresas para asesorías que gestionan hasta 20 empresas." },
  { q: "¿Cuánto cuesta y hay permanencia?", a: "Desde 0 €/mes. Todos los planes incluyen 14 días gratis, opción anual con 2 meses gratis y sin permanencia." },
];
