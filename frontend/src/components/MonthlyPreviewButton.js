import { useState } from "react";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ClipboardCheck, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const RES = {
  will_charge: { t: "Se cobrará", c: "bg-blue-100 text-blue-700" },
  no_method: { t: "Sin método de pago", c: "bg-red-100 text-red-700" },
  processing: { t: "SEPA en proceso (no se recobra)", c: "bg-amber-100 text-amber-700" },
  refunded: { t: "Reembolsada (no se recobra)", c: "bg-purple-100 text-purple-700" },
  paid: { t: "Ya pagada", c: "bg-emerald-100 text-emerald-700" },
  zero: { t: "Importe 0 €", c: "bg-muted text-muted-foreground" },
  stripe_subscription: { t: "Suscripción Stripe (cobra Stripe)", c: "bg-muted text-muted-foreground" },
};

export const MonthlyPreviewButton = () => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("all");

  const run = async () => {
    setOpen(true); setData(null); setFilter("all");
    try { const { data: d } = await api.get("/billing/monthly-preview"); setData(d); }
    catch (e) { toast.error(apiErr(e)); setOpen(false); }
  };
  const rows = data ? data.rows.filter((r) => filter === "all" || r.result === filter) : [];

  return (
    <>
      <Button data-testid="monthly-preview-btn" variant="outline" className="rounded-full gap-2 text-[#015EEF] border-[#015EEF]/40" onClick={run}>
        <ClipboardCheck size={15} /> Vista previa del cobro
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto" data-testid="monthly-preview-dialog">
          <DialogHeader>
            <DialogTitle>Vista previa del cobro mensual{data ? ` · ${data.period}` : ""}</DialogTitle>
            <DialogDescription>{data ? `Cobro previsto el ${new Date(data.billingDate).toLocaleDateString("es-ES")}. ` : ""}No se cobra nada: solo muestra qué pasará con cada cliente.</DialogDescription>
          </DialogHeader>
          {!data && <p className="py-10 text-center text-muted-foreground flex items-center justify-center gap-2"><Search size={16} className="animate-pulse" /> Revisando clientes y métodos de pago…</p>}
          {data && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setFilter("all")} data-testid="preview-filter-all" className={`rounded-full border px-3 py-1 text-xs ${filter === "all" ? "bg-foreground text-background" : ""}`}>Todos · {data.rows.length}</button>
                {Object.entries(RES).map(([k, v]) => data.summary[k] && (
                  <button key={k} onClick={() => setFilter(k)} data-testid={`preview-filter-${k}`} className={`rounded-full px-3 py-1 text-xs font-medium ${v.c} ${filter === k ? "ring-2 ring-offset-1 ring-foreground/40" : ""}`}>
                    {v.t} · {data.summary[k].count} · {data.summary[k].total.toFixed(2)} €
                  </button>
                ))}
              </div>
              {data.warnings.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex gap-2" data-testid="preview-warnings">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>{data.warnings.length} cliente(s) tienen más de una factura del mismo mes: {data.warnings.map((w) => w.customerName || w.fiscalId).join(", ")}. Usa «Limpiar facturas duplicadas» antes del cobro.</span>
                </div>
              )}
              <div className="rounded-lg border divide-y text-sm">
                {rows.map((r) => (
                  <div key={r.fiscalId} className="flex flex-wrap items-center gap-3 px-4 py-2" data-testid={`preview-row-${r.fiscalId}`}>
                    <span className="font-medium">{r.customerName || r.fiscalId}</span>
                    <span className="text-xs text-muted-foreground">{r.fiscalId}</span>
                    <span className="text-xs text-muted-foreground">{r.invoiceNumber || "—"}</span>
                    <span className="ml-auto font-semibold">{r.total.toFixed(2)} €</span>
                    <span className="text-xs uppercase text-muted-foreground w-12">{r.method === "sepa" ? "SEPA" : r.method === "card" ? "Tarjeta" : ""}</span>
                    <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${RES[r.result]?.c || "bg-muted"}`}>{RES[r.result]?.t || r.result}</span>
                  </div>
                ))}
                {rows.length === 0 && <p className="px-4 py-6 text-center text-muted-foreground">Sin clientes en este filtro.</p>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
