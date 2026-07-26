import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import CoverageChecker from "@/components/CoverageChecker";
import {
  Signal, Wifi, Satellite, Tv, CheckCircle2, ArrowRight, Tv2, ShieldCheck,
  Zap, Repeat, Smartphone, Star,
} from "lucide-react";
import { motion } from "framer-motion";

const LOGO = "https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png";
const HERO_MOBILE = "https://images.unsplash.com/photo-1622556498246-755f44ca76f3?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxOTF8MHwxfHNlYXJjaHw0fHxwZXJzb24lMjB1c2luZyUyMG1vYmlsZSUyMHBob25lJTIwbW9kZXJuJTIwbGlmZXN0eWxlfGVufDB8fHx8MTc4NTEwNjMxMXww&ixlib=rb-4.1.0&q=85";
const HERO_FIBER = "https://images.unsplash.com/photo-1758598738327-82de3cb31c56?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHw0fHxmYW1pbHklMjB3YXRjaGluZyUyMHR2JTIwbGl2aW5nJTIwcm9vbXxlbnwwfHx8fDE3ODUxMDYzMTF8MA&ixlib=rb-4.1.0&q=85";

const TABS = [
  { key: "Mobile", label: "Móvil", icon: Signal },
  { key: "Fiber", label: "Fibra", icon: Wifi },
  { key: "Satellite", label: "Satélite", icon: Satellite },
  { key: "TV", label: "TV", icon: Tv },
];

const CITIES = ["Madrid", "Barcelona", "Valencia", "Alicante", "Granada", "Málaga",
  "Fuengirola", "Benidorm", "Marbella", "Cádiz", "Cáceres", "Segovia", "Tarancón", "Cuenca"];

const TRUST = [
  { icon: Repeat, title: "Portabilidad gratis", desc: "Conserva tu número sin coste ni cortes." },
  { icon: ShieldCheck, title: "Sin permanencia", desc: "Tú mandas. Cambia o cancela cuando quieras." },
  { icon: Zap, title: "Alta 100% online", desc: "Firma digital y activación en minutos." },
  { icon: Smartphone, title: "App GoRoky", desc: "Controla tu consumo y facturas desde el móvil." },
];

