import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowRightLeft, XCircle } from "lucide-react";
import { toast } from "sonner";

const STATUS = {
  IN_PROGRESS: { c: "bg-primary/12 text-primary", t: "En curso" },
  COMPLETED: { c: "bg-success/12 text-success", t: "Completada" },
  CANCELLED: { c: "bg-destructive/12 text-destructive", t: "Cancelada" },
};
const DONORS = { "001": "MOVISTAR", "003": "VODAFONE", "004": "ORANGE", "005": "YOIGO" };

export default function Portabilities() {
  const [items, setItems] = useState([]);
  const [cancelling, setCancelling] = useState(null);
  const [reason, setReason] = useState("");

  const load = () => api.get("/portabilities").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const cancel = async (p) => {
    try {
      await api.post(`/portabilities/${p.portabilityId}/cancel`, { reason: reason || "Cancelada por el cliente" });
      toast.success("Portabilidad cancelada");
      setCancelling(null); setReason(""); load();
    } catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div data-testid="portabilities-page">
      <PageHeader overline="Provisión" title="Portabilidades" subtitle="Portabilidades entrantes y salientes. Cancela las entrantes en curso." />
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Línea</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Tipo</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Operador donante</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((p) => {
              const s = STATUS[p.status] || { c: "bg-muted", t: p.status };
              return (
                <tr key={p.id} data-testid={`portability-row-${p.portabilityId}`}>
                  <td className="px-4 py-3 font-medium">{p.portabilityId}</td>
                  <td className="px-4 py-3">{p.lineNumber}</td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{p.type === "IN" ? "Entrante" : "Saliente"}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{DONORS[p.donorOperatorId] || p.donorOperatorId || "—"}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.c}`}>{s.t}</span></td>
                  <td className="px-4 py-3 text-right">
                    {p.type === "IN" && p.status === "IN_PROGRESS" && (
                      <Button data-testid={`cancel-port-${p.portabilityId}`} variant="outline" size="sm" className="rounded-full text-destructive hover:bg-destructive/10 gap-1.5" onClick={() => setCancelling(p)}>
                        <XCircle size={14} /> Cancelar
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Sin portabilidades.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar portabilidad entrante</DialogTitle>
            <DialogDescription>Indica el motivo de la cancelación de la portabilidad.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5"><Label>Motivo</Label><Input data-testid="port-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo" /></div>
          <DialogFooter><Button data-testid="confirm-cancel-port-btn" onClick={() => cancel(cancelling)} className="rounded-full bg-destructive hover:bg-destructive/90">Cancelar portabilidad</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
