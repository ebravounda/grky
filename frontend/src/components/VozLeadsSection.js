import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Headset, PhoneCall } from "lucide-react";
import { VL_SERVICES, VL_STATS, VL_REGISTER, VL_DEMO } from "@/pages/public/vozleadsData";

const fade = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true } };

export default function VozLeadsSection() {
  return (
    <section id="vozleads" data-testid="vozleads-landing-section" className="relative overflow-hidden bg-[#05070D] text-white py-24 lg:py-32">
      <div className="pointer-events-none absolute -top-32 -left-32 h-[460px] w-[460px] rounded-full bg-[#FF7A00]/20 blur-[130px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-[#015EEF]/25 blur-[130px]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          <motion.div {...fade} className="lg:col-span-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/15 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-[#FFB066]">
              <Headset size={14} /> Nuevo · VozLeads.com
            </span>
            <h2 className="mt-5 font-heading text-4xl sm:text-5xl font-black tracking-tight leading-[1.02]" data-testid="vozleads-title">
              Call center para tu negocio <span className="text-[#FF7A00]">24/7</span>
            </h2>
            <p className="mt-4 font-heading text-2xl font-bold" data-testid="vozleads-price">
              desde <span className="text-5xl text-white">39 €</span><span className="text-slate-400 text-lg">/mes</span>
            </p>
            <p className="mt-5 text-slate-300 text-base md:text-lg leading-relaxed max-w-xl">
              Un agente telefónico con IA que habla como una persona: contesta tu teléfono, llama a tus leads en segundos, agenda citas y te avisa cuando un cliente quiere hablar contigo. Número incluido y sin permanencia.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={VL_REGISTER} target="_blank" rel="noopener noreferrer" data-testid="vozleads-landing-cta-register"
                className="rounded-full bg-[#FF7A00] hover:bg-[#e66e00] text-white font-bold px-6 py-3 inline-flex items-center gap-2 transition-[transform,background-color] hover:-translate-y-0.5">
                Empezar ahora <ArrowUpRight size={16} />
              </a>
              <a href={VL_DEMO} target="_blank" rel="noopener noreferrer" data-testid="vozleads-landing-cta-demo"
                className="rounded-full bg-white/10 hover:bg-white/20 ring-1 ring-white/20 font-bold px-6 py-3 inline-flex items-center gap-2 transition-colors">
                <PhoneCall size={16} /> Recibir llamada demo
              </a>
              <Link to="/vozleads" data-testid="vozleads-landing-cta-more" className="rounded-full px-4 py-3 inline-flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                Ver planes <ArrowRight size={16} />
              </Link>
            </div>
            <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {VL_STATS.map((s) => (
                <div key={s.k}><p className="font-heading text-2xl font-black text-white">{s.k}</p><p className="text-xs text-slate-400 leading-snug">{s.v}</p></div>
              ))}
            </div>
          </motion.div>
          <div className="lg:col-span-6 grid sm:grid-cols-2 gap-4">
            {VL_SERVICES.slice(0, 4).map((s, i) => (
              <motion.div key={s.id} {...fade} transition={{ delay: i * 0.07 }} data-testid={`vozleads-service-card-${s.id}`}
                className="rounded-[1.75rem] bg-white/[0.04] ring-1 ring-white/10 p-6 hover:bg-white/[0.08] hover:-translate-y-1 transition-[transform,background-color] duration-300">
                <span className="grid place-items-center h-11 w-11 rounded-2xl bg-[#FF7A00]/15 text-[#FF9A3D]"><s.icon size={20} /></span>
                <h3 className="mt-4 font-heading text-lg font-bold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-slate-400 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