export default function PublicCatalog() {
  const [catalog, setCatalog] = useState({});
  const [tab, setTab] = useState("Mobile");
  const navigate = useNavigate();

  useEffect(() => { api.get("/public/catalog").then((r) => setCatalog(r.data)); }, []);

  const plans = catalog[tab] || [];
  const heroImg = tab === "Mobile" ? HERO_MOBILE : HERO_FIBER;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" data-testid="public-catalog">
      {/* Header glass */}
      <header className="sticky top-0 z-40 bg-white/70 backdrop-blur-xl border-b border-slate-200/70">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <img src={LOGO} alt="GoRoky · roky móvil" className="h-8 w-auto" />
          <nav className="flex items-center gap-5 text-sm font-semibold">
            <a href="#planes" className="hidden sm:inline text-slate-600 hover:text-primary transition-colors">Tarifas</a>
            <a href="#cobertura" className="hidden sm:inline text-slate-600 hover:text-primary transition-colors">Cobertura</a>
            <button onClick={() => navigate("/login")} data-testid="header-login-btn"
              className="rounded-full px-4 py-2 bg-primary text-white hover:opacity-90 transition-opacity">Mi cuenta</button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 pt-12 pb-8 grid lg:grid-cols-2 gap-8 items-center">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
            <span className="inline-flex items-center gap-1.5 text-xs tracking-widest font-bold uppercase text-[#FF7A00] bg-[#FF7A00]/10 rounded-full px-3 py-1 mb-4">
              <Star size={13} /> Promo portabilidad
            </span>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
              Móvil y fibra <span className="text-primary">sin permanencia</span> con GoRoky
            </h1>
            <p className="text-slate-600 mt-4 text-base sm:text-lg max-w-lg">
              Cámbiate a <b>roky móvil</b> y conserva tu número gratis. Tarifas claras, cobertura nacional y alta online en minutos.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <a href="#planes" className="rounded-full px-6 py-3 bg-[#FF7A00] text-white font-bold inline-flex items-center gap-2 active:scale-[0.98] transition-transform" data-testid="hero-cta-planes">
                Ver tarifas <ArrowRight size={17} />
              </a>
              <a href="#cobertura" className="rounded-full px-6 py-3 bg-white border border-slate-200 text-slate-800 font-bold inline-flex items-center gap-2 hover:border-primary transition-colors">
                Comprobar fibra
              </a>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="relative">
            <div className="rounded-3xl overflow-hidden shadow-2xl aspect-[4/3]">
              <img src={heroImg} alt={`Tarifas ${tab === "Mobile" ? "móvil" : "fibra y TV"} GoRoky`} className="w-full h-full object-cover" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Planes */}
      <section id="planes" className="max-w-6xl mx-auto px-5 py-12">
        <div className="text-center mb-8">
          <p className="text-xs tracking-widest font-bold uppercase text-primary mb-2">Tarifas GoRoky</p>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">Elige tu tarifa y contrata en minutos</h2>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto justify-center gap-2 bg-transparent p-0 mb-8">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} data-testid={`public-tab-${t.key}`}
                className="gap-1.5 rounded-full px-5 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-white border border-slate-200 bg-white">
                <t.icon size={15} /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map((t) => (
            <TabsContent key={t.key} value={t.key}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {(catalog[t.key] || []).map((p, i) => {
                  const popular = i === 1 && (catalog[t.key] || []).length >= 3;
                  return (
                    <motion.div key={p.productId} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      data-testid={`public-product-${p.productId}`}
                      className={`relative rounded-3xl bg-white p-6 flex flex-col transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${popular ? "border-2 border-primary shadow-lg" : "border border-slate-200"}`}>
                      {popular && (
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] tracking-widest font-bold uppercase bg-primary text-white rounded-full px-3 py-1">Más popular</span>
                      )}
                      <span className="grid place-items-center h-12 w-12 rounded-2xl bg-primary/10 text-primary mb-4"><t.icon size={24} /></span>
                      <h3 className="font-heading font-bold text-xl">{p.productName}</h3>
                      <div className="mt-2 mb-5 flex items-end gap-1">
                        <span className="font-heading text-5xl font-black tracking-tight">{p.price.toFixed(2).replace(".", ",")}</span>
                        <span className="text-lg text-slate-400 mb-1">€/mes</span>
                      </div>
                      <ul className="space-y-2 mb-6 flex-1">
                        {(p.marketingText || []).map((m, j) => (
                          <li key={j} className="flex items-start gap-2 text-sm text-slate-600">
                            <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                            <span>{m.title}: <b className="text-slate-900 font-semibold">{m.value}</b></span>
                          </li>
                        ))}
                      </ul>
                      {p.channels?.length > 0 && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <button className="w-full rounded-full py-2.5 mb-2 border border-slate-200 font-semibold text-sm inline-flex items-center justify-center gap-1.5 hover:border-primary transition-colors" data-testid={`channels-${p.productId}`}>
                              <Tv2 size={15} /> Ver {p.channels.length} canales
                            </button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader><DialogTitle>Canales · {p.productName}</DialogTitle></DialogHeader>
                            <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                              {p.channels.map((ch, k) => <span key={k} className="flex items-center gap-1.5 text-sm py-1"><Tv size={13} className="text-primary shrink-0" /> {ch}</span>)}
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                      <button className="w-full rounded-full py-3 bg-[#FF7A00] text-white font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                        data-testid={`contract-${p.productId}`} onClick={() => navigate(`/contratar/${p.productId}`)}>
                        Contratar <ArrowRight size={16} />
                      </button>
                    </motion.div>
                  );
                })}
                {(catalog[t.key] || []).length === 0 && <p className="text-slate-500 col-span-full text-center py-10">No hay tarifas disponibles en esta categoría.</p>}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </section>

      {/* Cobertura fibra */}
      <section id="cobertura" className="bg-primary text-white">
        <div className="max-w-6xl mx-auto px-5 py-14 grid lg:grid-cols-2 gap-8 items-center">
          <div>
            <p className="text-xs tracking-widest font-bold uppercase text-white/70 mb-2">Fibra óptica</p>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">¿Llega la fibra a tu casa?</h2>
            <p className="text-white/80 mt-3 max-w-md">Comprueba la cobertura real de fibra en tu dirección antes de contratar. Disponible en las principales ciudades de España.</p>
          </div>
          <div className="bg-white/10 rounded-3xl p-5 backdrop-blur-sm">
            <CoverageChecker dark />
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="max-w-6xl mx-auto px-5 py-14">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {TRUST.map((f) => (
            <div key={f.title} className="rounded-2xl bg-white border border-slate-200 p-6">
              <span className="grid place-items-center h-11 w-11 rounded-xl bg-[#FF7A00]/10 text-[#FF7A00] mb-3"><f.icon size={22} /></span>
              <h3 className="font-heading font-bold">{f.title}</h3>
              <p className="text-sm text-slate-500 mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Marquee ciudades (SEO) */}
      <section className="border-y border-slate-200 bg-white overflow-hidden py-4" aria-label="Cobertura por ciudades">
        <motion.div className="flex gap-8 whitespace-nowrap"
          animate={{ x: ["0%", "-50%"] }} transition={{ duration: 28, repeat: Infinity, ease: "linear" }}>
          {[...CITIES, ...CITIES].map((c, i) => (
            <span key={i} className="text-sm font-semibold text-slate-400 inline-flex items-center gap-2">
              <Wifi size={14} className="text-primary" /> Fibra y móvil en {c}
            </span>
          ))}
        </motion.div>
      </section>

      {/* Footer SEO */}
      <footer className="bg-slate-900 text-slate-300">
        <div className="max-w-6xl mx-auto px-5 py-12">
          <div className="flex flex-col sm:flex-row justify-between gap-8">
            <div className="max-w-md">
              <img src={LOGO} alt="GoRoky" className="h-8 w-auto bg-white rounded-lg p-1 mb-4" />
              <p className="text-sm text-slate-400">
                GoRoky (soyroky · roky móvil) es tu operador de móvil y fibra sin permanencia.
                Portabilidad gratis y alta 100% online con cobertura en Madrid, Barcelona, Valencia,
                Alicante, Granada, Málaga, Fuengirola, Benidorm, Marbella, Cádiz, Cáceres, Segovia,
                Tarancón y Cuenca.
              </p>
            </div>
            <div className="text-sm">
              <p className="font-bold text-white mb-3">Cobertura por ciudades</p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-slate-400">
                {CITIES.map((c) => <span key={c}>Fibra en {c}</span>)}
              </div>
            </div>
          </div>
          <div className="border-t border-slate-800 mt-8 pt-6 text-xs text-slate-500 flex flex-col sm:flex-row justify-between gap-2">
            <span>© {new Date().getFullYear()} GoRoky · TRAMILEX GLOBAL SERVICE SL · B21796925</span>
            <button onClick={() => navigate("/login")} className="hover:text-white transition-colors text-left">Acceso clientes</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
