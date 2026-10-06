import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Sparkles, MessageCircle } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { OF_SERVICES, OF_PLANS, OF_STATS, OF_FAQ, OF_REGISTER, OF_LOGIN, OF_URL } from "@/pages/public/openfacturaData";

const LOGO = "https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png";
const fade = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true } };

const RegisterBtn = ({ testid, className = "" }) => (
  <a href={OF_REGISTER} target="_blank" rel="noopener noreferrer" data-testid={testid}
    className={`rounded-full bg-[#FF7A00] hover:bg-[#e66e00] text-white font-bold px-7 py-3.5 inline-flex items-center justify-center gap-2 transition-[transform,background-color,box-shadow] hover:-translate-y-0.5 shadow-[0_10px_30px_rgba(255,122,0,0.35)] ${className}`}>
    Prueba gratis 14 días <ArrowUpRight size={17} />
  </a>
);

function Header() {
  return (
    <header className="fixed top-3 inset-x-3 z-50">
      <div className="max-w-7xl mx-auto h-16 px-4 sm:px-6 rounded-full backdrop-blur-xl bg-white/75 ring-1 ring-black/5 shadow-sm flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2" data-testid="of-header-home"><img src={LOGO} alt="GoRoky" className="h-8 w-auto" /></Link>
        <nav className="flex items-center gap-2 sm:gap-6 text-sm font-bold">
          <a href="#servicios" className="hidden md:inline text-slate-700 hover:text-[#015EEF] transition-colors">Servicios</a>
          <a href="#planes-of" className="hidden md:inline text-slate-700 hover:text-[#015EEF] transition-colors">Planes</a>
          <a href={OF_LOGIN} target="_blank" rel="noopener noreferrer" data-testid="of-header-login" className="hidden sm:inline text-slate-700 hover:text-[#015EEF] transition-colors">Ya tengo cuenta</a>
          <a href={OF_REGISTER} target="_blank" rel="noopener noreferrer" data-testid="of-header-register"
            className="rounded-full bg-[#015EEF] hover:bg-[#004cc7] text-white px-5 py-2.5 transition-colors">Probar gratis</a>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#05070D] text-white pt-36 pb-24 lg:pt-44 lg:pb-32">
      <div className="pointer-events-none absolute -top-32 -left-32 h-[520px] w-[520px] rounded-full bg-[#015EEF]/35 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[460px] w-[460px] rounded-full bg-[#FF7A00]/20 blur-[130px]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "56px 56px" }} />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link to="/" data-testid="of-back-home" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-8"><ArrowLeft size={15} /> Volver a GoRoky</Link>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-4xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/15 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-[#7FB0FF]">
            <Sparkles size={14} className="text-[#FF7A00]" /> OpenFactura.es · Software fiscal todo en uno
          </span>
          <h1 className="mt-6 font-heading text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter leading-[0.98]">
            Facturación, impuestos y <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4D93FF] to-[#FF7A00]">mucho más</span>.
          </h1>
          <p className="mt-6 text-base md:text-lg text-slate-300 max-w-2xl leading-relaxed">
            Facturas con plantillas propias, TPV para hostelería y retail, cobros con tarjeta, IVA, IRPF, VeriFactu y una IA que te ayuda. Para autónomos y pymes en toda España.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <RegisterBtn testid="openfactura-register-btn" />
            <a href={OF_URL} target="_blank" rel="noopener noreferrer" data-testid="of-hero-visit"
              className="rounded-full bg-white/10 hover:bg-white/20 ring-1 ring-white/20 font-bold px-7 py-3.5 inline-flex items-center justify-center gap-2 transition-colors">
              Visitar openfactura.es
            </a>
          </div>
          <p className="mt-4 text-sm text-slate-500">Sin tarjeta de crédito · Cancela cuando quieras</p>
        </motion.div>
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl">
          {OF_STATS.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.1 }}
              className="rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur p-5" data-testid={`of-stat-${i}`}>
              <p className="font-heading text-3xl font-black">{s.value}</p>
              <p className="text-sm text-slate-400 mt-1">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Services() {
  return (
    <section id="servicios" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
      <motion.div {...fade} className="max-w-2xl mb-14">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF7A00] mb-3">Servicios</p>
        <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">Todo lo que tu negocio necesita</h2>
      </motion.div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {OF_SERVICES.map((s, i) => (
          <motion.div key={s.id} {...fade} transition={{ delay: (i % 4) * 0.06 }} data-testid={`of-service-${s.id}`}
            className={`group rounded-[2rem] p-7 border transition-[transform,box-shadow] duration-300 hover:-translate-y-1.5 ${[0, 5, 6, 7].includes(i) ? "lg:col-span-2" : ""} ${i === 0 || i === 7 ? "bg-[#015EEF] text-white border-transparent hover:shadow-[0_24px_50px_rgba(1,94,239,0.35)]" : "bg-white border-slate-200/70 hover:shadow-[0_20px_45px_rgba(1,94,239,0.12)]"}`}>
            <span className={`grid place-items-center h-12 w-12 rounded-2xl ${i === 0 || i === 7 ? "bg-white/15" : "bg-[#015EEF]/10 text-[#015EEF]"}`}><s.icon size={22} /></span>
            <h3 className="mt-5 font-heading text-xl font-bold">{s.title}</h3>
            <p className={`mt-2 text-sm leading-relaxed ${i === 0 || i === 7 ? "text-white/85" : "text-slate-500"}`}>{s.desc}</p>
            <ul className="mt-5 space-y-2">
              {s.points.map((p) => (
                <li key={p} className={`flex items-start gap-2 text-sm ${i === 0 || i === 7 ? "text-white/90" : "text-slate-600"}`}>
                  <CheckCircle2 size={16} className={`shrink-0 mt-0.5 ${i === 0 || i === 7 ? "text-white" : "text-emerald-500"}`} /> {p}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Plans() {
  return (
    <section id="planes-of" className="bg-[#F6F8FC] py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fade} className="max-w-2xl mb-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF7A00] mb-3">Planes y precios</p>
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">Un plan para cada etapa</h2>
          <p className="mt-4 text-slate-600 text-base md:text-lg">14 días gratis en cualquier plan. Opción anual con 2 meses gratis. Sin permanencia.</p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {OF_PLANS.map((p, i) => (
            <motion.div key={p.id} {...fade} transition={{ delay: i * 0.08 }} data-testid={`openfactura-plan-${p.id}`}
              className={`relative rounded-[2rem] p-8 flex flex-col ${p.popular ? "bg-[#05070D] text-white shadow-[0_24px_60px_rgba(1,94,239,0.35)] lg:-translate-y-3" : "bg-white border border-slate-200/70"}`}>
              {(p.popular || p.badge) && (
                <span className={`absolute top-6 right-6 text-[11px] font-bold uppercase tracking-wider rounded-full px-3 py-1 ${p.popular ? "bg-[#FF7A00] text-white" : "bg-[#015EEF]/10 text-[#015EEF]"}`}>{p.popular ? "Popular" : p.badge}</span>
              )}
              <h3 className="font-heading text-xl font-bold">{p.name}</h3>
              <p className={`text-sm mt-1 ${p.popular ? "text-slate-400" : "text-slate-500"}`}>{p.tagline}</p>
              <p className="mt-6 flex items-end gap-1">
                <span className="font-heading text-5xl font-black tracking-tighter leading-none">{p.price}€</span>
                <span className={`mb-1 ${p.popular ? "text-slate-400" : "text-slate-400"}`}>/mes</span>
              </p>
              <ul className="mt-7 space-y-3 flex-1">
                {p.features.map((f) => (
                  <li key={f} className={`flex items-start gap-2.5 text-sm ${p.popular ? "text-slate-200" : "text-slate-600"}`}>
                    <CheckCircle2 size={17} className={`shrink-0 mt-0.5 ${p.popular ? "text-[#7FB0FF]" : "text-emerald-500"}`} /> {f}
                  </li>
                ))}
              </ul>
              <a href={OF_REGISTER} target="_blank" rel="noopener noreferrer" data-testid={`openfactura-plan-cta-${p.id}`}
                className={`mt-8 rounded-full py-3.5 font-bold inline-flex items-center justify-center gap-2 transition-[transform,background-color] hover:-translate-y-0.5 ${p.popular ? "bg-[#FF7A00] hover:bg-[#e66e00] text-white" : "bg-[#015EEF] hover:bg-[#004cc7] text-white"}`}>
                {p.price === "0" ? "Empezar gratis" : "Prueba gratis 14 días"} <ArrowUpRight size={16} />
              </a>
            </motion.div>
          ))}
        </div>
        <p className="mt-8 text-sm text-slate-500">¿Gestionas más de 20 empresas? Hay plan de 50 empresas y planes a medida: <a href="mailto:soporte@goroky.com" className="text-[#015EEF] font-semibold hover:underline" data-testid="of-custom-plan-email">soporte@goroky.com</a></p>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <motion.h2 {...fade} className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight mb-10">Preguntas frecuentes</motion.h2>
      <Accordion type="single" collapsible className="space-y-3">
        {OF_FAQ.map((f, i) => (
          <AccordionItem key={i} value={`f${i}`} className="rounded-2xl border border-slate-200 px-6" data-testid={`of-faq-${i}`}>
            <AccordionTrigger className="font-heading text-left font-bold hover:no-underline">{f.q}</AccordionTrigger>
            <AccordionContent className="text-slate-600 leading-relaxed">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-4 sm:px-6 lg:px-8 pb-24">
      <div className="relative overflow-hidden max-w-7xl mx-auto rounded-[2.5rem] bg-[#015EEF] text-white px-8 py-16 lg:px-16">
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-[#FF7A00]/40 blur-[100px]" />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div>
            <h2 className="font-heading text-3xl sm:text-4xl font-black tracking-tight">Prueba OpenFactura gratis</h2>
            <p className="mt-3 text-white/85">Sin tarjeta de crédito. Sin compromiso. Te acompañamos paso a paso.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <RegisterBtn testid="of-final-register" />
            <a href="https://wa.me/34633377358" target="_blank" rel="noopener noreferrer" data-testid="of-final-whatsapp"
              className="rounded-full bg-white text-[#015EEF] font-bold px-7 py-3.5 inline-flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-transform">
              <MessageCircle size={17} /> Habla con nosotros
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function OpenFacturaPage() {
  useEffect(() => { window.scrollTo(0, 0); document.title = "OpenFactura · Facturación para autónomos y pymes | GoRoky"; }, []);
  return (
    <div className="min-h-screen bg-white text-[#0A0A0A] font-body selection:bg-[#FF7A00] selection:text-white" data-testid="openfactura-page">
      <Header />
      <Hero />
      <Services />
      <Plans />
      <Faq />
      <FinalCta />
      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} GoRoky · OpenFactura.es — <Link to="/" className="hover:text-[#015EEF]" data-testid="of-footer-home">Volver al inicio</Link>
      </footer>
    </div>
  );
}
