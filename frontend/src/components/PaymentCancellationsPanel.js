import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { RefreshCw, Undo2 } from "lucide-react";

export const CANCEL_TONE = {
  succeeded: "bg-emerald-100 text-emerald-700",
  cancelled_pi: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  requires_action: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  canceled: "bg-red-100 text-red-700",
};

export const PaymentCancellationsPanel = ({ refreshKey }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = () => { setLoading(true); api.get("/billing/payment-cancellations").then((r) => setData(r.data)).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(load, [refreshKey]);

  if (!data || data.items.length === 0) return null;
  return (
    <div className="mt-8" data-testid="payment-cancellations-section">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="font-heading font-600 text-lg flex items-center gap-2"><Undo2 size={18} /> Cobros cancelados y devoluciones</h3>
        <div className="flex items-center gap-3 text-sm">
          <span data-testid="cancellations-total">Total: <b>{data.totalCancelled.toFixed(2)} €</b></span>
          <Button size="sm" variant="outline" className="rounded-full gap-1.5" onClick={load} disabled={loading} data-testid="cancellations-refresh-btn">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Actualizar estado
          </Button>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Cobro</th>
              <th className="px-4 py-3 font-medium">Importe</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.items.map((d) => (
              <tr key={d.piId} data-testid={`cancellation-row-${d.piId}`}>
                <td className="px-4 py-3 text-xs">{new Date(d.at).toLocaleString("es-ES")}<div className="text-muted-foreground">{d.by}</div></td>
                <td className="px-4 py-3"><span className="font-medium">{d.customerName}</span><div className="text-xs text-muted-foreground">{d.fiscalId}</div></td>
                <td className="px-4 py-3 text-xs"><span className="font-mono">{d.piId}</span><div className="text-muted-foreground truncate max-w-[260px]">{d.description}</div></td>
                <td className="px-4 py-3 font-semibold">{d.amount.toFixed(2)} €</td>
                <td className="px-4 py-3">
                  <span data-testid={`cancellation-status-${d.piId}`} className={`text-[11px] font-bold uppercase rounded-full px-2 py-0.5 ${CANCEL_TONE[d.status] || "bg-muted"}`}>{d.statusLabel}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-2">Las devoluciones SEPA de cobros aún en proceso quedan «pendientes» y Stripe las ejecuta cuando el adeudo se liquida.</p>
    </div>
  );
};
