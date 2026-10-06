import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, CheckCircle2, Sparkles } from "lucide-react";
import { OF_SERVICES, OF_PLANS, OF_REGISTER } from "@/pages/public/openfacturaData";

export default function OpenFacturaSection() {
  const [main, ...rest] = OF_SERVICES;
  return (
    <section id="openfactura" data-testid="openfactura-landing-section" className="relative overflow-hidden bg-[#F6F8FC] py-24 lg:py-32">
      <div className="pointer-events-none absolute -top-40 right-0 h-[480px] w-[480px] rounded-full bg-[#015EEF]/10 blur-[120px]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-10 items-end mb-14">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="lg:col-span-7">
            <span className="inline-flex items-center gap-2 rounded-full bg-white ring-1 ring-slate-200 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-[#015EEF]">
              <Sparkles size={14} className="text-[#FF7A00]" /> Nuevo · OpenFactura.es
            </span>
            <h2 className="mt-5 font-heading text-4xl sm:text-5xl font-black tracking-tight leading-[1.02]">
              Tu negocio conectado <span className="text-[#015EEF]">y facturando</span> en dos clics
            </h2>
          </motion.div>
          <motion.p initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="lg:col-span-5 text-slate-600 text-base md:text-lg leading-relaxed">
            Software de facturación en la nube para autónomos y pymes: facturas, TPV, cobros con tarjeta, IVA/IRPF y VeriFactu. Todo en una sola plataforma.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            data-testid={`openfactura-service-card-${main.id}`}
            className="md:col-span-2 lg:row-span-2 relative overflow-hidden rounded-[2rem] bg-[#05070D] text-white p-8 lg:p-10 flex flex-col">
            <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-[#015EEF]/40 blur-[90px]" />
            <span className="grid place-items-center h-14 w-14 rounded-2xl bg-white/10 ring-1 ring-white/15 text-[#7FB0FF]"><main.icon size={26} /></span>
            <h3 className="mt-6 font-heading text-3xl font-bold">{main.title}</h3>
            <p className="mt-3 text-slate-300 leading-relaxed max-w-md">{main.desc}</p>
            <div className="mt-8 rounded-2xl bg-white/5 ring-1 ring-white/10 p-5 font-mono text-sm space-y-2 relative">
              <div className="flex justify-between text-slate-400"><span>Factura F26012</span><span className="text-emerald-400">VeriFactu ✓</span></div>
              <div className="flex justify-between"><span>Diseño web</span><span>1.100,00 €</span></div>
              <div className="flex justify-between"><span>IVA (21%)</span><span>231,00 €</span></div>
              <div className="flex justify-between border-t border-white/10 pt-2 font-bold text-white"><span>Total</span><span>1.331,00 €</span></div>
            </div>
            <div className="mt-auto pt-8 flex flex-wrap gap-3">
              <a href={OF_REGISTER} target="_blank" rel="noopener noreferrer" data-testid="openfactura-landing-cta-register"
                className="rounded-full bg-[#FF7A00] hover:bg-[#e66e00] text-white font-bold px-6 py-3 inline-flex items-center gap-2 transition-[transform,background-color] hover:-translate-y-0.5">
                Prueba gratis 14 días <ArrowUpRight size={16} />
              </a>
              <Link to="/openfactura" data-testid="openfactura-landing-cta-more"
                className="rounded-full bg-white/10 hover:bg-white/20 ring-1 ring-white/20 text-white font-bold px-6 py-3 inline-flex items-center gap-2 transition-colors">
                Ver servicios y planes <ArrowRight size={16} />
              </Link>
            </div>
          </motion.div>
          {rest.map((s, i) => (
            <motion.div key={s.id} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i % 4) * 0.06 }}
              data-testid={`openfactura-service-card-${s.id}`}
              className="group rounded-[2rem] bg-white border border-slate-200/70 p-7 hover:-translate-y-1.5 hover:shadow-[0_20px_45px_rgba(1,94,239,0.12)] transition-[transform,box-shadow] duration-300">
              <span className="grid place-items-center h-12 w-12 rounded-2xl bg-[#015EEF]/10 text-[#015EEF] group-hover:bg-[#015EEF] group-hover:text-white transition-colors"><s.icon size={22} /></span>
              <h3 className="mt-5 font-heading text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
          <Link to="/openfactura" data-testid="openfactura-landing-card-more"
            className="group rounded-[2rem] bg-[#FF7A00] text-white p-7 flex flex-col justify-between hover:-translate-y-1.5 hover:shadow-[0_20px_45px_rgba(255,122,0,0.3)] transition-[transform,box-shadow] duration-300">
            <ArrowUpRight size={28} className="group-hover:rotate-45 transition-transform duration-300" />
            <div>
              <h3 className="mt-5 font-heading text-lg font-bold">Descubre todo OpenFactura</h3>
              <p className="mt-2 text-sm text-white/85">Servicios, planes y preguntas frecuentes.</p>
            </div>
          </Link>
        </div>

        <div className="mt-10 rounded-[2rem] bg-white border border-slate-200/70 p-6 lg:p-8 grid sm:grid-cols-2 lg:grid-cols-5 gap-6 items-center" data-testid="openfactura-landing-plans">
          <div className="lg:col-span-1">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF7A00]">Planes</p>
            <p className="font-heading text-xl font-bold mt-1">Sin permanencia</p>
          </div>
          {OF_PLANS.map((p) => (
            <div key={p.id} data-testid={`openfactura-landing-plan-${p.id}`} className={`rounded-2xl p-4 ${p.popular ? "bg-[#015EEF] text-white" : "bg-slate-50"}`}>
              <p className={`text-sm font-bold ${p.popular ? "text-white/80" : "text-slate-500"}`}>{p.name}</p>
              <p className="font-heading text-3xl font-black tracking-tight">{p.price}€<span className={`text-sm font-medium ${p.popular ? "text-white/70" : "text-slate-400"}`}>/mes</span></p>
              <p className={`text-xs mt-1 inline-flex items-center gap-1 ${p.popular ? "text-white/80" : "text-slate-500"}`}><CheckCircle2 size={12} /> {p.features[0]}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
