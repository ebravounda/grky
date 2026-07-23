import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiErr, openInvoicePdf } from "@/lib/api";
import { PageHeader, StatusPill } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ShoppingCart, FileText } from "lucide-react";
import { toast } from "sonner";

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [donors, setDonors] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ fiscalId: "", productId: "", portability: false, donorOperatorId: "" });

  const loadOrders = () => api.get("/orders").then((r) => setOrders(r.data));
  useEffect(() => {
    loadOrders();
    api.get("/customers").then((r) => setCustomers(r.data));
    api.get("/products").then((r) => setProducts(r.data.filter((p) => p.type === "Main")));
    api.get("/donor-operators").then((r) => setDonors(r.data));
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.fiscalId || !form.productId) return toast.error("Selecciona cliente y producto");
    setSaving(true);
    try {
      const { data } = await api.post("/orders", form);
      toast.success(`Servicio creado · Factura ${data.invoiceNumber} generada`, {
        action: { label: "Ver factura", onClick: () => openInvoicePdf(data.invoiceId) },
      });
      setOpen(false);
      setForm({ fiscalId: "", productId: "", portability: false, donorOperatorId: "" });
      loadOrders();
    } catch (e) { toast.error(apiErr(e)); } finally { setSaving(false); }
  };

  return (
    <div data-testid="orders-page">
      <PageHeader
        overline="Venta" title="Contratación" subtitle="Da de alta servicios. Cada alta genera una factura PDF automáticamente."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="new-order-btn" className="rounded-full gap-2"><ShoppingCart size={16} /> Nueva contratación</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Crear servicio / orden</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Cliente</Label>
                  <Select value={form.fiscalId} onValueChange={(v) => set("fiscalId", v)}>
                    <SelectTrigger data-testid="order-customer"><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => <SelectItem key={c.fiscalId} value={c.fiscalId}>{c.name} {c.firstSurname} — {c.fiscalId}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Producto / tarifa</Label>
                  <Select value={form.productId} onValueChange={(v) => set("productId", v)}>
                    <SelectTrigger data-testid="order-product"><SelectValue placeholder="Selecciona producto" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => <SelectItem key={p.productId} value={p.productId}>{p.productName} — {p.price.toFixed(2)} €</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <div><p className="text-sm font-medium">Portabilidad</p><p className="text-xs text-muted-foreground">El cliente trae su número</p></div>
                  <Switch data-testid="order-portability" checked={form.portability} onCheckedChange={(v) => set("portability", v)} />
                </div>
                {form.portability && (
                  <div className="space-y-1.5">
                    <Label>Operador donante</Label>
                    <Select value={form.donorOperatorId} onValueChange={(v) => set("donorOperatorId", v)}>
                      <SelectTrigger data-testid="order-donor"><SelectValue placeholder="Operador de origen" /></SelectTrigger>
                      <SelectContent>
                        {donors.map((d) => <SelectItem key={d.Code} value={d.Code}>{d.Name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button data-testid="submit-order-btn" onClick={submit} disabled={saving} className="rounded-full">{saving ? "Creando…" : "Crear y facturar"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Cliente</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Línea</th>
              <th className="px-4 py-3 font-medium">Importe</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Factura</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.map((o) => (
              <tr key={o.id} data-testid={`order-row-${o.orderId}`}>
                <td className="px-4 py-3 font-medium">{o.productName}</td>
                <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{o.customerName}</td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{o.lineNumber}</td>
                <td className="px-4 py-3 font-semibold">{o.price?.toFixed(2)} €</td>
                <td className="px-4 py-3"><StatusPill status={o.status} /></td>
                <td className="px-4 py-3">
                  <button data-testid={`order-pdf-${o.orderId}`} onClick={() => openInvoicePdf(o.invoiceId)} className="inline-flex items-center gap-1 text-primary hover:underline">
                    <FileText size={14} /> {o.invoiceNumber}
                  </button>
                </td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Aún no hay contrataciones.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
