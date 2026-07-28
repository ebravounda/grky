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
import { motion, AnimatePresence } from "framer-motion";

const LOGO = "https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png";

const HERO_SLIDES = [
  { url: "https://images.unsplash.com/photo-1758272420990-30a0735e68a1?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200", alt: "Chica feliz con su móvil" },
  { url: "https://images.unsplash.com/photo-1758525226705-3061215c7445?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200", alt: "Amigas viendo el móvil juntas" },
  { url: "https://images.unsplash.com/photo-1758598738092-a7cd486baadd?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200", alt: "Familia conectada en casa con fibra" },
  { url: "https://images.unsplash.com/photo-1682980094726-f3f9be0abbde?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200", alt: "Calle de Madrid, España" },
  { url: "https://images.unsplash.com/photo-1758272420171-6e7de7b36789?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200", alt: "Joven usando su smartphone en la ciudad" },
];

const BLUE = "#015EEF";
const ORANGE = "#FF7A00";

const TAB_META = {
  Mobile: { label: "Móvil", icon: Signal },
  Fiber: { label: "Fibra", icon: Wifi },
  Fixed: { label: "Fibra", icon: Wifi },
  Convergent: { label: "Paquetes", icon: Sparkles },
  M2M: { label: "M2M", icon: Signal },
  PBX: { label: "PBX", icon: Signal },
  TV: { label: "TV", icon: Tv },
  Satellite: { label: "Satélite", icon: Satellite },
  Energy: { label: "Energía", icon: Zap },
  Device: { label: "Dispositivos", icon: Smartphone },
  International: { label: "Internacional", icon: Signal },
  Bonos: { label: "Bonos", icon: Sparkles },
  Paquetes: { label: "Paquetes", icon: Sparkles },
  Other: { label: "Otros", icon: Sparkles },
};

const ICONS = { Repeat, Zap, Smartphone, Headphones, ShieldCheck, Sparkles, Wifi, Signal };

