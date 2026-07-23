import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StatusPill } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Signal, Wifi, Euro, ReceiptText, ArrowRight, Repeat } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

export default function ClientDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [products, setProducts] = useState([]);
  const [changing, setChanging] = useState(null); // subscription obj
  const [newProduct, setNewProduct] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/me/summary").then((r) => setData(r.data));
  useEffect(() => {
    load();
    api.get("/products").then((r) => setProducts(r.data.filter((p) => p.type === "Main")));
  }, []);

  if (!data) return <div className="text-muted-foreground">Cargando…</div>;

  const openChange = (sub) => { setChanging(sub); setNewProduct(""); };
  const confirmChange = async () => {
    if (!newProduct) return;
    setSaving(true);
    try {
      const { data: res } = await api.post("/subscriptions/change-tariff", { subscriptionId: changing.subscriptionId, newProductId: newProduct });
      toast.success(`Tarifa cambiada a ${res.productName}`);
      setChanging(null);
      load();
    } catch (e) { toast.error(apiErr(e)); } finally { setSaving(false); }
  };

  const family = changing?.products?.[0]?.family;
  const options = products.filter((p) => p.family === family);

  return (
    <div data-testid="client-dashboard">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-xl overflow-hidden border border-border bg-card mb-6">
        <div className="grid md:grid-cols-3">
          <div className="p-8 md:col-span-2">
            <p className="overline text-primary mb-2">Área de clientes</p>
            <h1 className="font-heading text-3xl font-700 tracking-tight">Hola, {user?.name} 👋</h1>
            <p className="text-muted-foreground mt-1.5">Gestiona tus líneas, consumo y facturas.</p>
            <div className="flex gap-6 mt-6">
              <div>
                <p className="overline text-muted-foreground">Cuota mensual</p>
                <p className="font-heading text-2xl font-700">{data.monthlyTotal.toFixed(2)} €</p>
              </div>
              <div>
                <p className="overline text-muted-foreground">Líneas</p>
                <p className="font-heading text-2xl font-700">{data.lines.length}</p>
              </div>
              <div>
                <p className="overline text-muted-foreground">Fac. pendientes</p>
                <p className="font-heading text-2xl font-700">{data.pendingInvoices}</p>
              </div>
            </div>
          </div>
          <div className="hidden md:block relative">
            <img src="https://images.pexels.com/photos/11749490/pexels-photo-11749490.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
              alt="Cliente" className="absolute inset-0 h-full w-full object-cover" />
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {data.lines.map((l, i) => {
          const sub = data.subscriptions.find((s) => s.products?.[0]?.lineNumber === l.lineNumber);
          const isMobile = l.family === "Mobile";
          const pct = l.totalGB ? Math.min(100, Math.round((l.usedGB / l.totalGB) * 100)) : 0;
          return (
            <motion.div key={l.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              data-testid={`client-line-${l.lineNumber}`} className="rounded-lg border border-border bg-card p-6 card-hover">
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center gap-2 font-semibold">
                  {isMobile ? <Signal size={18} className="text-primary" /> : <Wifi size={18} className="text-primary" />}
                  {l.lineNumber}
                </span>
                <StatusPill status={l.status} />
              </div>
              <p className="text-sm text-muted-foreground">{l.productName}</p>
              <p className="font-heading text-xl font-700 mt-1">{l.price?.toFixed(2)} €/mes</p>

              {isMobile && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{l.usedGB} GB usados</span><span>{l.totalGB} GB</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div className="h-full bg-primary rounded-full" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-5">
                <Link to={`/portal/lines/${l.lineNumber}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full rounded-full gap-1.5" data-testid={`view-line-${l.lineNumber}`}>Detalle <ArrowRight size={14} /></Button>
                </Link>
                {sub && (
                  <Button size="sm" className="rounded-full gap-1.5" data-testid={`change-pack-${l.lineNumber}`} onClick={() => openChange(sub)}>
                    <Repeat size={14} /> Cambiar pack
                  </Button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <Dialog open={!!changing} onOpenChange={(o) => !o && setChanging(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cambiar tarifa</DialogTitle></DialogHeader>
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
