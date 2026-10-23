import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Headset, PhoneCall } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { VL_SERVICES, VL_PLANS, VL_STATS, VL_FAQ, VL_REGISTER, VL_DEMO, VL_URL } from "@/pages/public/vozleadsData";

const LOGO = "https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png";
const fade = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true } };
const ext = { target: "_blank", rel: "noopener noreferrer" };

function Header() {
  return (
    <header className="fixed top-3 inset-x-3 z-50">
      <div className="max-w-7xl mx-auto h-16 px-4 sm:px-6 rounded-full backdrop-blur-xl bg-white/75 ring-1 ring-black/5 shadow-sm flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2" data-testid="vl-header-home"><img src={LOGO} alt="GoRoky" className="h-8 w-auto" /></Link>
        <nav className="flex items-center gap-2 sm:gap-6 text-sm font-bold">
          <a href="#servicios-vl" className="hidden md:inline text-slate-700 hover:text-[#015EEF] transition-colors">Servicios</a>
          <a href="#planes-vl" className="hidden md:inline text-slate-700 hover:text-[#015EEF] transition-colors">Planes</a>
          <a href={VL_REGISTER} {...ext} data-testid="vl-header-register" className="rounded-full bg-[#FF7A00] hover:bg-[#e66e00] text-white px-5 py-2.5 transition-colors">Empezar ahora</a>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#05070D] text-white pt-36 pb-24 lg:pt-44 lg:pb-28">
      <div className="pointer-events-none absolute -top-32 -left-32 h-[520px] w-[520px] rounded-full bg-[#FF7A00]/25 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[460px] w-[460px] rounded-full bg-[#015EEF]/30 blur-[130px]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link to="/" data-testid="vl-back-home" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-8"><ArrowLeft size={15} /> Volver a GoRoky</Link>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-4xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/15 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-[#FFB066]"><Headset size={14} /> VozLeads.com · Call center con IA</span>
          <h1 className="mt-6 font-heading text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter leading-[0.98]" data-testid="vozleads-page-title">
            Call center para tu negocio <span className="text-[#FF7A00]">24/7</span> desde 39 €/mes
          </h1>
          <p className="mt-6 text-base md:text-lg text-slate-300 max-w-2xl leading-relaxed">
            Tu recepcionista con inteligencia artificial contesta cada llamada, llama a tus leads en menos de 30 segundos, agenda citas y te avisa al instante. Voces en español 100% realistas, número incluido y sin permanencia.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <a href={VL_REGISTER} {...ext} data-testid="vozleads-register-btn" className="rounded-full bg-[#FF7A00] hover:bg-[#e66e00] text-white font-bold px-7 py-3.5 inline-flex items-center justify-center gap-2 shadow-[0_10px_30px_rgba(255,122,0,0.35)] transition-[transform,background-color] hover:-translate-y-0.5">Empezar ahora <ArrowUpRight size={17} /></a>
            <a href={VL_DEMO} {...ext} data-testid="vozleads-demo-btn" className="rounded-full bg-white/10 hover:bg-white/20 ring-1 ring-white/20 font-bold px-7 py-3.5 inline-flex items-center justify-center gap-2 transition-colors"><PhoneCall size={17} /> Recibir llamada demo gratis</a>
          </div>
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl">
            {VL_STATS.map((s) => <div key={s.k}><p className="font-heading text-3xl font-black">{s.k}</p><p className="text-xs text-slate-400">{s.v}</p></div>)}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Services() {
  return (
    <section id="servicios-vl" className="bg-[#F6F8FC] py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="font-heading text-3xl sm:text-4xl font-black tracking-tight mb-12">No pierdas ni una llamada <span className="text-[#015EEF]">ni un cliente</span></h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {VL_SERVICES.map((s, i) => (
            <motion.div key={s.id} {...fade} transition={{ delay: (i % 4) * 0.06 }} data-testid={`vl-service-${s.id}`} className="group rounded-[2rem] bg-white border border-slate-200/70 p-7 hover:-translate-y-1.5 hover:shadow-[0_20px_45px_rgba(1,94,239,0.12)] transition-[transform,box-shadow] duration-300">
              <span className="grid place-items-center h-12 w-12 rounded-2xl bg-[#FF7A00]/10 text-[#FF7A00] group-hover:bg-[#FF7A00] group-hover:text-white transition-colors"><s.icon size={22} /></span>
              <h3 className="mt-5 font-heading text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Plans() {
  return (
    <section id="planes-vl" className="bg-white py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="font-heading text-3xl sm:text-4xl font-black tracking-tight">Planes mensuales de minutos</h2>
        <p className="mt-3 text-slate-500">Sin permanencia y con número de teléfono incluido. Precios en euros, IVA no incluido.</p>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {VL_PLANS.map((p) => (
            <div key={p.id} data-testid={`vozleads-plan-${p.id}`} className={`relative rounded-[1.75rem] p-6 flex flex-col ${p.popular ? "bg-[#05070D] text-white ring-2 ring-[#FF7A00]" : "bg-[#F6F8FC] ring-1 ring-slate-200"}`}>
              {(p.popular || p.promo) && <span className={`absolute -top-3 left-6 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${p.popular ? "bg-[#FF7A00] text-white" : "bg-[#015EEF] text-white"}`}>{p.popular ? "Más elegido" : "Promoción"}</span>}
              <h3 className="font-heading text-xl font-bold">{p.name}</h3>
              <p className="mt-3"><span className="font-heading text-4xl font-black">{p.price} €</span><span className={p.popular ? "text-slate-400" : "text-slate-500"}>/mes</span></p>
              {p.old && <p className="text-xs mt-1"><s className="opacity-60">{p.old} €</s> · {p.note}</p>}
              <p className={`mt-2 text-sm font-semibold ${p.popular ? "text-[#FFB066]" : "text-[#015EEF]"}`}>{p.minutes}</p>
              <ul className="mt-5 space-y-2 text-sm flex-1">
                {p.features.map((f) => <li key={f} className="flex gap-2"><CheckCircle2 size={16} className="text-[#FF7A00] shrink-0 mt-0.5" />{f}</li>)}
              </ul>
              <a href={`${VL_REGISTER}?plan=${p.plan}`} {...ext} data-testid={`vozleads-plan-cta-${p.id}`} className={`mt-6 rounded-full text-center font-bold py-2.5 transition-colors ${p.popular ? "bg-[#FF7A00] hover:bg-[#e66e00] text-white" : "bg-[#015EEF] hover:bg-[#004cc7] text-white"}`}>{p.promo ? "Aprovechar promoción" : "Empezar"}</a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="bg-[#F6F8FC] py-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h2 className="font-heading text-3xl font-black tracking-tight mb-8">Preguntas frecuentes</h2>
        <Accordion type="single" collapsible className="space-y-3">
          {VL_FAQ.map((f, i) => (
            <AccordionItem key={i} value={`f${i}`} className="rounded-2xl bg-white border border-slate-200 px-5" data-testid={`vl-faq-${i}`}>
              <AccordionTrigger className="font-heading font-bold text-left">{f.q}</AccordionTrigger>
              <AccordionContent className="text-slate-600">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <div className="mt-12 rounded-[2rem] bg-[#05070D] text-white p-8 text-center">
          <p className="font-heading text-2xl font-bold">Escúchalo tú mismo en 15 segundos</p>
          <p className="mt-2 text-slate-400">Deja tu teléfono y el agente con IA te llama ahora.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a href={VL_DEMO} {...ext} data-testid="vl-final-demo" className="rounded-full bg-[#FF7A00] hover:bg-[#e66e00] font-bold px-6 py-3 inline-flex items-center gap-2"><PhoneCall size={16} /> Quiero la llamada demo</a>
            <a href={VL_URL} {...ext} data-testid="vl-final-visit" className="rounded-full bg-white/10 ring-1 ring-white/20 font-bold px-6 py-3">Visitar vozleads.com</a>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function VozLeadsPage() {
  useEffect(() => { document.title = "Call center con IA 24/7 desde 39 €/mes · VozLeads · GoRoky"; window.scrollTo(0, 0); }, []);
  return (
    <div data-testid="vozleads-page" className="font-body text-slate-900">
      <Header /><Hero /><Services /><Plans /><Faq />
    </div>
  );
}