export default function PublicCatalog() {
  const [catalog, setCatalog] = useState({});
  const [content, setContent] = useState(null);
  const [tab, setTab] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % HERO_SLIDES.length), 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    api.get("/public/catalog").then((r) => {
      setCatalog(r.data);
      const keys = Object.keys(r.data || {}).filter((k) => (r.data[k] || []).length);
      if (keys.length) setTab((t) => t || keys[0]);
    }).catch(() => {});
    api.get("/public/site-content").then((r) => setContent(r.data)).catch(() => {});
  }, []);

  if (!content) {
    return <div className="min-h-screen grid place-items-center bg-white"><div className="h-10 w-10 rounded-full border-2 border-[#015EEF] border-t-transparent animate-spin" /></div>;
  }

  const TABS = Object.keys(catalog).filter((k) => (catalog[k] || []).length)
    .map((k) => ({ key: k, label: (TAB_META[k] || {}).label || k, icon: (TAB_META[k] || {}).icon || Signal }));

  const { hero, plans, coverage, trust, cities, footer } = content;

  return (
    <div className="min-h-screen bg-white text-[#0A0A0A] font-body selection:bg-[#FF7A00] selection:text-white" data-testid="public-catalog">
      {/* Header — crystal glass */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-white/70 border-b border-black/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <a href="#top" className="flex items-center" data-testid="header-logo"><img src={LOGO} alt="GoRoky · roky móvil" className="h-9 w-auto" /></a>
          <nav className="hidden md:flex items-center gap-8 text-sm font-bold">
            <a href="#planes" className="text-slate-800 hover:text-[#015EEF] transition-colors tracking-wide">Tarifas</a>
            <a href="#cobertura" className="text-slate-800 hover:text-[#015EEF] transition-colors tracking-wide">Cobertura fibra</a>
            <button onClick={() => navigate("/login")} data-testid="header-login-btn"
              className="rounded-full border-2 border-[#015EEF] text-[#015EEF] hover:bg-[#015EEF] hover:text-white font-bold px-6 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] focus-visible:ring-offset-2">Mi cuenta</button>
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
                  className="rounded-full bg-[#015EEF] text-white font-bold px-6 py-3 mt-2">Mi cuenta</button>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Hero — light, con carrusel dinámico de imágenes */}
      <section id="top" className="relative overflow-hidden bg-white">
        <div className="pointer-events-none absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full bg-[#015EEF]/5 blur-3xl" />
        <div className="pointer-events-none absolute top-40 -left-40 h-[420px] w-[420px] rounded-full bg-[#FF7A00]/10 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center pt-32 lg:pt-36 pb-16 lg:pb-24">
          <motion.div initial="hidden" animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}
            className="lg:col-span-6">
            <motion.span variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
              className="inline-flex items-center gap-2 text-xs tracking-[0.2em] font-bold uppercase text-[#FF7A00] bg-[#FF7A00]/10 rounded-full px-4 py-2 mb-6">
              <Star size={14} className="fill-[#FF7A00]" /> {hero.badge}
            </motion.span>
            <motion.h1 variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
              className="font-heading text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter leading-[0.95]">
              {hero.title} <span className="text-[#015EEF]">{hero.titleHighlight}</span>
            </motion.h1>
            <motion.p variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
              className="text-slate-600 mt-6 text-lg sm:text-xl leading-relaxed max-w-xl">{hero.subtitle}</motion.p>
            <motion.div variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
              className="flex flex-col sm:flex-row gap-4 mt-9">
              <a href="#planes" data-testid="hero-cta-planes"
                className="rounded-full bg-[#015EEF] hover:bg-[#004cc7] text-white font-bold px-8 py-4 inline-flex items-center justify-center gap-2 transition-[transform,box-shadow,background-color] hover:-translate-y-1 shadow-[0_10px_30px_rgba(1,94,239,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] focus-visible:ring-offset-2">
                {hero.ctaPrimary} <ArrowRight size={18} />
              </a>
              <a href="#cobertura" data-testid="hero-cta-cobertura"
                className="rounded-full bg-[#FF7A00] hover:bg-[#e66e00] text-white font-bold px-8 py-4 inline-flex items-center justify-center gap-2 transition-[transform,box-shadow,background-color] hover:-translate-y-1 shadow-[0_10px_30px_rgba(255,122,0,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#015EEF] focus-visible:ring-offset-2">
                {hero.ctaSecondary}
              </a>
            </motion.div>
            <motion.div variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
              className="flex flex-wrap items-center gap-x-8 gap-y-3 mt-10 text-sm text-slate-500">
              <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-[#FF7A00]" /> Alta 100% online</span>
              <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-[#FF7A00]" /> Cobertura nacional</span>
              <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-[#FF7A00]" /> Red 4G/5G</span>
            </motion.div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.15 }} className="lg:col-span-6 relative">
            {/* Carrusel de imágenes */}
            <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl aspect-[4/5] sm:aspect-[5/4] lg:aspect-[4/5] bg-slate-100">
              <AnimatePresence>
                <motion.img key={slide} src={HERO_SLIDES[slide].url} alt={HERO_SLIDES[slide].alt}
                  initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.9, ease: "easeInOut" }}
                  className="absolute inset-0 w-full h-full object-cover" data-testid="hero-carousel-img" />
              </AnimatePresence>
              <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent pointer-events-none" />
              {/* Puntitos */}
              <div className="absolute bottom-5 right-5 flex gap-1.5">
                {HERO_SLIDES.map((_, i) => (
                  <button key={i} aria-label={`Imagen ${i + 1}`} onClick={() => setSlide(i)} data-testid={`hero-dot-${i}`}
                    className={`h-2 rounded-full transition-all ${i === slide ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"}`} />
                ))}
              </div>
            </div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="absolute -bottom-5 -left-2 sm:left-6 bg-white text-[#0A0A0A] rounded-2xl shadow-xl px-5 py-4 flex items-center gap-3 border border-slate-100">
              <span className="grid place-items-center h-11 w-11 rounded-xl bg-[#015EEF]/10 text-[#015EEF]"><Repeat size={20} /></span>
              <div><p className="font-heading font-bold leading-tight">Portabilidad gratis</p><p className="text-sm text-slate-500">Conserva tu número</p></div>
            </motion.div>
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
          <TabsList className="inline-flex flex-wrap h-auto gap-1 bg-slate-200/60 p-1.5 rounded-full mb-12">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} data-testid={`public-tab-${t.key}`}
                className="gap-1.5 rounded-full px-6 py-2.5 text-sm font-bold transition-colors data-[state=active]:bg-white data-[state=active]:text-[#015EEF] data-[state=active]:shadow-sm text-slate-500 hover:text-slate-900">
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
                    <motion.div key={p.productId} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i % 3) * 0.08, duration: 0.5 }}
                      data-testid={`public-product-${p.productId}`}
                      className={popular
                        ? "relative bg-[#015EEF] text-white rounded-[2rem] shadow-[0_24px_50px_rgba(1,94,239,0.35)] p-8 flex flex-col lg:scale-105 z-10 overflow-hidden"
                        : "relative bg-white rounded-[2rem] border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_24px_45px_rgb(0,0,0,0.1)] hover:-translate-y-2 transition-[transform,box-shadow] duration-300 p-8 flex flex-col"}>
                      {popular && (
                        <>
                          <div className="pointer-events-none absolute -top-16 -right-16 h-52 w-52 rounded-full bg-white/10 blur-2xl" />
                          <span className="absolute top-0 right-0 bg-[#FF7A00] text-white text-xs font-bold uppercase tracking-wider py-1.5 px-4 rounded-bl-2xl rounded-tr-[2rem]">Más popular</span>
                        </>
                      )}
                      <span className={`grid place-items-center h-12 w-12 rounded-2xl mb-5 ${popular ? "bg-white/15 text-white" : "bg-[#015EEF]/10 text-[#015EEF]"}`}><t.icon size={24} /></span>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className={`font-heading font-bold text-2xl leading-tight ${popular ? "text-white" : ""}`}>{p.productName}</h3>
                        {(p.marketingText || []).length > 0 && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <button aria-label="Ver detalle del servicio" data-testid={`detail-${p.productId}`}
                                className={`shrink-0 grid place-items-center h-8 w-8 rounded-full border transition-colors ${popular ? "border-white/30 text-white hover:bg-white/10" : "border-slate-200 text-slate-400 hover:text-[#015EEF] hover:border-[#015EEF]"}`}>
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
                              <button className="mt-2 w-full rounded-full py-3 bg-[#015EEF] hover:bg-[#004cc7] text-white font-bold inline-flex items-center justify-center gap-2 transition-colors"
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
                                  className={`inline-flex items-center gap-1.5 text-sm font-semibold transition-colors ${popular ? "text-white/90 hover:text-white" : "text-[#015EEF] hover:text-[#004cc7]"}`}>
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
                            <button className={`w-full rounded-full py-2.5 mb-3 border font-semibold text-sm inline-flex items-center justify-center gap-1.5 transition-colors ${popular ? "border-white/30 text-white hover:bg-white/10" : "border-slate-200 hover:border-[#015EEF]"}`} data-testid={`channels-${p.productId}`}>
                              <Tv2 size={15} /> Ver {p.channels.length} canales
                            </button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader><DialogTitle>Canales · {p.productName}</DialogTitle></DialogHeader>
                            <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                              {p.channels.map((ch, k) => <span key={k} className="flex items-center gap-1.5 text-sm py-1"><Tv size={13} className="text-[#015EEF] shrink-0" /> {ch}</span>)}
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                      <button
                        className={`w-full rounded-full py-3.5 font-bold inline-flex items-center justify-center gap-2 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 ${popular ? "bg-[#FF7A00] hover:bg-[#e66e00] text-white shadow-[0_10px_28px_rgba(255,122,0,0.45)]" : "bg-[#015EEF] hover:bg-[#004cc7] text-white shadow-[0_10px_28px_rgba(1,94,239,0.3)]"}`}
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

      {/* Cobertura fibra — azul */}
      <section id="cobertura" className="relative overflow-hidden bg-[#015EEF] text-white">
        <div className="pointer-events-none absolute -top-24 -left-24 h-[420px] w-[420px] rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-[420px] w-[420px] rounded-full bg-[#FF7A00]/25 blur-[120px]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 grid lg:grid-cols-2 gap-12 items-center">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <p className="text-xs tracking-[0.2em] font-bold uppercase text-[#FFD8B0] mb-3">{coverage.eyebrow}</p>
            <h2 className="font-heading text-4xl sm:text-5xl font-extrabold tracking-tight">{coverage.title}</h2>
            <p className="text-white/85 mt-5 text-lg max-w-md leading-relaxed">{coverage.description}</p>
            <div className="flex flex-wrap gap-x-8 gap-y-3 mt-8 text-sm text-white/85">
              <span className="inline-flex items-center gap-2"><Wifi size={16} className="text-[#FFB877]" /> FTTH hasta 1&nbsp;Gb</span>
              <span className="inline-flex items-center gap-2"><ShieldCheck size={16} className="text-[#FFB877]" /> Instalación profesional</span>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.96 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }}
            className="bg-white rounded-[2rem] p-6 sm:p-7 shadow-2xl">
            <CoverageChecker />
          </motion.div>
        </div>
      </section>

      {/* Trust */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {(trust || []).map((f, i) => {
            const Icon = ICONS[f.icon] || Sparkles;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.5 }}
                className="rounded-[2rem] bg-slate-50 border border-slate-100 p-8 hover:-translate-y-1.5 hover:shadow-[0_18px_40px_rgb(0,0,0,0.06)] transition-[transform,box-shadow] duration-300">
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
              style={{ WebkitTextStroke: "1.5px rgba(1,94,239,0.2)" }}>
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
          <div className="border-t border-white/10 mt-12 pt-8 text-sm text-slate-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-slate-300">GoRoky · RokyMovil · Tramilex</span>
              <span>© {new Date().getFullYear()} {footer.company}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <a href="/privacidad" className="hover:text-white transition-colors" data-testid="footer-privacy-link">Política de privacidad</a>
              <a href="/terminos" className="hover:text-white transition-colors" data-testid="footer-terms-link">Términos y condiciones</a>
              <button onClick={() => navigate("/login")} className="hover:text-white transition-colors text-left" data-testid="footer-login-btn">Acceso clientes</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
