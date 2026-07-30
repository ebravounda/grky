import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { CreditCard, Landmark, RefreshCw, PlayCircle, AlertTriangle, CheckCircle2, CalendarClock, RotateCcw, Users, Send } from "lucide-react";
import { toast } from "sonner";

const DOT = {
  card: { c: "bg-success", t: "Tarjeta activa" },
  sepa: { c: "bg-blue-500", t: "SEPA domiciliado" },
  pending: { c: "bg-amber-500", t: "Enlace pendiente" },
  none: { c: "bg-destructive", t: "Sin método" },
};

const STATUS = {
  active: { c: "bg-success/12 text-success", t: "Al corriente" },
  past_due: { c: "bg-destructive/12 text-destructive", t: "Impago" },
};

export default function Billing() {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [pstatus, setPstatus] = useState(null);

  const load = () => { setLoading(true); api.get("/billing/subscriptions").then((r) => setSubs(r.data)).finally(() => setLoading(false)); };
  const loadStatus = () => api.get("/billing/payment-status").then((r) => setPstatus(r.data)).catch(() => {});
  useEffect(() => { load(); loadStatus(); }, []);

  const sendLink = async (fiscalId) => {
    setBusy("link" + fiscalId);
    try {
      const { data } = await api.post(`/customers/${fiscalId}/send-card-link`, { origin_url: window.location.origin, sendEmail: true });
      if (data.emailed) toast.success(`Enlace de tarjeta enviado a ${data.email}`);
      else { toast.success("Enlace generado (abriendo)"); if (data.checkout_url) window.open(data.checkout_url, "_blank"); }
      loadStatus();
    } catch (e) { toast.error(apiErr(e)); } finally { setBusy(null); }
  };

  const runCycle = async () => {
    try { await api.post("/billing/run-cycle"); toast.success("Ciclo de facturación ejecutado (recordatorios + salud)"); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const runMonthly = async () => {
    setBusy("monthly");
    try {
      const { data } = await api.post("/billing/run-monthly");
      toast.success(`Facturación ${data.period}: ${data.invoiced} facturas · ${data.charged} cobradas · ${data.failed} fallidas`);
      load();
    } catch (e) { toast.error(apiErr(e)); } finally { setBusy(null); }
  };

  const retryCharges = async () => {
    setBusy("retry");
    try {
      const { data } = await api.post("/billing/retry-charges");
      toast.success(`Reintentos: ${data.retried} · ${data.charged} cobrados · ${data.gaveup} agotados`);
      load();
    } catch (e) { toast.error(apiErr(e)); } finally { setBusy(null); }
  };

  const syncStripe = async () => {
    setBusy("sync");
    try {
      const { data } = await api.post("/billing/sync-stripe-customers");
      toast.success(`Stripe: ${data.created} creados · ${data.linked} enlazados · ${data.updated} actualizados${data.errors ? ` · ${data.errors} errores` : ""}`);
      loadStatus();
    } catch (e) { toast.error(apiErr(e)); } finally { setBusy(null); }
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
          <div className="flex flex-wrap gap-2">
            <Button data-testid="sync-stripe-btn" variant="outline" className="rounded-full gap-2" onClick={syncStripe} disabled={busy === "sync"}><Users size={15} className={busy === "sync" ? "animate-pulse" : ""} /> {busy === "sync" ? "Sincronizando…" : "Sincronizar clientes con Stripe"}</Button>
            <Button data-testid="run-monthly-btn" variant="outline" className="rounded-full gap-2" onClick={runMonthly} disabled={busy === "monthly"}><CalendarClock size={15} /> {busy === "monthly" ? "Facturando…" : "Facturación mensual ahora"}</Button>
            <Button data-testid="retry-charges-btn" variant="outline" className="rounded-full gap-2" onClick={retryCharges} disabled={busy === "retry"}><RotateCcw size={15} /> {busy === "retry" ? "Reintentando…" : "Reintentar cobros"}</Button>
            <Button variant="outline" className="rounded-full gap-2" onClick={() => { load(); loadStatus(); }} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Actualizar</Button>
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

      {/* Semáforo de cobro por cliente */}
      <div className="mt-8" data-testid="payment-status-section">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="font-heading font-600 text-lg">Estado de cobro por cliente</h3>
          {pstatus && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {Object.entries(DOT).map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${v.c}`} /> {v.t} · <b>{pstatus.counts[k] ?? 0}</b></span>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Método</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Línea activa</th>
                <th className="px-4 py-3 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(pstatus?.customers || []).map((c) => {
                const dot = DOT[c.status] || DOT.none;
                return (
                  <tr key={c.fiscalId} data-testid={`pstatus-row-${c.fiscalId}`}>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${dot.c}`} title={c.label} />
                        <span className="text-xs">{c.label}</span>
                        {c.hasFailed && <span className="text-[10px] uppercase tracking-wide text-destructive bg-destructive/10 rounded-full px-1.5 py-0.5">cobro fallido</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3"><Link to={`/app/customers/${c.fiscalId}`} className="font-medium hover:text-primary">{c.customerName || c.fiscalId}</Link><div className="text-xs text-muted-foreground">{c.fiscalId}</div></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.status === "card" ? <span className="inline-flex items-center gap-1"><CreditCard size={13} /> Tarjeta ····{c.last4 || "----"}</span>
                        : c.status === "sepa" ? <span className="inline-flex items-center gap-1"><Landmark size={13} /> {c.iban ? c.iban.slice(0, 8) + "…" : "SEPA"}</span>
                        : "—"}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs">{c.hasActiveLine ? <span className="text-success">Sí</span> : <span className="text-muted-foreground">No</span>}</td>
                    <td className="px-4 py-3 text-right">
                      {c.status !== "card" && (
                        <Button data-testid={`send-link-${c.fiscalId}`} size="sm" variant="outline" className="h-8 rounded-full gap-1.5" disabled={busy === "link" + c.fiscalId} onClick={() => sendLink(c.fiscalId)}>
                          <Send size={13} /> {busy === "link" + c.fiscalId ? "Enviando…" : c.status === "pending" ? "Reenviar tarjeta" : "Enviar tarjeta"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {pstatus && pstatus.customers.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No hay clientes.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        Los botones «Simular» permiten probar el flujo de reintentos, avisos y suspensión sin esperar al cobro real de SEPA (que tarda días en liquidar).
      </p>
    </div>
  );
}
