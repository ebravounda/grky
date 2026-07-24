import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Package, Truck, CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";

const STATUS = {
  PENDING: { c: "bg-warning/15 text-warning", t: "Pendiente", icon: Package },
  SHIPPED: { c: "bg-primary/12 text-primary", t: "Enviado", icon: Truck },
  DELIVERED: { c: "bg-success/12 text-success", t: "Entregado", icon: CheckCircle2 },
};

export default function Shipments() {
  const [ships, setShips] = useState([]);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({ status: "PENDING", carrier: "", tracking: "" });
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/shipments").then((r) => setShips(r.data));
  useEffect(() => { load(); }, []);

  const openEdit = (s) => { setForm({ status: s.status, carrier: s.carrier || "", tracking: s.tracking || "" }); setEdit(s); };

  const save = async () => {
    setBusy(true);
    try { await api.put(`/shipments/${edit.shipmentId}`, form); toast.success("Envío actualizado"); setEdit(null); load(); }
    catch (e) { toast.error(apiErr(e)); } finally { setBusy(false); }
  };

  return (
    <div data-testid="shipments-page">
      <PageHeader overline="Logística" title="Envíos de SIM"
        subtitle="Coordina el envío de las tarjetas SIM físicas de las altas móviles." />

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Línea</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Dirección</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Seguimiento</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ships.map((s) => {
              const st = STATUS[s.status] || STATUS.PENDING;
              return (
                <tr key={s.shipmentId} data-testid={`shipment-row-${s.shipmentId}`}>
                  <td className="px-4 py-3 font-medium">{s.customerName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.lineNumber}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{s.address || "—"}</td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">{s.tracking ? `${s.carrier || ""} ${s.tracking}` : "—"}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.c}`}><st.icon size={12} /> {st.t}</span></td>
                  <td className="px-4 py-3 text-right">
                    <Button data-testid={`edit-shipment-${s.shipmentId}`} size="sm" variant="outline" className="h-8 rounded-full" onClick={() => openEdit(s)}>Gestionar</Button>
                  </td>
                </tr>
              );
            })}
            {ships.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground"><Package size={26} className="mx-auto mb-2 opacity-40" />No hay envíos de SIM pendientes.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent data-testid="shipment-dialog">
          <DialogHeader><DialogTitle>Gestionar envío · {edit?.customerName}</DialogTitle>
            <DialogDescription>Actualiza el estado y añade el número de seguimiento. Al marcar «Enviado» se avisa al cliente por email.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger data-testid="shipment-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pendiente</SelectItem>
                  <SelectItem value="SHIPPED">Enviado</SelectItem>
                  <SelectItem value="DELIVERED">Entregado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Transportista</Label><Input data-testid="shipment-carrier" value={form.carrier} onChange={(e) => setForm((f) => ({ ...f, carrier: e.target.value }))} placeholder="Correos, SEUR, GLS…" /></div>
            <div className="space-y-1.5"><Label>Nº de seguimiento</Label><Input data-testid="shipment-tracking" value={form.tracking} onChange={(e) => setForm((f) => ({ ...f, tracking: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button data-testid="save-shipment-btn" className="rounded-full gap-2" onClick={save} disabled={busy}><Send size={15} /> {busy ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
