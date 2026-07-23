import { useEffect, useState } from "react";
import api, { apiErr, openInvoicePdf } from "@/lib/api";
import { PageHeader, StatusPill } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { FileText, CreditCard } from "lucide-react";
import { toast } from "sonner";

export default function ClientInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [paying, setPaying] = useState(null);

  useEffect(() => { api.get("/invoices").then((r) => setInvoices(r.data)); }, []);

  const pay = async (inv) => {
    setPaying(inv.id);
    try {
      const { data } = await api.post("/payments/checkout", { invoiceId: inv.id, origin_url: window.location.origin });
      window.location.href = data.checkout_url;
    } catch (e) { toast.error(apiErr(e)); setPaying(null); }
  };

  return (
    <div data-testid="client-invoices">
      <PageHeader overline="Facturación" title="Mis facturas" subtitle="Consulta y paga tus facturas." />
      <div className="space-y-3">
        {invoices.map((i) => (
          <div key={i.id} data-testid={`client-invoice-${i.invoiceNumber}`} className="rounded-lg border border-border bg-card p-5 flex flex-wrap items-center justify-between gap-4 card-hover">
            <div className="flex items-center gap-3">
              <div className="grid place-items-center h-10 w-10 rounded-md bg-primary/10 text-primary"><FileText size={18} /></div>
              <div>
                <p className="font-semibold">{i.invoiceNumber}</p>
                <p className="text-xs text-muted-foreground">{i.date?.slice(0, 10)}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-heading text-lg font-700">{i.total.toFixed(2)} €</span>
              <StatusPill status={i.status} />
              <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => openInvoicePdf(i.id)} data-testid={`client-inv-pdf-${i.invoiceNumber}`}>
                <FileText size={14} /> PDF
              </Button>
              {i.status === "pending" && (
                <Button size="sm" className="rounded-full gap-1.5" disabled={paying === i.id} onClick={() => pay(i)} data-testid={`client-inv-pay-${i.invoiceNumber}`}>
                  <CreditCard size={14} /> {paying === i.id ? "…" : "Pagar"}
                </Button>
              )}
            </div>
          </div>
        ))}
        {invoices.length === 0 && <p className="text-center text-muted-foreground py-12">No tienes facturas.</p>}
      </div>
    </div>
  );
}
