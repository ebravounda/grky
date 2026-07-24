import { useEffect, useRef, useState } from "react";
import api, { apiErr, API } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Megaphone, Image as ImageIcon, Upload, Trash2, Plus, X, Bell, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const EMPTY = {
  title: "", subtitle: "", imageUrl: "", imageData: null, ctaText: "Ver más", ctaLink: "/contratar",
  placement: "banner", audience: "all", audienceService: "Mobile", audienceFiscalIds: [], priceBadge: "", active: true,
};

function fullImg(url) {
  if (!url) return undefined;
  return url.startsWith("/api/") ? `${API.replace("/api", "")}${url}` : url;
}

export default function Promociones() {
  const [promos, setPromos] = useState([]);
  const [f, setF] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const load = () => api.get("/promotions").then((r) => setPromos(r.data));
  useEffect(() => { load(); }, []);

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const reset = () => { setF(EMPTY); setEditId(null); if (fileRef.current) fileRef.current.value = ""; };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setF((s) => ({ ...s, imageData: reader.result, imageUrl: "" }));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!f.title) return toast.error("Ponle un título a la promoción");
    setSaving(true);
    try {
      if (editId) { await api.put(`/promotions/${editId}`, f); toast.success("Promoción actualizada"); }
      else { await api.post("/promotions", f); toast.success("Promoción creada"); }
      reset(); load();
    } catch (e) { toast.error(apiErr(e)); } finally { setSaving(false); }
  };

  const edit = (p) => {
    setEditId(p.promoId);
    setF({ ...EMPTY, ...p, imageData: null });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (id) => {
    if (!window.confirm("¿Eliminar esta promoción?")) return;
    await api.delete(`/promotions/${id}`); toast.success("Eliminada"); load();
  };

  const previewImg = f.imageData || fullImg(f.imageUrl) ||
    "https://images.unsplash.com/photo-1662858557337-48c9ecf07ee0?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

  return (
    <div data-testid="promociones-page">
      <PageHeader overline="Marketing" title="Promociones"
        subtitle="Envía banners, popups y ofertas a tus clientes en su área personal." />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulario */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-card p-6 rounded-2xl shadow-sm border border-border space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-600 flex items-center gap-2"><Megaphone size={18} className="text-primary" /> {editId ? "Editar promoción" : "Nueva promoción"}</h3>
              {editId && <Button variant="ghost" size="sm" onClick={reset} className="gap-1"><Plus size={14} /> Nueva</Button>}
            </div>

            <div className="space-y-1.5"><Label>Título *</Label><Input data-testid="promo-title" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Tus favoritos, ¡ahora en rebajas!" /></div>
            <div className="space-y-1.5"><Label>Subtítulo</Label><Textarea data-testid="promo-subtitle" value={f.subtitle} onChange={(e) => set("subtitle", e.target.value)} placeholder="Descripción corta de la oferta" rows={2} /></div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Texto del botón</Label><Input data-testid="promo-cta-text" value={f.ctaText} onChange={(e) => set("ctaText", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Enlace del botón</Label><Input data-testid="promo-cta-link" value={f.ctaLink} onChange={(e) => set("ctaLink", e.target.value)} placeholder="/contratar" /></div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><ImageIcon size={14} /> Imagen</Label>
              <div className="flex gap-2">
                <Input data-testid="promo-image-url" value={f.imageUrl} onChange={(e) => { set("imageUrl", e.target.value); set("imageData", null); }} placeholder="Pega una URL de imagen…" />
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} data-testid="promo-image-file" />
                <Button type="button" variant="outline" className="rounded-lg gap-1.5 shrink-0" onClick={() => fileRef.current?.click()}><Upload size={15} /> Subir</Button>
              </div>
              {f.imageData && <p className="text-xs text-success">Imagen cargada ✓</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ubicación</Label>
                <Select value={f.placement} onValueChange={(v) => set("placement", v)}>
                  <SelectTrigger data-testid="promo-placement"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="banner">Banner (inicio)</SelectItem>
                    <SelectItem value="popup">Popup (emergente)</SelectItem>
                    <SelectItem value="offer">Oferta (carrusel)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Etiqueta de precio</Label><Input data-testid="promo-badge" value={f.priceBadge} onChange={(e) => set("priceBadge", e.target.value)} placeholder="-40% / Desde 38€" /></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Audiencia</Label>
                <Select value={f.audience} onValueChange={(v) => set("audience", v)}>
                  <SelectTrigger data-testid="promo-audience"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los clientes</SelectItem>
                    <SelectItem value="service">Por tipo de servicio</SelectItem>
                    <SelectItem value="specific">Clientes concretos (NIF)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {f.audience === "service" && (
                <div className="space-y-1.5">
                  <Label>Servicio</Label>
                  <Select value={f.audienceService} onValueChange={(v) => set("audienceService", v)}>
                    <SelectTrigger data-testid="promo-service"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mobile">Móvil</SelectItem>
                      <SelectItem value="Fiber">Fibra</SelectItem>
                      <SelectItem value="Satellite">Satélite</SelectItem>
                      <SelectItem value="TV">TV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {f.audience === "specific" && (
                <div className="space-y-1.5">
                  <Label>NIF (separados por coma)</Label>
                  <Input data-testid="promo-fiscalids" value={(f.audienceFiscalIds || []).join(",")} onChange={(e) => set("audienceFiscalIds", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} placeholder="12345678A, B87654321" />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm font-medium">Activa (visible para clientes)</span>
              <Switch data-testid="promo-active" checked={f.active} onCheckedChange={(v) => set("active", v)} />
            </div>

            <Button data-testid="save-promo-btn" className="w-full rounded-xl h-11 font-semibold" onClick={save} disabled={saving}>
              {saving ? "Guardando…" : editId ? "Guardar cambios" : "Crear promoción"}
            </Button>
          </div>

          {/* Lista */}
          <div className="space-y-2">
            {promos.map((p) => (
              <div key={p.promoId} data-testid={`promo-row-${p.promoId}`} className="flex items-center gap-3 bg-card border border-border rounded-xl p-3">
                <img src={fullImg(p.imageUrl)} alt="" className="h-12 w-16 rounded-md object-cover bg-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="uppercase">{p.placement}</span> · {p.audience === "all" ? "Todos" : p.audience === "service" ? p.audienceService : "Concretos"} · {p.active ? <span className="text-success">Activa</span> : <span className="text-muted-foreground">Inactiva</span>}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => edit(p)} data-testid={`edit-promo-${p.promoId}`}>Editar</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(p.promoId)} data-testid={`delete-promo-${p.promoId}`}><Trash2 size={15} /></Button>
              </div>
            ))}
            {promos.length === 0 && <p className="text-center text-muted-foreground py-8">Aún no hay promociones.</p>}
          </div>
        </div>

        {/* Preview */}
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-6">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-3 text-center">Vista previa · {f.placement}</p>
            <div className="bg-slate-100 rounded-[36px] p-4 border-4 border-slate-200 shadow-inner">
              <div className="bg-white rounded-[24px] overflow-hidden min-h-[420px] p-4">
                {/* fake header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2"><div className="h-8 w-8 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-bold">JG</div><div><p className="text-[10px] text-muted-foreground leading-none">Hola,</p><p className="text-xs font-bold">Juan</p></div></div>
                  <Bell size={16} className="text-slate-400" />
                </div>

                {f.placement === "banner" && (
                  <div className="relative h-40 rounded-2xl overflow-hidden shadow-md">
                    <img src={previewImg} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/95 to-primary/50" />
                    <div className="relative h-full flex flex-col justify-center p-5 text-white">
                      <p className="text-lg font-bold leading-tight">{f.title || "Título de la promo"}</p>
                      <p className="text-xs text-white/85 mt-1 line-clamp-2">{f.subtitle}</p>
                      <span className="mt-3 w-fit px-4 py-1.5 bg-accent text-white text-xs font-semibold rounded-full shadow-lg">{f.ctaText || "Ver más"}</span>
                    </div>
                  </div>
                )}

                {f.placement === "offer" && (
                  <div className="w-[75%] rounded-2xl overflow-hidden border border-border shadow-sm">
                    <div className="relative h-28"><img src={previewImg} alt="" className="w-full h-full object-cover" />{f.priceBadge && <span className="absolute top-2 right-2 bg-accent text-white text-xs font-bold px-2 py-1 rounded-md shadow">{f.priceBadge}</span>}</div>
                    <div className="p-3">
                      <p className="font-bold text-sm leading-tight">{f.title || "Título de la oferta"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{f.subtitle}</p>
                      <p className="text-primary font-semibold text-xs flex items-center gap-1 mt-2">{f.ctaText || "Ver más"} <ArrowRight size={12} /></p>
                    </div>
                  </div>
                )}

                {f.placement === "popup" && (
                  <div className="mt-6 mx-auto max-w-[240px] rounded-3xl overflow-hidden shadow-2xl border border-border relative">
                    <div className="absolute top-2 right-2 bg-black/30 rounded-full p-1"><X size={12} className="text-white" /></div>
                    <img src={previewImg} alt="" className="w-full h-32 object-cover" />
                    <div className="p-5 text-center">
                      <p className="text-lg font-bold leading-tight">{f.title || "Título del popup"}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{f.subtitle}</p>
                      <div className="mt-4 py-2.5 bg-accent text-white rounded-xl font-bold text-sm">{f.ctaText || "Ver más"}</div>
                      <p className="text-[10px] text-muted-foreground mt-2">No volver a mostrar</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
