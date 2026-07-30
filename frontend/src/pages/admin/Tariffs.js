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
import { Tag, Plus, Pencil, Trash2, Signal, Wifi, Tv, TrendingUp, Wallet, Receipt, Star, Eye, EyeOff, Info, RefreshCw, Radio, Phone, Satellite, Package, Boxes, Users, Search, ArrowUpDown, Copy } from "lucide-react";
import { toast } from "sonner";

const IVA = 1.21;
const famIcon = { Mobile: Signal, Fiber: Wifi, Fixed: Wifi, Convergent: Package, M2M: Radio, PBX: Phone, TV: Tv, Satellite: Satellite, Energy: Boxes, Device: Radio, International: Signal, Bonos: Boxes, Paquetes: Package };
const famLabel = { Mobile: "Móvil", Fiber: "Fibra", Fixed: "Fijo", Convergent: "Paquetes", M2M: "M2M", PBX: "PBX / Centralita", TV: "TV", Satellite: "Satélite", Energy: "Energía", Device: "Dispositivos", International: "Internacional", Bonos: "Bonos", Paquetes: "Paquetes" };
const FAMILY_ORDER = ["Mobile", "Fiber", "Fixed", "Convergent", "M2M", "PBX", "TV", "Satellite", "Energy", "Device", "International", "Bonos", "Paquetes"];
const emptyForm = { productId: "", productName: "", family: "Mobile", type: "Main", saleWithIva: "", costBase: "", features: "", active: true, storefront: true };
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
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState("asc");
  const [onlyPublished, setOnlyPublished] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [info, setInfo] = useState(null);

  const load = () => api.get("/tariffs").then((r) => setTariffs(r.data));
  useEffect(() => { load(); }, []);

  const syncLikes = async () => {
    setSyncing(true);
    try { const { data } = await api.post("/likes/sync-catalog"); toast.success(`Sincronizado · ${data.created} nuevas (ocultas), ${data.updated} actualizadas`); load(); }
    catch (e) { toast.error(apiErr(e)); } finally { setSyncing(false); }
  };
  const dedupe = async () => {
    setDeduping(true);
    try { const { data } = await api.post("/tariffs/dedupe"); toast.success(data.removed ? `${data.removed} duplicados eliminados` : "No había duplicados"); load(); }
    catch (e) { toast.error(apiErr(e)); } finally { setDeduping(false); }
  };
  const deleteAll = async () => {
    try { const { data } = await api.delete("/tariffs"); toast.success(`Catálogo eliminado · ${data.deleted} tarifas`); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const bulkStorefront = async (publish) => {
    try { const { data } = await api.post("/tariffs/bulk-storefront", { storefront: publish, family: filter }); toast.success(`${data.updated} tarifas ${publish ? "publicadas" : "ocultadas"}`); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (t) => {
    setEditing(t);
    setForm({
      productId: t.productId, productName: t.productName, family: t.family, type: t.type || "Main",
      saleWithIva: (Number(t.price || 0)).toFixed(2),
      costBase: (Number(t.costPrice || 0)).toFixed(2),
      active: t.active !== false,
      storefront: t.storefront !== false,
      features: (t.marketingText || []).map((m) => (m.title && m.title !== "Incluye") ? `${m.title}: ${m.value}` : m.value).join("\n"),
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
      storefront: form.storefront,
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

  const toggleStorefront = async (t) => {
    const visible = t.storefront === false;
    try {
      await api.patch(`/tariffs/${t.productId}/storefront`, { visible });
      toast.success(visible ? "Tarifa visible en la tienda" : "Tarifa oculta de la tienda");
      load();
    } catch (e) { toast.error(apiErr(e)); }
  };

  const togglePopular = async (t) => {
    const makePopular = !t.popular;
    try {
      await api.put(`/tariffs/${t.productId}/popular`, { popular: makePopular });
      toast.success(makePopular ? `"${t.productName}" marcada como Más popular` : "Marca «Más popular» quitada");
      load();
    } catch (e) { toast.error(apiErr(e)); }
  };

  // Ingreso/coste/ganancia MENSUAL REAL = precio de cada tarifa × nº de líneas activas (clientes)
  const totals = tariffs.reduce((acc, t) => {
    const n = Number(t.customerCount) || 0;
    if (!n) return acc;
    const m = metrics(t);
    acc.sale += m.saleWithIva * n; acc.cost += m.costWithIva * n; acc.profit += m.profit * n;
    acc.lines += n;
    return acc;
  }, { sale: 0, cost: 0, profit: 0, lines: 0 });

  const q = search.trim().toLowerCase();
  let visible = filter === "all" ? tariffs : tariffs.filter((t) => t.family === filter);
  if (q) visible = visible.filter((t) => (t.productName || "").toLowerCase().includes(q));
  if (onlyPublished) visible = visible.filter((t) => t.storefront !== false);
  const dir = sortDir === "asc" ? 1 : -1;
  const sortByPrice = (a, b) => ((a.price || 0) - (b.price || 0)) * dir;
  const grouped = FAMILY_ORDER
    .map((fam) => ({
      fam,
      items: visible.filter((t) => t.family === fam).sort(sortByPrice),
    }))
    .filter((g) => g.items.length > 0);
  const otherItems = visible.filter((t) => !FAMILY_ORDER.includes(t.family)).sort(sortByPrice);
  if (otherItems.length) grouped.push({ fam: "Other", items: otherItems });
  const publishedCount = tariffs.filter((t) => t.storefront !== false).length;

  const renderCard = (t) => {
    const Icon = famIcon[t.family] || Tag;
    const m = metrics(t);
    return (
      <div key={t.id} data-testid={`tariff-card-${t.productId}`} className={`rounded-lg border bg-card p-5 card-hover ${t.active === false ? "border-border opacity-60" : "border-border"}`}>
        <div className="flex items-center justify-between mb-3">
          <span className="grid place-items-center h-9 w-9 rounded-md bg-primary/10 text-primary"><Icon size={18} /></span>
          <div className="flex items-center gap-2 text-xs">
            {(t.customerCount ?? 0) > 0 && <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 font-semibold flex items-center gap-1" data-testid={`tariff-customers-${t.productId}`}><Users size={11} /> {t.customerCount}</span>}
            {t.popular && <span className="rounded-full bg-orange-500/15 text-orange-600 px-2 py-0.5 font-semibold flex items-center gap-1"><Star size={11} className="fill-orange-500" /> Popular</span>}
            {t.type === "Optional" && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Bono</span>}
            {t.active === false && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Inactiva</span>}
            {t.storefront === false && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground flex items-center gap-1"><EyeOff size={11} /> Oculta</span>}
          </div>
        </div>
        <h4 className="font-heading font-600">{t.productName}</h4>
        <p className="mt-1 mb-3"><span className="font-heading text-2xl font-700">{m.saleWithIva.toFixed(2)}</span><span className="text-muted-foreground text-sm"> €/mes <span className="text-xs">con IVA</span></span></p>

        {/* Info del catálogo (así se ve en la tienda) */}
        {(t.marketingText || []).length > 0 && (
          <ul className="mb-3 space-y-1 text-xs text-muted-foreground" data-testid={`tariff-catalog-${t.productId}`}>
            {t.marketingText.slice(0, 4).map((mk, i) => (
              <li key={i} className="truncate">• {mk.title ? <b className="text-foreground font-500">{mk.title}: </b> : null}{mk.value}</li>
            ))}
          </ul>
        )}

        {/* Controles de tienda */}
        <div className="flex gap-2 mb-3">
          <button data-testid={`toggle-storefront-${t.productId}`} onClick={() => toggleStorefront(t)}
            className={`flex-1 rounded-lg border px-2.5 py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${t.storefront === false ? "border-border text-muted-foreground hover:bg-muted" : "border-primary/30 bg-primary/5 text-primary"}`}>
            {t.storefront === false ? <><EyeOff size={13} /> Oculta</> : <><Eye size={13} /> Visible</>}
          </button>
          <button data-testid={`toggle-popular-${t.productId}`} onClick={() => togglePopular(t)}
            className={`flex-1 rounded-lg border px-2.5 py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${t.popular ? "border-orange-500/40 bg-orange-500/10 text-orange-600" : "border-border text-muted-foreground hover:bg-muted"}`}>
            <Star size={13} className={t.popular ? "fill-orange-500" : ""} /> {t.popular ? "Más popular" : "Marcar popular"}
          </button>
        </div>

        <div className="rounded-md bg-muted/40 border border-border p-3 text-xs space-y-1 mb-4" data-testid={`tariff-metrics-${t.productId}`}>
          <div className="flex justify-between"><span className="text-muted-foreground">Venta base (sin IVA)</span><span className="font-500">{eur(m.saleBase)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">IVA 21%</span><span className="font-500">{eur(m.saleIva)}</span></div>
          <div className="flex justify-between border-t border-border pt-1 mt-1"><span className="text-muted-foreground">Coste sin IVA (Tramo 1)</span><span className="font-500">{eur(m.costBase)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Coste con IVA</span><span className="font-500 text-orange-600">{eur(m.costWithIva)}</span></div>
          <div className="flex justify-between border-t border-border pt-1 mt-1"><span className="text-muted-foreground">Ganancia</span><span className={`font-700 ${m.profit >= 0 ? "text-emerald-600" : "text-destructive"}`}>{eur(m.profit)} <span className="font-500">({m.marginPct.toFixed(0)}%)</span></span></div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 rounded-full gap-1.5" data-testid={`edit-tariff-${t.productId}`} onClick={() => openEdit(t)}><Pencil size={13} /> Editar</Button>
          <Button variant="outline" size="sm" className="rounded-full" title="Condiciones del contrato" data-testid={`info-tariff-${t.productId}`} onClick={() => setInfo(t)}><Info size={14} /></Button>
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
  };

  return (
    <div data-testid="tariffs-page">
      <PageHeader
        overline="Catálogo" title="Tarifas y rentabilidad"
        subtitle="Introduce el precio de venta CON IVA (lo que paga el cliente) y el coste de cesión de Likes SIN IVA (Tramo 1). Verás la base sin IVA, el IVA 21%, el coste con IVA y tu ganancia."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button data-testid="sync-catalog-btn" variant="outline" className="rounded-full gap-2" onClick={syncLikes} disabled={syncing}>
              <RefreshCw size={15} className={syncing ? "animate-spin" : ""} /> {syncing ? "Sincronizando…" : "Sincronizar Likes"}
            </Button>
            <Button data-testid="dedupe-btn" variant="outline" className="rounded-full gap-2" onClick={dedupe} disabled={deduping} title="Eliminar tarifas duplicadas (conserva las editadas/publicadas)">
              <Copy size={15} /> {deduping ? "Limpiando…" : "Quitar duplicados"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button data-testid="delete-all-btn" variant="outline" className="rounded-full gap-2 text-destructive border-destructive/30"><Trash2 size={15} /> Vaciar catálogo</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminar TODO el catálogo</AlertDialogTitle>
                  <AlertDialogDescription>Se eliminarán todas las tarifas (también las visibles en la tienda). Podrás volver a sincronizarlas desde Likes sin duplicados. Esta acción no se puede deshacer.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction data-testid="confirm-delete-all" onClick={deleteAll} className="bg-destructive hover:bg-destructive/90">Eliminar todo</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button data-testid="new-tariff-btn" className="rounded-full gap-2" onClick={openNew}><Plus size={16} /> Nueva tarifa</Button>
              </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar tarifa" : "Nueva tarifa"}</DialogTitle>
                <DialogDescription>Define nombre, familia, precios y características de la tarifa.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2"><Label>Nombre</Label><Input data-testid="tariff-name" value={form.productName} onChange={(e) => set("productName", e.target.value)} placeholder="Móvil 25GB" /></div>
                <div className="space-y-1.5">
                  <Label>Familia / servicio</Label>
                  <Select value={form.family} onValueChange={(v) => set("family", v)}>
                    <SelectTrigger data-testid="tariff-family"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FAMILY_ORDER.map((f) => <SelectItem key={f} value={f}>{famLabel[f]}</SelectItem>)}
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
                  <span className="text-sm">Activa (disponible internamente)</span>
                  <Switch data-testid="tariff-active" checked={form.active} onCheckedChange={(v) => set("active", v)} />
                </div>
                <div className="space-y-1.5 col-span-2 flex items-center justify-between rounded-md border border-border p-2.5">
                  <div><span className="text-sm">Mostrar en la tienda pública</span><p className="text-xs text-muted-foreground">Si lo desactivas, no aparece en rokymovil.com</p></div>
                  <Switch data-testid="tariff-storefront" checked={form.storefront} onCheckedChange={(v) => set("storefront", v)} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Información del catálogo (así se ve en la tienda)</Label>
                  <p className="text-xs text-muted-foreground">Una característica por línea, en formato <b>Título: Valor</b>. Si no pones «:», se muestra como texto simple.</p>
                  <Textarea data-testid="tariff-features" rows={4} value={form.features} onChange={(e) => set("features", e.target.value)} placeholder={"Datos: 25 GB\nLlamadas: Ilimitadas\nRed: 5G incluido\nPermanencia: 12 meses"} />
                </div>
              </div>
              <DialogFooter>
                <Button data-testid="save-tariff-btn" onClick={submit} disabled={saving} className="rounded-full">{saving ? "Guardando…" : (editing ? "Guardar cambios" : "Crear tarifa")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        }
      />

      {/* Resumen de rentabilidad — MENSUAL RECURRENTE según líneas activas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-2">
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
      <p className="text-xs text-muted-foreground mb-6">Cálculo mensual recurrente sobre <b>{totals.lines}</b> línea(s) activa(s) (precio × clientes de cada tarifa), no sobre el catálogo completo.</p>

      {/* Búsqueda, orden y filtro de publicadas */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input data-testid="tariff-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tarifa por nombre…" className="pl-9 rounded-full" />
        </div>
        <button data-testid="tariff-sort" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          className="rounded-full px-4 py-2 text-sm font-medium border border-border hover:border-primary/40 flex items-center gap-1.5">
          <ArrowUpDown size={14} /> Precio {sortDir === "asc" ? "menor→mayor" : "mayor→menor"}
        </button>
        <button data-testid="filter-published" onClick={() => setOnlyPublished((v) => !v)}
          className={`rounded-full px-4 py-2 text-sm font-medium border flex items-center gap-1.5 transition-colors ${onlyPublished ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
          <Eye size={14} /> Publicadas ({publishedCount})
        </button>
        <button data-testid="hide-all-btn" onClick={() => bulkStorefront(false)} title="Ocultar de la tienda las tarifas mostradas (según el filtro de familia activo)"
          className="rounded-full px-4 py-2 text-sm font-medium border border-border hover:border-red-400 hover:text-red-500 flex items-center gap-1.5">
          <EyeOff size={14} /> Ocultar todas
        </button>
      </div>

      {/* Filtro por tipo de servicio */}
      <div className="flex flex-wrap gap-2 mb-6" data-testid="tariff-filters">
        <button onClick={() => setFilter("all")} data-testid="filter-all"
          className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${filter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
          Todas ({tariffs.length})
        </button>
        {FAMILY_ORDER.filter((f) => tariffs.some((t) => t.family === f)).map((f) => {
          const n = tariffs.filter((t) => t.family === f).length;
          return (
            <button key={f} onClick={() => setFilter(f)} data-testid={`filter-${f}`}
              className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${filter === f ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
              {famLabel[f]} ({n})
            </button>
          );
        })}
      </div>

      <div className="space-y-8">
        {grouped.map((g) => {
          const Icon = famIcon[g.fam] || Tag;
          return (
            <section key={g.fam} data-testid={`family-section-${g.fam}`}>
              <div className="flex items-center gap-2.5 mb-4">
                <span className="grid place-items-center h-8 w-8 rounded-lg bg-primary/10 text-primary"><Icon size={17} /></span>
                <h2 className="font-heading text-lg font-700">{famLabel[g.fam] || "Otros"}</h2>
                <span className="text-sm text-muted-foreground">· {g.items.length} tarifa{g.items.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {g.items.map(renderCard)}
              </div>
            </section>
          );
        })}
        {tariffs.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
            <Tag size={26} className="mx-auto mb-2 opacity-40" />No hay tarifas todavía. Crea la primera con «Nueva tarifa».
          </div>
        )}
      </div>

      {/* Condiciones del contrato / catálogo (botón i) */}
      <Dialog open={!!info} onOpenChange={(o) => !o && setInfo(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" data-testid="tariff-info-dialog">
          <DialogHeader>
            <DialogTitle>{info?.productName}</DialogTitle>
            <DialogDescription>Condiciones del catálogo tal como se muestran al cliente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Servicio</span><span className="font-medium">{famLabel[info?.family] || info?.family}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Precio (con IVA)</span><span className="font-medium">{eur((info?.price) || 0)}/mes</span></div>
            <div className="border-t border-border my-2" />
            {(info?.marketingText || []).length === 0 && <p className="text-sm text-muted-foreground">Esta tarifa no tiene condiciones definidas. Edítala para añadirlas.</p>}
            <ul className="space-y-2">
              {(info?.marketingText || []).map((mk, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <span>{mk.title ? <b>{mk.title}: </b> : null}{mk.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
