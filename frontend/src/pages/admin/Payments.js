import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Input } from "@/components/ui/input";
import { Search, CheckCircle2, CreditCard, Landmark, Clock, XCircle, Hourglass } from "lucide-react";
import { toast } from "sonner";

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

const STATUS = {
  paid: { label: "Pagado", cls: "bg-success/10 text-success", Icon: CheckCircle2 },
  processing: { label: "SEPA en proceso", cls: "bg-blue-500/10 text-blue-600", Icon: Hourglass },
  pending: { label: "Pendiente", cls: "bg-amber-500/10 text-amber-600", Icon: Clock },
  failed: { label: "Fallido", cls: "bg-destructive/10 text-destructive", Icon: XCircle },
};

const TABS = [
  { key: "all", label: "Todos" },
  { key: "paid", label: "Pagados" },
  { key: "processing", label: "SEPA en proceso" },
  { key: "pending", label: "Pendientes" },
  { key: "failed", label: "Fallidos" },
];

export default function Payments() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/admin/payments").then((r) => setItems(r.data)).catch((e) => toast.error(apiErr(e))).finally(() => setLoading(false));
  }, []);

  const filtered = items.filter((p) => {
    if (tab !== "all" && p.status !== tab) return false;
    return !q || (p.customerName || "").toLowerCase().includes(q.toLowerCase()) ||
      (p.fiscalId || "").toLowerCase().includes(q.toLowerCase()) ||
      (p.invoiceNumber || "").toLowerCase().includes(q.toLowerCase());
  });

  const totalPaid = items.filter((p) => p.status === "paid").reduce((s, p) => s + (p.amount || 0), 0);
  const totalProcessing = items.filter((p) => p.status === "processing").reduce((s, p) => s + (p.amount || 0), 0);
  const totalPending = items.filter((p) => p.status === "pending").reduce((s, p) => s + (p.amount || 0), 0);
  const count = (k) => (k === "all" ? items.length : items.filter((p) => p.status === k).length);

  return (
    <div data-testid="payments-page">
      <PageHeader overline="Cobros" title="Pagos recibidos"
        subtitle="Cobros y facturas por Stripe: tarjeta, adeudos SEPA (incluidos los que están liquidando) y pendientes." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Total cobrado</p>
          <p className="text-lg font-bold text-success" data-testid="payments-total-paid">{totalPaid.toFixed(2)} €</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">SEPA en proceso</p>
          <p className="text-lg font-bold text-blue-600" data-testid="payments-total-processing">{totalProcessing.toFixed(2)} €</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Pendiente de cobro</p>
          <p className="text-lg font-bold text-amber-600" data-testid="payments-total-pending">{totalPending.toFixed(2)} €</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button key={t.key} data-testid={`payments-tab-${t.key}`} onClick={() => setTab(t.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${tab === t.key ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
              {t.label} <span className="opacity-70">({count(t.key)})</span>
            </button>
          ))}
        </div>
        <div className="relative max-w-xs w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input data-testid="payments-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por cliente, NIF o factura…" className="pl-9" />
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Cargando…</div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-3 font-medium">Fecha</th>
                <th className="p-3 font-medium">Cliente</th>
                <th className="p-3 font-medium">Concepto</th>
                <th className="p-3 font-medium">Método</th>
                <th className="p-3 font-medium text-right">Importe</th>
                <th className="p-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const st = STATUS[p.status] || STATUS.pending;
                return (
                  <tr key={p.id} data-testid={`payment-${p.id}`} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{fmtDate(p.paidAt)}</td>
                    <td className="p-3">
                      <p className="font-medium text-foreground">{p.customerName || "—"}</p>
                      {p.fiscalId && <p className="text-xs text-muted-foreground">{p.fiscalId}</p>}
                    </td>
                    <td className="p-3 text-muted-foreground">{p.invoiceNumber || p.concept || "Pago"}</td>
                    <td className="p-3">
                      {p.method === "sepa" ? (
                        <span className="inline-flex items-center gap-1.5 text-blue-600"><Landmark size={14} /> SEPA</span>
                      ) : p.method === "card" ? (
                        <span className="inline-flex items-center gap-1.5 text-foreground"><CreditCard size={14} /> Tarjeta</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3 text-right font-semibold">{(p.amount || 0).toFixed(2)} €</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>
                        <st.Icon size={12} /> {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No hay registros en esta vista.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
