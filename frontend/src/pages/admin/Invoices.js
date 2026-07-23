import { useEffect, useState } from "react";
import api, { apiErr, openInvoicePdf } from "@/lib/api";
import { PageHeader, StatusPill } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { FileText, CreditCard } from "lucide-react";
import { toast } from "sonner";

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [paying, setPaying] = useState(null);

  const load = () => api.get("/invoices").then((r) => setInvoices(r.data));
  useEffect(() => { load(); }, []);

  const pay = async (inv) => {
    setPaying(inv.id);
    try {
      const { data } = await api.post("/payments/checkout", { invoiceId: inv.id, origin_url: window.location.origin });
      window.location.href = data.checkout_url;
    } catch (e) { toast.error(apiErr(e)); setPaying(null); }
  };

  return (
    <div data-testid="invoices-page">
      <PageHeader overline="Facturación" title="Facturas" subtitle="Facturas generadas y cobros con Stripe." />
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Nº</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Cliente</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Fecha</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invoices.map((i) => (
              <tr key={i.id} data-testid={`invoice-row-${i.invoiceNumber}`}>
                <td className="px-4 py-3 font-medium">{i.invoiceNumber}</td>
                <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{i.customerName}</td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{i.date?.slice(0, 10)}</td>
                <td className="px-4 py-3 font-semibold">{i.total.toFixed(2)} €</td>
                <td className="px-4 py-3"><StatusPill status={i.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <Button data-testid={`invoice-pdf-${i.invoiceNumber}`} variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => openInvoicePdf(i.id)}>
                      <FileText size={14} /> PDF
                    </Button>
                    {i.status === "pending" && (
                      <Button data-testid={`invoice-pay-${i.invoiceNumber}`} size="sm" className="rounded-full gap-1.5" disabled={paying === i.id} onClick={() => pay(i)}>
                        <CreditCard size={14} /> {paying === i.id ? "…" : "Cobrar"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Sin facturas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
