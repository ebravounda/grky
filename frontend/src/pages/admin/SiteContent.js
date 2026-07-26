import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Save, Globe, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const ICON_OPTIONS = ["Repeat", "Zap", "Smartphone", "Headphones", "ShieldCheck", "Sparkles", "Wifi", "Signal"];

export default function SiteContent() {
  const [c, setC] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/admin/site-content").then((r) => setC(r.data)).catch((e) => toast.error(apiErr(e))); }, []);

  const setSection = (section, key, value) =>
    setC((s) => ({ ...s, [section]: { ...s[section], [key]: value } }));

  const setTrust = (i, key, value) =>
    setC((s) => ({ ...s, trust: s.trust.map((t, j) => (j === i ? { ...t, [key]: value } : t)) }));
  const addTrust = () => setC((s) => ({ ...s, trust: [...(s.trust || []), { icon: "Sparkles", title: "", desc: "" }] }));
  const removeTrust = (i) => setC((s) => ({ ...s, trust: s.trust.filter((_, j) => j !== i) }));

  const setCity = (i, value) => setC((s) => ({ ...s, cities: s.cities.map((ci, j) => (j === i ? value : ci)) }));
  const addCity = () => setC((s) => ({ ...s, cities: [...(s.cities || []), ""] }));
  const removeCity = (i) => setC((s) => ({ ...s, cities: s.cities.filter((_, j) => j !== i) }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...c, cities: (c.cities || []).map((x) => x.trim()).filter(Boolean) };
      const { data } = await api.put("/admin/site-content", { content: payload });
      setC(data);
      toast.success("Contenido de la web guardado");
    } catch (e) { toast.error(apiErr(e)); } finally { setSaving(false); }
  };

  if (!c) return <div className="grid place-items-center py-20"><div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-4xl" data-testid="site-content-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold flex items-center gap-2"><Globe size={22} /> Contenido web</h1>
          <p className="text-muted-foreground text-sm mt-1">Edita los textos de la página pública (rokymovil.com). Los cambios se aplican al instante.</p>
        </div>
        <div className="flex gap-2">
          <a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline" data-testid="view-site-link">
            <ExternalLink size={15} /> Ver web
          </a>
          <Button onClick={save} disabled={saving} className="rounded-full gap-1.5" data-testid="save-content-btn">
            <Save size={15} /> {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>

      {/* Hero */}
      <Card className="p-6 space-y-4">
        <h2 className="font-heading font-bold">Sección principal (Hero)</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Etiqueta / badge"><Input data-testid="hero-badge" value={c.hero?.badge || ""} onChange={(e) => setSection("hero", "badge", e.target.value)} /></Field>
          <Field label="Título"><Input data-testid="hero-title" value={c.hero?.title || ""} onChange={(e) => setSection("hero", "title", e.target.value)} /></Field>
          <Field label="Palabra destacada (color)"><Input data-testid="hero-highlight" value={c.hero?.titleHighlight || ""} onChange={(e) => setSection("hero", "titleHighlight", e.target.value)} /></Field>
          <Field label="Botón principal"><Input data-testid="hero-cta1" value={c.hero?.ctaPrimary || ""} onChange={(e) => setSection("hero", "ctaPrimary", e.target.value)} /></Field>
          <Field label="Botón secundario"><Input data-testid="hero-cta2" value={c.hero?.ctaSecondary || ""} onChange={(e) => setSection("hero", "ctaSecondary", e.target.value)} /></Field>
          <Field label="Subtítulo" full><Textarea data-testid="hero-subtitle" rows={2} value={c.hero?.subtitle || ""} onChange={(e) => setSection("hero", "subtitle", e.target.value)} /></Field>
        </div>
      </Card>

      {/* Planes */}
      <Card className="p-6 space-y-4">
        <h2 className="font-heading font-bold">Sección de tarifas</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Antetítulo"><Input data-testid="plans-eyebrow" value={c.plans?.eyebrow || ""} onChange={(e) => setSection("plans", "eyebrow", e.target.value)} /></Field>
          <Field label="Título"><Input data-testid="plans-title" value={c.plans?.title || ""} onChange={(e) => setSection("plans", "title", e.target.value)} /></Field>
        </div>
      </Card>

      {/* Cobertura */}
      <Card className="p-6 space-y-4">
        <h2 className="font-heading font-bold">Sección de cobertura de fibra</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Antetítulo"><Input data-testid="coverage-eyebrow" value={c.coverage?.eyebrow || ""} onChange={(e) => setSection("coverage", "eyebrow", e.target.value)} /></Field>
          <Field label="Título"><Input data-testid="coverage-title" value={c.coverage?.title || ""} onChange={(e) => setSection("coverage", "title", e.target.value)} /></Field>
          <Field label="Descripción" full><Textarea data-testid="coverage-desc" rows={2} value={c.coverage?.description || ""} onChange={(e) => setSection("coverage", "description", e.target.value)} /></Field>
        </div>
      </Card>

      {/* Trust */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-bold">Ventajas (bloques de confianza)</h2>
          <Button variant="outline" size="sm" onClick={addTrust} className="rounded-full gap-1.5" data-testid="add-trust-btn"><Plus size={14} /> Añadir</Button>
        </div>
        <div className="space-y-3">
          {(c.trust || []).map((t, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[130px_1fr_1.5fr_auto] gap-3 items-end border-b border-border/60 pb-3" data-testid={`trust-row-${i}`}>
              <Field label="Icono">
                <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" data-testid={`trust-icon-${i}`}
                  value={t.icon} onChange={(e) => setTrust(i, "icon", e.target.value)}>
                  {ICON_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Título"><Input data-testid={`trust-title-${i}`} value={t.title} onChange={(e) => setTrust(i, "title", e.target.value)} /></Field>
              <Field label="Descripción"><Input data-testid={`trust-desc-${i}`} value={t.desc} onChange={(e) => setTrust(i, "desc", e.target.value)} /></Field>
              <button onClick={() => removeTrust(i)} className="h-10 w-10 grid place-items-center rounded-md text-destructive hover:bg-destructive/10" data-testid={`remove-trust-${i}`}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </Card>

      {/* Cities */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-bold">Ciudades (SEO local)</h2>
          <Button variant="outline" size="sm" onClick={addCity} className="rounded-full gap-1.5" data-testid="add-city-btn"><Plus size={14} /> Añadir</Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(c.cities || []).map((ci, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input data-testid={`city-${i}`} value={ci} onChange={(e) => setCity(i, e.target.value)} />
              <button onClick={() => removeCity(i)} className="h-9 w-9 shrink-0 grid place-items-center rounded-md text-destructive hover:bg-destructive/10" data-testid={`remove-city-${i}`}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </Card>

      {/* Footer */}
      <Card className="p-6 space-y-4">
        <h2 className="font-heading font-bold">Pie de página</h2>
        <Field label="Descripción SEO" full><Textarea data-testid="footer-desc" rows={3} value={c.footer?.description || ""} onChange={(e) => setSection("footer", "description", e.target.value)} /></Field>
        <Field label="Datos legales de la empresa" full><Input data-testid="footer-company" value={c.footer?.company || ""} onChange={(e) => setSection("footer", "company", e.target.value)} /></Field>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="rounded-full gap-1.5" data-testid="save-content-btn-bottom">
          <Save size={15} /> {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
