import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import CoverageChecker from "@/components/CoverageChecker";
import {
  Signal, Wifi, Satellite, Tv, CheckCircle2, ArrowRight, Tv2,
  Zap, Repeat, Smartphone, Star, Menu, Headphones, ShieldCheck, Sparkles, Info,
} from "lucide-react";
import { motion } from "framer-motion";

const LOGO = "https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png";
const HERO_IMG = "https://images.unsplash.com/photo-1694057336527-fbc3e7c84890?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzZ8MHwxfHNlYXJjaHwyfHxlbmVyZ2V0aWMlMjBzbWlsaW5nJTIwcGVyc29uJTIwcGhvbmUlMjBzb2xpZCUyMGJhY2tncm91bmR8ZW58MHx8fHwxNzg1MTA4ODgxfDA&ixlib=rb-4.1.0&q=85";

const TABS = [
  { key: "Mobile", label: "Móvil", icon: Signal },
  { key: "Fiber", label: "Fibra", icon: Wifi },
  { key: "Satellite", label: "Satélite", icon: Satellite },
  { key: "TV", label: "TV", icon: Tv },
];

const ICONS = { Repeat, Zap, Smartphone, Headphones, ShieldCheck, Sparkles, Wifi, Signal };

export default function PublicCatalog() {
  const [catalog, setCatalog] = useState({});
  const [content, setContent] = useState(null);
  const [tab, setTab] = useState("Mobile");
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/public/catalog").then((r) => setCatalog(r.data)).catch(() => {});
    api.get("/public/site-content").then((r) => setContent(r.data)).catch(() => {});
  }, []);

  if (!content) {
    return <div className="min-h-screen grid place-items-center bg-white"><div className="h-10 w-10 rounded-full border-2 border-[#0033ff] border-t-transparent animate-spin" /></div>;
  }

  const { hero, plans, coverage, trust, cities, footer } = content;

  return (
    <div className="min-h-screen bg-white text-[#050505] font-body selection:bg-[#FF7A00] selection:text-white" data-testid="public-catalog">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-2xl bg-white/80 border-b border-black/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <a href="#top" className="flex items-center" data-testid="header-logo"><img src={LOGO} alt="GoRoky · roky móvil" className="h-9 w-auto" /></a>
          <nav className="hidden md:flex items-center gap-8 text-sm font-bold">
            <a href="#planes" className="text-slate-700 hover:text-[#0033ff] transition-colors">Tarifas</a>
            <a href="#cobertura" className="text-slate-700 hover:text-[#0033ff] transition-colors">Cobertura fibra</a>
            <button onClick={() => navigate("/login")} data-testid="header-login-btn"
              className="rounded-full border-2 border-[#0033ff] text-[#0033ff] hover:bg-[#0033ff] hover:text-white font-bold px-6 py-2.5 transition-all focus-visible:ring-2 focus-visible:ring-[#FF7A00] focus-visible:ring-offset-2">Mi cuenta</button>
          </nav>
          {/* Mobile menu */}
          <div className="md:hidden">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button data-testid="mobile-menu-btn" aria-label="Menú" className="grid place-items-center h-11 w-11 rounded-full bg-slate-100 active:scale-95 transition-transform"><Menu size={22} /></button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 flex flex-col gap-6 pt-10">
                <img src={LOGO} alt="GoRoky" className="h-9 w-auto" />
                <a href="#planes" onClick={() => setMenuOpen(false)} className="text-lg font-bold text-slate-800">Tarifas</a>
                <a href="#cobertura" onClick={() => setMenuOpen(false)} className="text-lg font-bold text-slate-800">Cobertura fibra</a>
                <button onClick={() => { setMenuOpen(false); navigate("/login"); }} data-testid="mobile-login-btn"
                  className="rounded-full bg-[#0033ff] text-white font-bold px-6 py-3 mt-2">Mi cuenta</button>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="relative overflow-hidden bg-white">
        <div className="pointer-events-none absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full bg-[#0033ff]/5 blur-3xl" />
        <div className="pointer-events-none absolute top-40 -left-40 h-[420px] w-[420px] rounded-full bg-[#FF7A00]/10 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center pt-32 lg:pt-36 pb-16 lg:pb-24">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="lg:col-span-6">
            <span className="inline-flex items-center gap-2 text-xs tracking-[0.2em] font-bold uppercase text-[#FF7A00] bg-[#FF7A00]/10 rounded-full px-4 py-2 mb-6">
              <Star size={14} className="fill-[#FF7A00]" /> {hero.badge}
            </span>
            <h1 className="font-heading text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter leading-[0.95]">
              {hero.title} <span className="text-[#0033ff]">{hero.titleHighlight}</span>
            </h1>
            <p className="text-slate-600 mt-6 text-lg sm:text-xl leading-relaxed max-w-xl">{hero.subtitle}</p>
            <div className="flex flex-col sm:flex-row gap-4 mt-9">
              <a href="#planes" data-testid="hero-cta-planes"
                className="rounded-full bg-[#0033ff] hover:bg-[#0022cc] text-white font-bold px-8 py-4 inline-flex items-center justify-center gap-2 transition-all hover:-translate-y-1 shadow-[0_8px_24px_rgba(0,51,255,0.3)]">
                {hero.ctaPrimary} <ArrowRight size={18} />
              </a>
              <a href="#cobertura" data-testid="hero-cta-cobertura"
                className="rounded-full bg-[#FF7A00] hover:bg-[#e66e00] text-white font-bold px-8 py-4 inline-flex items-center justify-center gap-2 transition-all hover:-translate-y-1 shadow-[0_8px_24px_rgba(255,122,0,0.3)]">
                {hero.ctaSecondary}
              </a>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.15 }} className="lg:col-span-6 relative">
            <div className="rounded-[2.5rem] overflow-hidden shadow-2xl aspect-[4/5] sm:aspect-[5/4] lg:aspect-[4/5]">
              <img src={HERO_IMG} alt="Cliente feliz con GoRoky" className="w-full h-full object-cover" />
            </div>
            <div className="absolute -bottom-5 -left-2 sm:left-6 bg-white rounded-2xl shadow-xl px-5 py-4 flex items-center gap-3 border border-slate-100">
              <span className="grid place-items-center h-11 w-11 rounded-xl bg-[#0033ff]/10 text-[#0033ff]"><Repeat size={20} /></span>
              <div><p className="font-heading font-bold leading-tight">Portabilidad gratis</p><p className="text-sm text-slate-500">Conserva tu número</p></div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Planes */}
      <section id="planes" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
        <div className="max-w-2xl mb-12">
          <p className="text-xs tracking-[0.2em] font-bold uppercase text-[#FF7A00] mb-3">{plans.eyebrow}</p>
          <h2 className="font-heading text-4xl sm:text-5xl font-extrabold tracking-tight">{plans.title}</h2>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="inline-flex flex-wrap h-auto gap-1 bg-slate-100 p-1 rounded-full mb-12">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} data-testid={`public-tab-${t.key}`}
                className="gap-1.5 rounded-full px-6 py-2.5 text-sm font-bold transition-all data-[state=active]:bg-white data-[state=active]:text-[#0033ff] data-[state=active]:shadow-sm text-slate-500">
                <t.icon size={15} /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map((t) => (
            <TabsContent key={t.key} value={t.key}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
                {(catalog[t.key] || []).map((p, i) => {
                  const list = catalog[t.key] || [];
                  const anyPopular = list.some((x) => x.popular);
                  const popular = anyPopular ? !!p.popular : (i === 1 && list.length >= 3);
                  return (
                    <motion.div key={p.productId} initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                      data-testid={`public-product-${p.productId}`}
                      className={popular
                        ? "relative bg-[#0033ff] text-white rounded-3xl shadow-2xl p-8 flex flex-col lg:scale-105 z-10"
                        : "relative bg-white rounded-3xl border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] transition-all duration-300 p-8 flex flex-col"}>
                      {popular && (
                        <span className="absolute top-0 right-0 bg-[#FF7A00] text-white text-xs font-bold uppercase tracking-wider py-1.5 px-4 rounded-bl-xl rounded-tr-3xl">Más popular</span>
                      )}
                      <span className={`grid place-items-center h-12 w-12 rounded-2xl mb-5 ${popular ? "bg-white/15 text-white" : "bg-[#0033ff]/10 text-[#0033ff]"}`}><t.icon size={24} /></span>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className={`font-heading font-bold text-2xl ${popular ? "text-white" : ""}`}>{p.productName}</h3>
                        {(p.marketingText || []).length > 0 && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <button aria-label="Ver detalle del servicio" data-testid={`detail-${p.productId}`}
                                className={`shrink-0 grid place-items-center h-8 w-8 rounded-full border transition-colors ${popular ? "border-white/30 text-white hover:bg-white/10" : "border-slate-200 text-slate-400 hover:text-[#0033ff] hover:border-[#0033ff]"}`}>
                                <Info size={16} />
                              </button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md">
                              <DialogHeader><DialogTitle>Detalle · {p.productName}</DialogTitle></DialogHeader>
                              <ul className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                                {(p.marketingText || []).map((m, j) => (
                                  <li key={j} className="flex items-start gap-2.5 text-sm text-slate-600">
                                    <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                                    <span>{m.title ? <b className="text-slate-900 font-semibold">{m.title}: </b> : null}{m.value}</span>
                                  </li>
                                ))}
                              </ul>
                              <button className="mt-2 w-full rounded-full py-3 bg-[#0033ff] hover:bg-[#0022cc] text-white font-bold inline-flex items-center justify-center gap-2 transition-colors"
                                onClick={() => navigate(`/contratar/${p.productId}`)} data-testid={`detail-contract-${p.productId}`}>
                                Contratar <ArrowRight size={16} />
                              </button>
                            </DialogContent>
                          </Dialog>
                        )}
                      </div>
                      <div className="mt-3 mb-6 flex items-end gap-1">
                        <span className="font-heading text-6xl font-black tracking-tighter leading-none">{p.price.toFixed(2).replace(".", ",")}</span>
                        <span className={`text-lg mb-1.5 ${popular ? "text-white/70" : "text-slate-400"}`}>€/mes</span>
                      </div>
                      <ul className="space-y-3 mb-7 flex-1">
                        {(p.marketingText || []).slice(0, 3).map((m, j) => (
                          <li key={j} className={`flex items-start gap-2.5 text-sm ${popular ? "text-white/90" : "text-slate-600"}`}>
                            <CheckCircle2 size={18} className={`shrink-0 mt-0.5 ${popular ? "text-white" : "text-emerald-500"}`} />
                            <span className="line-clamp-2">{m.title ? <b className={popular ? "text-white font-semibold" : "text-slate-900 font-semibold"}>{m.title}: </b> : null}{m.value}</span>
                          </li>
                        ))}
                        {(p.marketingText || []).length > 3 && (
                          <li>
                            <Dialog>
                              <DialogTrigger asChild>
                                <button data-testid={`more-${p.productId}`}
                                  className={`inline-flex items-center gap-1.5 text-sm font-semibold transition-colors ${popular ? "text-white/90 hover:text-white" : "text-[#0033ff] hover:text-[#0022cc]"}`}>
                                  <Info size={15} /> Ver todo el detalle
                                </button>
                              </DialogTrigger>
                              <DialogContent className="max-w-md">
                                <DialogHeader><DialogTitle>Detalle · {p.productName}</DialogTitle></DialogHeader>
                                <ul className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                                  {(p.marketingText || []).map((m, j) => (
                                    <li key={j} className="flex items-start gap-2.5 text-sm text-slate-600">
                                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                                      <span>{m.title ? <b className="text-slate-900 font-semibold">{m.title}: </b> : null}{m.value}</span>
                                    </li>
                                  ))}
                                </ul>
                              </DialogContent>
                            </Dialog>
                          </li>
                        )}
                      </ul>
                      {p.channels?.length > 0 && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <button className={`w-full rounded-full py-2.5 mb-3 border font-semibold text-sm inline-flex items-center justify-center gap-1.5 transition-colors ${popular ? "border-white/30 text-white hover:bg-white/10" : "border-slate-200 hover:border-[#0033ff]"}`} data-testid={`channels-${p.productId}`}>
                              <Tv2 size={15} /> Ver {p.channels.length} canales
                            </button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader><DialogTitle>Canales · {p.productName}</DialogTitle></DialogHeader>
                            <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                              {p.channels.map((ch, k) => <span key={k} className="flex items-center gap-1.5 text-sm py-1"><Tv size={13} className="text-[#0033ff] shrink-0" /> {ch}</span>)}
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                      <button
                        className={`w-full rounded-full py-3.5 font-bold inline-flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 ${popular ? "bg-[#FF7A00] hover:bg-[#e66e00] text-white shadow-[0_8px_24px_rgba(255,122,0,0.4)]" : "bg-[#0033ff] hover:bg-[#0022cc] text-white shadow-[0_8px_24px_rgba(0,51,255,0.25)]"}`}
                        data-testid={`contract-${p.productId}`} onClick={() => navigate(`/contratar/${p.productId}`)}>
                        Contratar <ArrowRight size={16} />
                      </button>
                    </motion.div>
                  );
                })}
                {(catalog[t.key] || []).length === 0 && <p className="text-slate-500 col-span-full text-center py-16">No hay tarifas disponibles en esta categoría.</p>}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </section>

      {/* Cobertura fibra */}
      <section id="cobertura" className="bg-[#0033ff] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs tracking-[0.2em] font-bold uppercase text-white/60 mb-3">{coverage.eyebrow}</p>
            <h2 className="font-heading text-4xl sm:text-5xl font-extrabold tracking-tight">{coverage.title}</h2>
            <p className="text-white/80 mt-5 text-lg max-w-md leading-relaxed">{coverage.description}</p>
          </div>
          <div className="bg-white/10 rounded-3xl p-6 backdrop-blur-sm border border-white/10">
            <CoverageChecker dark />
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {(trust || []).map((f, i) => {
            const Icon = ICONS[f.icon] || Sparkles;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                className="rounded-3xl bg-slate-50 border border-slate-100 p-8">
                <span className="grid place-items-center h-14 w-14 rounded-2xl bg-[#FF7A00]/10 text-[#FF7A00] mb-5"><Icon size={26} /></span>
                <h3 className="font-heading font-bold text-xl">{f.title}</h3>
                <p className="text-slate-500 mt-2 leading-relaxed">{f.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Marquee ciudades (SEO) */}
      <section className="border-y border-slate-100 bg-white overflow-hidden py-8" aria-label="Cobertura por ciudades">
        <motion.div className="flex gap-14 whitespace-nowrap"
          animate={{ x: ["0%", "-50%"] }} transition={{ duration: 34, repeat: Infinity, ease: "linear" }}>
          {[...(cities || []), ...(cities || [])].map((c, i) => (
            <span key={i} className="font-heading text-4xl sm:text-5xl font-black tracking-tighter text-transparent inline-flex items-center gap-4"
              style={{ WebkitTextStroke: "1.5px rgba(0,51,255,0.18)" }}>
              Fibra y móvil en {c} <span className="text-[#FF7A00]" style={{ WebkitTextStroke: "0" }}>•</span>
            </span>
          ))}
        </motion.div>
      </section>

      {/* Footer SEO */}
      <footer className="bg-[#0A0A0A] text-slate-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="flex flex-col lg:flex-row justify-between gap-12">
            <div className="max-w-md">
              <img src={LOGO} alt="GoRoky" className="h-9 w-auto bg-white rounded-xl p-1.5 mb-5" />
              <p className="text-slate-400 leading-relaxed">{footer.description}</p>
            </div>
            <div>
              <p className="font-heading font-bold text-white mb-4">Cobertura por ciudades</p>
              <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-slate-400 text-sm">
                {(cities || []).map((c) => <span key={c}>Fibra en {c}</span>)}
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 mt-12 pt-8 text-sm text-slate-500 flex flex-col sm:flex-row justify-between gap-3">
            <span>© {new Date().getFullYear()} {footer.company}</span>
            <button onClick={() => navigate("/login")} className="hover:text-white transition-colors text-left" data-testid="footer-login-btn">Acceso clientes</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
