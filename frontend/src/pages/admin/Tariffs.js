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
import { Tag, Plus, Pencil, Trash2, Signal, Wifi, Tv } from "lucide-react";
import { toast } from "sonner";

const famIcon = { Mobile: Signal, Fiber: Wifi, TV: Tv };
const famLabel = { Mobile: "Móvil", Fiber: "Fibra", TV: "TV" };
const emptyForm = { productId: "", productName: "", family: "Mobile", type: "Main", price: "", features: "", active: true };

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
      price: String(t.price), active: t.active !== false,
      features: (t.marketingText || []).map((m) => m.value).join("\n"),
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.productName || !form.price) return toast.error("Nombre y precio son obligatorios");
    setSaving(true);
    const payload = {
      productId: form.productId || undefined, productName: form.productName, family: form.family,
      type: form.type, price: parseFloat(form.price), active: form.active,
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

  return (
    <div data-testid="tariffs-page">
      <PageHeader
        overline="Catálogo" title="Tarifas" subtitle="Crea y edita las tarifas de tu CRM. Se usan en contratación y cambios de pack."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="new-tariff-btn" className="rounded-full gap-2" onClick={openNew}><Plus size={16} /> Nueva tarifa</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar tarifa" : "Nueva tarifa"}</DialogTitle>
                <DialogDescription>Define nombre, familia, precio y características de la tarifa.</DialogDescription>
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
                <div className="space-y-1.5"><Label>Precio (€/mes)</Label><Input data-testid="tariff-price" type="number" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} /></div>
                <div className="space-y-1.5 flex items-end">
                  <div className="flex items-center justify-between w-full rounded-md border border-border p-2.5">
                    <span className="text-sm">Activa</span>
                    <Switch data-testid="tariff-active" checked={form.active} onCheckedChange={(v) => set("active", v)} />
                  </div>
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Características (una por línea)</Label>
                  <Textarea data-testid="tariff-features" rows={4} value={form.features} onChange={(e) => set("features", e.target.value)} placeholder={"25 GB de datos\nLlamadas ilimitadas\n5G incluido"} />
                </div>
              </div>
              <DialogFooter>
                <Button data-testid="save-tariff-btn" onClick={submit} disabled={saving} className="rounded-full">{saving ? "Guardando…" : (editing ? "Guardar cambios" : "Crear tarifa")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {tariffs.map((t) => {
          const Icon = famIcon[t.family] || Tag;
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
              <p className="mt-1 mb-3"><span className="font-heading text-2xl font-700">{t.price.toFixed(2)}</span><span className="text-muted-foreground text-sm"> €/mes</span></p>
              <ul className="space-y-1 mb-4 min-h-[40px]">
                {(t.marketingText || []).slice(0, 3).map((m, i) => <li key={i} className="text-xs text-muted-foreground">• {m.value}</li>)}
              </ul>
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
