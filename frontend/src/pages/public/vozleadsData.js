import { PhoneCall, CalendarCheck, Clock3, Mic2, Languages, PhoneIncoming, BellRing, Code2 } from "lucide-react";

export const VL_URL = "https://vozleads.com";
export const VL_REGISTER = "https://vozleads.com/registro";
export const VL_DEMO = "https://vozleads.com/#solicitar";

export const VL_SERVICES = [
  { id: "recepcion", icon: PhoneIncoming, title: "Recepcionista con IA 24/7", desc: "Atiende cada llamada entrante con voz natural, resuelve dudas y toma recados, también fuera de horario y festivos." },
  { id: "leads", icon: PhoneCall, title: "Llama a tus leads en < 30 s", desc: "Quien rellena tu formulario recibe la llamada al instante: califica, descarta curiosos y deja el resumen escrito." },
  { id: "citas", icon: CalendarCheck, title: "Agenda citas sola", desc: "Consulta tus huecos libres y cierra la cita durante la llamada. Recordatorio 24 h antes." },
  { id: "voces", icon: Mic2, title: "Voces 100% realistas", desc: "Ejecutivos con acento de España y Latinoamérica que respiran, hacen pausas y cambian de tono como una persona." },
  { id: "idiomas", icon: Languages, title: "Atención en varios idiomas", desc: "Español, inglés, portugués, francés, catalán, italiano y alemán con un ejecutivo nativo para cada idioma." },
  { id: "avisos", icon: BellRing, title: "Avisos al instante", desc: "Si el cliente pide hablar con una persona, recibes el aviso con el motivo. Llamadas grabadas y transcritas." },
  { id: "numero", icon: Clock3, title: "Número incluido, sin permanencia", desc: "Línea +34 lista desde el primer día, compatible con tu centralita. Cancela cuando quieras." },
  { id: "api", icon: Code2, title: "API y webhooks", desc: "Lanza llamadas de cobro, recordatorios o encuestas desde tu CRM y recibe el resultado automáticamente." },
];

export const VL_PLANS = [
  { id: "basico", name: "Básico", price: "39", old: "49", note: "Primeros 12 meses, luego 49 €/mes", minutes: "200 minutos · extra 0,46 €", features: ["Número incluido", "1 agente IA", "Formulario y botón web", "Grabación y transcripción"], promo: true, plan: "6acfdc757243df206f194520" },
  { id: "pyme", name: "Pyme", price: "69", minutes: "300 minutos · extra 0,41 €", features: ["Número incluido", "Hasta 5 agentes IA", "Agenda y citas", "Llamadas programadas + API"], plan: "6acfdc757243df206f194521" },
  { id: "empresa", name: "Empresa", price: "99", minutes: "500 minutos · extra 0,39 €", features: ["Agentes ilimitados", "Google Calendar y recordatorios", "API y webhooks", "Voces premium y soporte prioritario"], popular: true, plan: "6acfdc757243df206f194522" },
  { id: "oro", name: "Oro", price: "149", old: "279", note: "Primeros 12 meses, luego 279 €/mes", minutes: "1000 minutos · extra 0,35 €", features: ["5 llamadas a la vez", "Atención en varios idiomas", "API y webhooks", "Atención preferente 24/7"], promo: true, plan: "6ad14f1394aef8b665e6affd" },
  { id: "platino", name: "Platino", price: "299", old: "400", note: "Primeros 12 meses, luego 400 €/mes", minutes: "2000 minutos · extra 0,29 €", features: ["Agentes IA ilimitados", "Varios idiomas", "Voces premium", "Soporte preferente 24/7"], promo: true, plan: "6ad14f9b94aef8b665e6affe" },
];

export const VL_STATS = [
  { k: "< 30 s", v: "del formulario a la llamada" },
  { k: "24/7", v: "en el horario que elijas" },
  { k: "Gratis", v: "número de teléfono incluido" },
  { k: "100 %", v: "llamadas grabadas y transcritas" },
];

export const VL_FAQ = [
  { q: "¿Necesito contratar un número o telefonía IP?", a: "No. Todos los planes incluyen gratis un número de España (+34) ya configurado. Si tienes centralita, sigue funcionando igual." },
  { q: "¿El cliente sabe que habla con una IA?", a: "Sí. El agente avisa de la grabación, como exige el RGPD." },
  { q: "¿Qué pasa si el cliente quiere hablar con una persona?", a: "El agente toma nota del motivo y del mejor momento para llamar, y tu equipo recibe el aviso al instante." },
  { q: "¿Hay permanencia?", a: "No. Plan mensual de minutos, pagas con tarjeta y puedes cambiar o cancelar cuando quieras. Precios sin IVA." },
];
