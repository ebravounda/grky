import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { apiErr, API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StatusPill } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Signal, Wifi, ArrowRight, Repeat, Plus, ReceiptText, X, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

function fullImg(url) {
  if (!url) return undefined;
  return url.startsWith("/api/") ? `${API.replace("/api", "")}${url}` : url;
}

export default function ClientDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [products, setProducts] = useState([]);
  const [promos, setPromos] = useState({ banner: [], popup: [], offer: [] });
  const [popup, setPopup] = useState(null);
  const [changing, setChanging] = useState(null);
  const [newProduct, setNewProduct] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeCard, setActiveCard] = useState(0);
  const scrollRef = useRef();

  const load = () => api.get("/me/summary").then((r) => setData(r.data));
  useEffect(() => {
    load();
    api.get("/products").then((r) => setProducts(r.data.filter((p) => p.type === "Main")));
    api.get("/me/promotions").then((r) => {
      setPromos(r.data);
      if (r.data.popup?.length) setPopup(r.data.popup[0]);
    }).catch(() => {});
  }, []);

  if (!data) return <div className="p-6 text-muted-foreground">Cargando…</div>;

  const initials = (user?.name || "GR").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const banner = promos.banner?.[0];

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const w = el.clientWidth * 0.85 + 16;
    setActiveCard(Math.round(el.scrollLeft / w));
  };

  const dismissPopup = async (noShow) => {
    if (noShow && popup) { try { await api.post(`/me/promotions/${popup.promoId}/dismiss`); } catch (e) {} }
    setPopup(null);
  };
  const goCta = (link) => {
    if (!link) return;
    if (link.startsWith("http")) window.location.href = link;
    else navigate(link);
  };

  const openChange = (sub) => { setChanging(sub); setNewProduct(""); };
  const confirmChange = async () => {
    if (!newProduct) return;
    setSaving(true);
    try {
      const { data: res } = await api.post("/subscriptions/change-tariff", { subscriptionId: changing.subscriptionId, newProductId: newProduct });
      toast.success(`Tarifa cambiada a ${res.productName}`);
      setChanging(null); load();
    } catch (e) { toast.error(apiErr(e)); } finally { setSaving(false); }
  };
  const family = changing?.products?.[0]?.family;
  const options = products.filter((p) => p.family === family);

  return (
    <div data-testid="client-dashboard" className="pt-2">
      {/* Greeting */}
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="h-11 w-11 rounded-full bg-primary/10 text-primary grid place-items-center font-bold text-sm">{initials}</div>
        <div className="leading-tight">
          <p className="text-base font-bold text-slate-900">Hola, {user?.name?.split(" ")[0]}</p>
          <Link to="/portal/invoices" className="text-xs text-slate-500 flex items-center gap-0.5 hover:text-primary">Ir a Mi cuenta <ChevronRight size={13} /></Link>
        </div>
      </div>

      {/* Hero banner */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        onClick={() => banner && goCta(banner.ctaLink)}
        data-testid="client-hero-banner"
        className="mx-5 mt-1 relative h-44 rounded-2xl overflow-hidden shadow-md cursor-pointer group">
        <img src={banner ? fullImg(banner.imageUrl) : "https://images.unsplash.com/photo-1662858557337-48c9ecf07ee0?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"}
          alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/95 to-primary/50" />
        <div className="relative h-full flex flex-col justify-center p-6 text-white">
          <p className="text-xl font-bold leading-tight mb-1">{banner ? banner.title : "Bienvenido a GoRoky"}</p>
          <p className="text-sm text-white/85 mb-4 line-clamp-2">{banner ? banner.subtitle : "Gestiona tus líneas, consumo y facturas."}</p>
          <span className="w-fit px-4 py-1.5 bg-accent text-white text-sm font-semibold rounded-full shadow-lg">{banner ? banner.ctaText : "Ver tarifas"}</span>
        </div>
      </motion.div>

      {/* Productos */}
      <div className="px-5 mt-7 mb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">Gestiona tus productos</h2>
        <span className="text-xs text-slate-500">{data.lines.length} líneas</span>
      </div>
      <div ref={scrollRef} onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar gap-4 px-5 pb-2">
        {data.lines.map((l) => {
          const sub = data.subscriptions.find((s) => s.products?.[0]?.lineNumber === l.lineNumber);
          const isMobile = l.family === "Mobile";
          const pct = l.totalGB ? Math.min(100, Math.round((l.usedGB / l.totalGB) * 100)) : 0;
          return (
            <div key={l.id} data-testid={`client-line-${l.lineNumber}`}
              className="snap-center w-[85%] shrink-0 bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)]">
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-lg bg-slate-100 grid place-items-center text-slate-500">
                    {isMobile ? <Signal size={17} /> : <Wifi size={17} />}
                  </div>
                  <div className="leading-tight">
                    <p className="text-lg font-bold text-slate-900">{l.lineNumber}</p>
                    <StatusPill status={l.status} />
                  </div>
                </div>
                <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-md">{l.productName}</span>
              </div>

              {isMobile ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{l.usedGB} GB usados</span><span className="font-semibold text-slate-700">{l.totalGB} GB</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <motion.div className={`h-full rounded-full ${pct > 80 ? "bg-accent" : "bg-primary"}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 flex items-center gap-1.5"><Wifi size={15} className="text-primary" /> Conexión activa</p>
              )}

              <p className="font-bold text-xl mt-4 text-slate-900">{l.price?.toFixed(2)} <span className="text-sm font-medium text-slate-400">€/mes</span></p>

              <div className="flex gap-2 mt-4">
                <Link to={`/portal/lines/${l.lineNumber}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full rounded-xl gap-1.5" data-testid={`view-line-${l.lineNumber}`}>Detalle <ArrowRight size={14} /></Button>
                </Link>
                {sub && (
                  <Button size="sm" className="rounded-xl gap-1.5" data-testid={`change-pack-${l.lineNumber}`} onClick={() => openChange(sub)}>
                    <Repeat size={14} /> Cambiar
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {data.lines.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {data.lines.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === activeCard ? "w-5 bg-primary" : "w-1.5 bg-slate-300"}`} />
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="px-5 my-6 space-y-3">
        <a href="/contratar" data-testid="cta-add-line"
          className="flex items-center justify-center gap-2 w-full py-3.5 bg-accent text-white rounded-xl font-bold text-base shadow-[0_4px_16px_rgba(255,106,0,0.3)] hover:bg-accent/90 transition-colors active:scale-[0.98]">
          <Plus size={20} /> Añadir línea, fibra y TV
        </a>
        <Link to="/portal/invoices" data-testid="cta-invoices"
          className="flex items-center justify-center gap-2 w-full py-3.5 bg-white border-2 border-primary text-primary rounded-xl font-bold text-base hover:bg-primary/5 transition-colors active:scale-[0.98]">
          <ReceiptText size={19} /> Ver mis facturas
        </Link>
      </div>

      {/* Ofertas para ti */}
      {promos.offer?.length > 0 && (
        <>
          <div className="px-5 mt-2 mb-2"><h2 className="text-lg font-bold tracking-tight text-slate-900">Ofertas para ti</h2></div>
          <div className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar gap-4 px-5 pb-4">
            {promos.offer.map((o) => (
              <div key={o.promoId} data-testid={`offer-${o.promoId}`}
                onClick={() => goCta(o.ctaLink)}
                className="snap-center w-[72%] shrink-0 bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] cursor-pointer transition-transform hover:-translate-y-1">
                <div className="h-32 w-full relative">
                  <img src={fullImg(o.imageUrl)} alt="" className="w-full h-full object-cover" />
                  {o.priceBadge && <span className="absolute top-2 right-2 bg-accent text-white text-xs font-bold px-2 py-1 rounded-md shadow-md">{o.priceBadge}</span>}
                </div>
                <div className="p-4">
                  <p className="font-bold text-slate-900 leading-tight">{o.title}</p>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{o.subtitle}</p>
                  <p className="mt-3 text-primary font-semibold text-sm flex items-center gap-1">{o.ctaText} <ArrowRight size={14} /></p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Popup promo */}
      <AnimatePresence>
        {popup && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => dismissPopup(false)} data-testid="promo-popup">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}>
              <button aria-label="Cerrar" data-testid="popup-close" onClick={() => dismissPopup(false)}
                className="absolute top-3 right-3 bg-black/30 hover:bg-black/50 backdrop-blur-md rounded-full p-1.5 text-white z-10"><X size={18} /></button>
              <img src={fullImg(popup.imageUrl)} alt="" className="w-full h-44 object-cover" />
              <div className="p-6 text-center">
                <h3 className="text-2xl font-bold text-slate-900 mb-2">{popup.title}</h3>
                <p className="text-sm text-slate-500">{popup.subtitle}</p>
                <button data-testid="popup-cta" onClick={() => goCta(popup.ctaLink)}
                  className="w-full py-3.5 bg-accent text-white rounded-xl font-bold text-base mt-5 shadow-lg hover:bg-accent/90 transition-colors">{popup.ctaText}</button>
                <button data-testid="popup-dismiss" onClick={() => dismissPopup(true)}
                  className="text-xs text-slate-400 mt-3 hover:text-slate-600">No volver a mostrar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cambiar tarifa */}
      <Dialog open={!!changing} onOpenChange={(o) => !o && setChanging(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cambiar tarifa</DialogTitle>
            <DialogDescription>Elige tu nueva tarifa. El cambio se aplica de inmediato.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Tarifa actual: <b className="text-foreground">{changing?.products?.[0]?.productName}</b></p>
            <div className="space-y-1.5">
              <Label>Nueva tarifa</Label>
              <Select value={newProduct} onValueChange={setNewProduct}>
                <SelectTrigger data-testid="new-tariff-select"><SelectValue placeholder="Selecciona tarifa" /></SelectTrigger>
                <SelectContent>
                  {options.map((p) => <SelectItem key={p.productId} value={p.productId}>{p.productName} — {p.price.toFixed(2)} €</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button data-testid="confirm-tariff-btn" onClick={confirmChange} disabled={saving} className="rounded-full">{saving ? "Cambiando…" : "Confirmar cambio"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
