import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Input } from "@/components/ui/input";
import { Search, CheckCircle2, CreditCard } from "lucide-react";
import { toast } from "sonner";

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export default function Payments() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/admin/payments").then((r) => setItems(r.data)).catch((e) => toast.error(apiErr(e))).finally(() => setLoading(false));
  }, []);

  const filtered = items.filter((p) =>
    !q || (p.customerName || "").toLowerCase().includes(q.toLowerCase()) ||
    (p.fiscalId || "").toLowerCase().includes(q.toLowerCase()) ||
    (p.invoiceNumber || "").toLowerCase().includes(q.toLowerCase()));

  const total = filtered.reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <div data-testid="payments-page">
      <PageHeader overline="Cobros" title="Pagos recibidos"
        subtitle="Todos los pagos exitosos realizados por los clientes vía Stripe." />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="relative max-w-md w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input data-testid="payments-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por cliente, NIF o factura…" className="pl-9" />
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm">
          <span className="text-muted-foreground">Total cobrado: </span>
          <b className="text-success" data-testid="payments-total">{total.toFixed(2)} €</b>
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
                <th className="p-3 font-medium text-right">Importe</th>
                <th className="p-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} data-testid={`payment-${p.id}`} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="p-3 text-muted-foreground whitespace-nowrap">{fmtDate(p.paidAt)}</td>
                  <td className="p-3">
                    <p className="font-medium text-foreground">{p.customerName || "—"}</p>
                    {p.fiscalId && <p className="text-xs text-muted-foreground">{p.fiscalId}</p>}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><CreditCard size={14} /> {p.invoiceNumber || "Pago"}</span>
                  </td>
                  <td className="p-3 text-right font-semibold">{(p.amount || 0).toFixed(2)} €</td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success/10 text-success text-xs font-medium">
                      <CheckCircle2 size={12} /> Pagado
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Aún no hay pagos registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
