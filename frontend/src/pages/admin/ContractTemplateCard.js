import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileSignature, Save, RotateCcw, Eye, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function ContractTemplateCard() {
  const [tpl, setTpl] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/contract-template").then((r) => setTpl(r.data)).catch((e) => toast.error(apiErr(e)));
  useEffect(() => { load(); }, []);

  const set = (k, v) => setTpl((t) => ({ ...t, [k]: v }));
  const setAviso = (i, k, v) => setTpl((t) => ({ ...t, avisoSections: t.avisoSections.map((s, j) => j === i ? { ...s, [k]: v } : s) }));
  const addAviso = () => setTpl((t) => ({ ...t, avisoSections: [...(t.avisoSections || []), { title: "", body: "" }] }));
  const removeAviso = (i) => setTpl((t) => ({ ...t, avisoSections: t.avisoSections.filter((_, j) => j !== i) }));

  const save = async () => {
    setSaving(true);
    try { const { data } = await api.put("/contract-template", tpl); setTpl(data); toast.success("Contrato guardado · se aplicará a las próximas firmas"); }
    catch (e) { toast.error(apiErr(e)); } finally { setSaving(false); }
  };
  const reset = async () => {
    try { const { data } = await api.post("/contract-template/reset"); setTpl(data); toast.success("Contrato restaurado al oficial"); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const preview = async () => {
    try {
      const r = await api.get("/contract-template/preview.pdf", { responseType: "blob" });
      window.open(URL.createObjectURL(r.data), "_blank");
    } catch (e) { toast.error(apiErr(e)); }
  };

  if (!tpl) return <div className="rounded-lg border border-border bg-card p-6 lg:col-span-2"><div className="h-6 w-40 bg-muted animate-pulse rounded" /></div>;

  return (
    <div data-testid="contract-template-card" className="rounded-lg border border-border bg-card p-6 lg:col-span-2 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-heading font-600 flex items-center gap-2"><FileSignature size={18} /> Contrato de alta</h3>
          <p className="text-sm text-muted-foreground mt-1">Edita el contrato oficial que firma el cliente. Usa variables como <code>{"{customerName}"}</code>, <code>{"{fiscalId}"}</code>, <code>{"{priceTotal}"}</code>, <code>{"{contractNumber}"}</code>.</p>
        </div>
        <div className="flex gap-2">
          <Button data-testid="ct-preview" variant="outline" size="sm" className="rounded-full gap-1.5" onClick={preview}><Eye size={14} /> Ver ejemplo</Button>
          <Button data-testid="ct-reset" variant="outline" size="sm" className="rounded-full gap-1.5" onClick={reset}><RotateCcw size={14} /> Restaurar oficial</Button>
          <Button data-testid="ct-save" size="sm" className="rounded-full gap-1.5" onClick={save} disabled={saving}><Save size={14} /> {saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      </div>

      {/* Emisor y soporte */}
      <Group title="Emisor y soporte">
        <F l="Marca" k="issuerBrand" tpl={tpl} set={set} />
        <F l="Razón social" k="issuerLegal" tpl={tpl} set={set} />
        <F l="CIF" k="issuerCif" tpl={tpl} set={set} />
        <F l="Dirección" k="issuerAddr" tpl={tpl} set={set} />
        <F l="Teléfono soporte" k="supportPhone" tpl={tpl} set={set} />
        <F l="Email soporte" k="supportEmail" tpl={tpl} set={set} />
        <F l="Horario soporte" k="supportHours" tpl={tpl} set={set} />
        <F l="Web" k="website" tpl={tpl} set={set} />
      </Group>

      {/* Textos principales */}
      <Group title="Textos del contrato">
        <F l="Título del contrato" k="contractTitle" tpl={tpl} set={set} />
        <T l="Título · Datos de tu contrato" k="sec1Title" tpl={tpl} set={set} rows={1} />
        <T l="Bienvenida (Datos de tu Contrato)" k="welcomeText" tpl={tpl} set={set} rows={6} full />
        <T l="Título · Nuestros datos" k="sec2Title" tpl={tpl} set={set} rows={1} />
        <T l="Nuestros datos (operadores)" k="ourDataText" tpl={tpl} set={set} rows={4} full />
        <T l="Título · Tus datos" k="sec3Title" tpl={tpl} set={set} rows={1} />
        <T l="Título · Importe total" k="sec4Title" tpl={tpl} set={set} rows={1} />
        <T l="Título · Lo que vas a tener" k="sec5Title" tpl={tpl} set={set} rows={1} />
        <T l="Nota de servicios (IVA/promos)" k="servicesNote" tpl={tpl} set={set} rows={3} full />
      </Group>

      {/* Legal */}
      <Group title="Condiciones y aceptación">
        <T l="Título · Lo que tienes que saber y aceptar" k="sec6Title" tpl={tpl} set={set} rows={1} />
        <T l="Texto legal (saber y aceptar)" k="knowAcceptText" tpl={tpl} set={set} rows={5} full />
        <T l="Tratamiento de datos" k="dataProtectionText" tpl={tpl} set={set} rows={5} full />
        <T l="Texto de la casilla de aceptación" k="acceptanceText" tpl={tpl} set={set} rows={2} full />
        <T l="Nota firma electrónica" k="electronicText" tpl={tpl} set={set} rows={2} full />
        <T l="Enlaces a condiciones" k="linksText" tpl={tpl} set={set} rows={5} full />
        <T l="Pie de página" k="footerText" tpl={tpl} set={set} rows={2} full />
      </Group>

      {/* Aviso legal */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Aviso legal — apartados</Label>
          <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={addAviso} data-testid="ct-add-aviso"><Plus size={13} /> Añadir</Button>
        </div>
        <F l="Título del aviso legal" k="avisoTitle" tpl={tpl} set={set} />
        {(tpl.avisoSections || []).map((s, i) => (
          <div key={i} className="rounded-lg border border-border p-3 space-y-2" data-testid={`ct-aviso-${i}`}>
            <div className="flex gap-2 items-center">
              <Input className="flex-1" placeholder="Título del apartado" value={s.title || ""} onChange={(e) => setAviso(i, "title", e.target.value)} data-testid={`ct-aviso-title-${i}`} />
              <button className="h-9 w-9 grid place-items-center rounded-md text-destructive hover:bg-destructive/10" onClick={() => removeAviso(i)} data-testid={`ct-aviso-remove-${i}`}><Trash2 size={15} /></button>
            </div>
            <Textarea rows={3} placeholder="Texto del apartado" value={s.body || ""} onChange={(e) => setAviso(i, "body", e.target.value)} data-testid={`ct-aviso-body-${i}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Group({ title, children }) {
  return (
    <div className="border-t border-border/60 pt-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">{title}</p>
      <div className="grid sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}
function F({ l, k, tpl, set }) {
  return <div className="space-y-1.5"><Label className="text-xs">{l}</Label><Input value={tpl[k] || ""} onChange={(e) => set(k, e.target.value)} data-testid={`ct-${k}`} /></div>;
}
function T({ l, k, tpl, set, rows = 2, full }) {
  return <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}><Label className="text-xs">{l}</Label><Textarea rows={rows} value={tpl[k] || ""} onChange={(e) => set(k, e.target.value)} data-testid={`ct-${k}`} /></div>;
}
