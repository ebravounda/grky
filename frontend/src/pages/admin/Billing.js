import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { CreditCard, Landmark, RefreshCw, PlayCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const STATUS = {
  active: { c: "bg-success/12 text-success", t: "Al corriente" },
  past_due: { c: "bg-destructive/12 text-destructive", t: "Impago" },
};

export default function Billing() {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = () => { setLoading(true); api.get("/billing/subscriptions").then((r) => setSubs(r.data)).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const runCycle = async () => {
    try { await api.post("/billing/run-cycle"); toast.success("Ciclo de facturación ejecutado (recordatorios + salud)"); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const simulate = async (id, outcome) => {
    setBusy(id + outcome);
    try {
      await api.post(`/billing/simulate/${id}`, { outcome });
      toast.success(outcome === "success" ? "Cobro correcto simulado" : "Cobro fallido simulado");
      load();
    } catch (e) { toast.error(apiErr(e)); } finally { setBusy(null); }
  };

  return (
    <div data-testid="billing-page">
      <PageHeader overline="Finanzas" title="Cobros recurrentes"
        subtitle="Domiciliaciones SEPA y tarjetas con cobro mensual automático (Stripe)."
        action={
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full gap-2" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Actualizar</Button>
            <Button data-testid="run-cycle-btn" className="rounded-full gap-2" onClick={runCycle}><PlayCircle size={15} /> Ejecutar ciclo</Button>
          </div>
        }
      />

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Producto</th>
              <th className="px-4 py-3 font-medium">Método</th>
              <th className="px-4 py-3 font-medium">Cuota</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Próx. cobro</th>
              <th className="px-4 py-3 font-medium text-right">Simular</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {subs.map((s) => {
              const st = STATUS[s.status] || STATUS.active;
              return (
                <tr key={s.subscriptionId} data-testid={`billing-row-${s.fiscalId}`}>
                  <td className="px-4 py-3"><div className="font-medium">{s.customerName}</div><div className="text-xs text-muted-foreground">{s.fiscalId}</div></td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{s.productName}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      {s.method === "card" ? <CreditCard size={14} /> : <Landmark size={14} />}
                      {s.method === "card" ? "Tarjeta" : "SEPA"} ····{s.last4 || "----"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold">{s.amount?.toFixed(2)} €</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.c}`}>{st.t}</span>
                    {s.failedAttempts > 0 && <span className="ml-1 text-xs text-destructive">({s.failedAttempts} fallos)</span>}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">{s.nextChargeDate ? new Date(s.nextChargeDate).toLocaleDateString("es-ES") : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button data-testid={`sim-fail-${s.fiscalId}`} size="sm" variant="outline" className="h-8 rounded-full gap-1 text-destructive border-destructive/30" disabled={busy} onClick={() => simulate(s.subscriptionId, "failed")}><AlertTriangle size={13} /> Fallo</Button>
                      <Button data-testid={`sim-ok-${s.fiscalId}`} size="sm" variant="outline" className="h-8 rounded-full gap-1 text-success border-success/30" disabled={busy} onClick={() => simulate(s.subscriptionId, "success")}><CheckCircle2 size={13} /> Pago</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {subs.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Aún no hay cobros recurrentes activos. Se activan cuando el cliente completa el pago en el alta.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Los botones «Simular» permiten probar el flujo de reintentos, avisos y suspensión sin esperar al cobro real de SEPA (que tarda días en liquidar).
      </p>
    </div>
  );
}
