import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileSignature, Plus, Trash2, RotateCcw, Eye } from "lucide-react";
import { toast } from "sonner";

const PLACEHOLDERS = [
  "{customerName}", "{fiscalId}", "{customerAddress}", "{customerEmail}",
  "{customerPhone}", "{productName}", "{lineNumber}", "{price}",
  "{issuerBrand}", "{issuerLegal}", "{issuerCif}", "{issuerAddr}",
];

export default function ContractTemplateCard() {
  const [tpl, setTpl] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/contract-template").then((r) => setTpl(r.data)).catch((e) => toast.error(apiErr(e)));
  useEffect(() => { load(); }, []);

  const set = (k, v) => setTpl((t) => ({ ...t, [k]: v }));
  const setClause = (i, k, v) => setTpl((t) => {
    const clauses = [...t.clauses];
    clauses[i] = { ...clauses[i], [k]: v };
    return { ...t, clauses };
  });
  const addClause = () => setTpl((t) => ({ ...t, clauses: [...(t.clauses || []), { title: "", body: "" }] }));
  const removeClause = (i) => setTpl((t) => ({ ...t, clauses: t.clauses.filter((_, idx) => idx !== i) }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/contract-template", tpl);
      toast.success("Plantilla de contrato guardada");
    } catch (e) { toast.error(apiErr(e)); } finally { setSaving(false); }
  };

  const reset = async () => {
    setSaving(true);
    try {
      const { data } = await api.post("/contract-template/reset");
      setTpl(data);
      toast.success("Plantilla restaurada por defecto (guarda para aplicar)");
    } catch (e) { toast.error(apiErr(e)); } finally { setSaving(false); }
  };

  const preview = () => window.open("/contratar", "_blank");

  if (!tpl) return null;

  return (
    <div data-testid="contract-template-card" className="rounded-lg border border-border bg-card p-6 lg:col-span-2 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-primary">
          <FileSignature size={18} />
          <h3 className="font-heading font-600 text-foreground">Contrato PDF (editable)</h3>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-full gap-1.5" data-testid="contract-reset-btn" onClick={reset} disabled={saving}>
            <RotateCcw size={14} /> Restaurar
          </Button>
          <Button size="sm" className="rounded-full gap-1.5" data-testid="contract-save-btn" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar contrato"}
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Edita el texto del contrato que se genera y se envía al cliente para firmar. Puedes usar variables entre llaves
        (se rellenan automáticamente): {PLACEHOLDERS.map((p) => <code key={p} className="mx-0.5 rounded bg-muted px-1 py-0.5 text-[11px]">{p}</code>)}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Título</Label><Input data-testid="ct-title" value={tpl.title} onChange={(e) => set("title", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Subtítulo</Label><Input data-testid="ct-subtitle" value={tpl.subtitle} onChange={(e) => set("subtitle", e.target.value)} /></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Marca</Label><Input data-testid="ct-brand" value={tpl.issuerBrand} onChange={(e) => set("issuerBrand", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Razón social</Label><Input data-testid="ct-legal" value={tpl.issuerLegal} onChange={(e) => set("issuerLegal", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>CIF</Label><Input data-testid="ct-cif" value={tpl.issuerCif} onChange={(e) => set("issuerCif", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Dirección</Label><Input data-testid="ct-addr" value={tpl.issuerAddr} onChange={(e) => set("issuerAddr", e.target.value)} /></div>
      </div>

      <div className="space-y-1.5">
        <Label>Reunidos — El Operador</Label>
        <Textarea data-testid="ct-reunidos-operator" rows={2} value={tpl.reunidosOperator} onChange={(e) => set("reunidosOperator", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Reunidos — El Cliente</Label>
        <Textarea data-testid="ct-reunidos-client" rows={2} value={tpl.reunidosClient} onChange={(e) => set("reunidosClient", e.target.value)} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Cláusulas</Label>
          <Button variant="outline" size="sm" className="rounded-full gap-1.5" data-testid="ct-add-clause" onClick={addClause}>
            <Plus size={14} /> Añadir cláusula
          </Button>
        </div>
        {(tpl.clauses || []).map((cl, i) => (
          <div key={i} data-testid={`ct-clause-${i}`} className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
            <div className="flex items-center gap-2">
              <Input data-testid={`ct-clause-title-${i}`} className="flex-1" placeholder="Título de la cláusula" value={cl.title} onChange={(e) => setClause(i, "title", e.target.value)} />
              <Button variant="outline" size="icon" className="rounded-full text-destructive hover:bg-destructive/10 shrink-0" data-testid={`ct-remove-clause-${i}`} onClick={() => removeClause(i)}>
                <Trash2 size={14} />
              </Button>
            </div>
            <Textarea data-testid={`ct-clause-body-${i}`} rows={3} placeholder="Texto de la cláusula" value={cl.body} onChange={(e) => setClause(i, "body", e.target.value)} />
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="rounded-full gap-1.5 text-muted-foreground" data-testid="ct-preview-btn" onClick={preview}>
          <Eye size={14} /> Ver flujo de firma público
        </Button>
      </div>
    </div>
  );
}
