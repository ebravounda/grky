import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tag, Plus, Pencil, Trash2, Signal, Wifi, Tv, TrendingUp, Wallet, Receipt } from "lucide-react";
import { toast } from "sonner";

const IVA = 1.21;
const famIcon = { Mobile: Signal, Fiber: Wifi, TV: Tv, Satellite: Tv };
const famLabel = { Mobile: "Móvil", Fiber: "Fibra", TV: "TV", Satellite: "Satélite" };
const emptyForm = { productId: "", productName: "", family: "Mobile", type: "Main", saleWithIva: "", costBase: "", features: "", active: true };
const eur = (n) => `${(Number(n) || 0).toFixed(2)} €`;

// Cálculos de rentabilidad (price = venta CON IVA; costPrice = coste SIN IVA)
function metrics(t) {
  const saleWithIva = Number(t.price) || 0;
  const saleBase = saleWithIva / IVA;
  const saleIva = saleWithIva - saleBase;
  const costBase = Number(t.costPrice) || 0;          // cesión SIN IVA (Tramo 1)
  const costWithIva = costBase * IVA;
  const profit = saleWithIva - costWithIva;           // ganancia sobre total CON IVA
  const marginPct = saleWithIva ? (profit / saleWithIva) * 100 : 0;
  return { saleWithIva, saleBase, saleIva, costBase, costWithIva, profit, marginPct };
}

export default function Tariffs() {
  const [tariffs, setTariffs] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/tariffs").then((r) => setTariffs(r.data));
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (t) => {
    setEditing(t);
    setForm({
      productId: t.productId, productName: t.productName, family: t.family, type: t.type || "Main",
      saleWithIva: (Number(t.price || 0)).toFixed(2),
      costBase: (Number(t.costPrice || 0)).toFixed(2),
      active: t.active !== false,
      features: (t.marketingText || []).map((m) => m.value).join("\n"),
    });
    setOpen(true);
  };

  // Previsualización en vivo dentro del formulario
  const saleWithIva = parseFloat(form.saleWithIva) || 0;    // el cliente paga esto
  const saleBase = Math.round((saleWithIva / IVA) * 100) / 100;
  const saleIva = Math.round((saleWithIva - saleBase) * 100) / 100;
  const costBase = parseFloat(form.costBase) || 0;          // cesión Tramo 1 sin IVA
  const costWithIva = Math.round(costBase * IVA * 100) / 100;
  const pProfit = Math.round((saleWithIva - costWithIva) * 100) / 100;
  const pMargin = saleWithIva ? (pProfit / saleWithIva) * 100 : 0;

  const submit = async () => {
    if (!form.productName || !form.saleWithIva) return toast.error("Nombre y precio de venta son obligatorios");
    setSaving(true);
    const payload = {
      productId: form.productId || undefined, productName: form.productName, family: form.family,
      type: form.type,
      price: Math.round((parseFloat(form.saleWithIva) || 0) * 100) / 100,   // venta CON IVA
      costPrice: Math.round((parseFloat(form.costBase) || 0) * 100) / 100,  // coste SIN IVA
      active: form.active,
      features: form.features.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (editing) await api.put(`/tariffs/${editing.productId}`, payload);
      else await api.post("/tariffs", payload);
      toast.success(editing ? "Tarifa actualizada" : "Tarifa creada");
      setOpen(false);
      load();
    } catch (e) { toast.error(apiErr(e)); } finally { setSaving(false); }
  };

  const remove = async (t) => {
    try { await api.delete(`/tariffs/${t.productId}`); toast.success("Tarifa eliminada"); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  // Totales (solo tarifas activas y principales cuentan para "cartera mensual")
  const totals = tariffs.reduce((acc, t) => {
    const m = metrics(t);
    acc.sale += m.saleWithIva; acc.cost += m.costWithIva; acc.profit += m.profit;
    return acc;
  }, { sale: 0, cost: 0, profit: 0 });

  return (
    <div data-testid="tariffs-page">
      <PageHeader
        overline="Catálogo" title="Tarifas y rentabilidad"
        subtitle="Introduce el precio de venta CON IVA (lo que paga el cliente) y el coste de cesión de Likes SIN IVA (Tramo 1). Verás la base sin IVA, el IVA 21%, el coste con IVA y tu ganancia."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="new-tariff-btn" className="rounded-full gap-2" onClick={openNew}><Plus size={16} /> Nueva tarifa</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar tarifa" : "Nueva tarifa"}</DialogTitle>
                <DialogDescription>Define nombre, familia, precios y características de la tarifa.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2"><Label>Nombre</Label><Input data-testid="tariff-name" value={form.productName} onChange={(e) => set("productName", e.target.value)} placeholder="Móvil 25GB" /></div>
                <div className="space-y-1.5">
                  <Label>Familia</Label>
                  <Select value={form.family} onValueChange={(v) => set("family", v)}>
                    <SelectTrigger data-testid="tariff-family"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mobile">Móvil</SelectItem>
                      <SelectItem value="Fiber">Fibra</SelectItem>
                      <SelectItem value="TV">TV</SelectItem>
                      <SelectItem value="Satellite">Satélite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={(v) => set("type", v)}>
                    <SelectTrigger data-testid="tariff-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Main">Principal</SelectItem>
                      <SelectItem value="Optional">Opcional / Bono</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Precio de venta CON IVA (lo que paga el cliente)</Label>
                  <Input data-testid="tariff-sale-price" type="number" step="0.01" value={form.saleWithIva} onChange={(e) => set("saleWithIva", e.target.value)} placeholder="10.00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Coste / cesión SIN IVA (Tramo 1)</Label>
                  <Input data-testid="tariff-cost" type="number" step="0.01" value={form.costBase} onChange={(e) => set("costBase", e.target.value)} placeholder="4.60" />
                </div>

                {/* Previsualización de rentabilidad */}
                <div data-testid="tariff-preview" className="col-span-2 rounded-lg border border-border bg-muted/40 p-3 text-sm space-y-1.5">
                  <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Venta (lo que paga el cliente)</p>
                  <div className="flex justify-between"><span className="text-muted-foreground">Base sin IVA</span><span className="font-500">{eur(saleBase)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">IVA 21%</span><span className="font-500">{eur(saleIva)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Precio final (con IVA)</span><span className="font-700 text-primary" data-testid="preview-final-price">{eur(saleWithIva)}</span></div>
                  <div className="border-t border-border my-1" />
                  <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Coste (Likes · Tramo 1)</p>
                  <div className="flex justify-between"><span className="text-muted-foreground">Coste sin IVA</span><span className="font-500">{eur(costBase)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Coste con IVA</span><span className="font-500 text-orange-600" data-testid="preview-cost-iva">{eur(costWithIva)}</span></div>
                  <div className="border-t border-border my-1" />
                  <div className="flex justify-between"><span className="text-muted-foreground">Tu ganancia (con IVA)</span><span className={`font-700 ${pProfit >= 0 ? "text-emerald-600" : "text-destructive"}`} data-testid="preview-profit">{eur(pProfit)} <span className="text-xs font-500">({pMargin.toFixed(0)}%)</span></span></div>
                </div>

                <div className="space-y-1.5 col-span-2 flex items-center justify-between rounded-md border border-border p-2.5">
                  <span className="text-sm">Activa</span>
                  <Switch data-testid="tariff-active" checked={form.active} onCheckedChange={(v) => set("active", v)} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Características (una por línea)</Label>
                  <Textarea data-testid="tariff-features" rows={3} value={form.features} onChange={(e) => set("features", e.target.value)} placeholder={"25 GB de datos\nLlamadas ilimitadas\n5G incluido"} />
                </div>
              </div>
              <DialogFooter>
                <Button data-testid="save-tariff-btn" onClick={submit} disabled={saving} className="rounded-full">{saving ? "Guardando…" : (editing ? "Guardar cambios" : "Crear tarifa")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Resumen de rentabilidad */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div data-testid="summary-sale" className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Receipt size={16} /> Ingreso mensual (con IVA)</div>
          <p className="font-heading text-2xl font-700">{eur(totals.sale)}</p>
        </div>
        <div data-testid="summary-cost" className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Wallet size={16} /> A pagar a Likes (con IVA)</div>
          <p className="font-heading text-2xl font-700 text-orange-600">{eur(totals.cost)}</p>
        </div>
        <div data-testid="summary-profit" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-emerald-700 text-sm mb-1"><TrendingUp size={16} /> Tu ganancia mensual</div>
          <p className="font-heading text-2xl font-700 text-emerald-700">{eur(totals.profit)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {tariffs.map((t) => {
          const Icon = famIcon[t.family] || Tag;
          const m = metrics(t);
          return (
            <div key={t.id} data-testid={`tariff-card-${t.productId}`} className={`rounded-lg border bg-card p-5 card-hover ${t.active === false ? "border-border opacity-60" : "border-border"}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="grid place-items-center h-9 w-9 rounded-md bg-primary/10 text-primary"><Icon size={18} /></span>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{famLabel[t.family] || t.family}</span>
                  {t.active === false && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Inactiva</span>}
                </div>
              </div>
              <h4 className="font-heading font-600">{t.productName}</h4>
              <p className="mt-1 mb-3"><span className="font-heading text-2xl font-700">{m.saleWithIva.toFixed(2)}</span><span className="text-muted-foreground text-sm"> €/mes <span className="text-xs">con IVA</span></span></p>

              <div className="rounded-md bg-muted/40 border border-border p-3 text-xs space-y-1 mb-4" data-testid={`tariff-metrics-${t.productId}`}>
                <div className="flex justify-between"><span className="text-muted-foreground">Venta base (sin IVA)</span><span className="font-500">{eur(m.saleBase)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">IVA 21%</span><span className="font-500">{eur(m.saleIva)}</span></div>
                <div className="flex justify-between border-t border-border pt-1 mt-1"><span className="text-muted-foreground">Coste sin IVA (Tramo 1)</span><span className="font-500">{eur(m.costBase)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Coste con IVA</span><span className="font-500 text-orange-600">{eur(m.costWithIva)}</span></div>
                <div className="flex justify-between border-t border-border pt-1 mt-1"><span className="text-muted-foreground">Ganancia</span><span className={`font-700 ${m.profit >= 0 ? "text-emerald-600" : "text-destructive"}`}>{eur(m.profit)} <span className="font-500">({m.marginPct.toFixed(0)}%)</span></span></div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 rounded-full gap-1.5" data-testid={`edit-tariff-${t.productId}`} onClick={() => openEdit(t)}><Pencil size={13} /> Editar</Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="rounded-full text-destructive hover:bg-destructive/10" data-testid={`delete-tariff-${t.productId}`}><Trash2 size={14} /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eliminar tarifa</AlertDialogTitle>
                      <AlertDialogDescription>¿Seguro que quieres eliminar "{t.productName}"? Esta acción no se puede deshacer.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction data-testid={`confirm-delete-${t.productId}`} onClick={() => remove(t)} className="bg-destructive hover:bg-destructive/90">Eliminar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
