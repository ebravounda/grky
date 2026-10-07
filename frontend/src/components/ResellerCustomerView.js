import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { apiErr, openInvoicePdf } from "@/lib/api";
import { PageHeader, StatusPill } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Mail, User, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";

function Info({ icon: Icon, label, value, testid }) {
  return (
    <div className="flex items-start gap-3" data-testid={testid}>
      <Icon size={16} className="text-primary mt-0.5 shrink-0" />
      <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium">{value || "—"}</p></div>
    </div>
  );
}

export default function ResellerCustomerView() {
  const { fiscalId } = useParams();
  const [data, setData] = useState(null);
  const [emailing, setEmailing] = useState(null);

  useEffect(() => {
    api.get(`/customers/${fiscalId}`).then((r) => setData(r.data)).catch((e) => { toast.error(apiErr(e)); setData(false); });
  }, [fiscalId]);

  const sendEmail = async (inv) => {
    setEmailing(inv.id);
    try { const { data: d } = await api.post(`/invoices/${inv.id}/email`); toast.success(`Factura enviada a ${d.to}`); }
    catch (e) { toast.error(apiErr(e)); } finally { setEmailing(null); }
  };

  if (data === null) return <p className="text-muted-foreground">Cargando…</p>;
  if (data === false) return <Link to="/app/customers" className="text-primary text-sm">Volver a clientes</Link>;
  const c = data.customer || {};
  const fullName = [c.name, c.firstSurname, c.lastSurname].filter(Boolean).join(" ");
  const address = [c.street, c.streetNumber, c.postalCode, c.cityName, c.provinceName].filter(Boolean).join(", ");

  return (
    <div data-testid="reseller-customer-view">
      <Link to="/app/customers" data-testid="reseller-back-btn" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft size={15} /> Clientes</Link>
      <PageHeader overline="Cliente" title={fullName || c.fiscalId} subtitle={`NIF/NIE ${c.fiscalId}`} />
      <div className="rounded-lg border border-border bg-card p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <Info icon={User} label="Nombre" value={fullName} testid="rc-name" />
        <Info icon={Mail} label="Email" value={c.email} testid="rc-email" />
        <Info icon={Phone} label="Teléfono" value={c.contactPhone} testid="rc-phone" />
        <Info icon={MapPin} label="Dirección" value={address} testid="rc-address" />
      </div>
      <h3 className="font-heading text-lg font-semibold mb-3">Facturas impagadas</h3>
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {data.invoices.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid={`rc-invoice-${i.invoiceNumber}`}>
            <span className="font-medium">{i.invoiceNumber}</span>
            <span className="text-sm text-muted-foreground">{i.date?.slice(0, 10)}</span>
            <span className="font-semibold">{i.total.toFixed(2)} €</span>
            <StatusPill status={i.status} />
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" className="rounded-full gap-1.5" data-testid={`rc-invoice-pdf-${i.invoiceNumber}`} onClick={() => openInvoicePdf(i.id)}><FileText size={14} /> PDF</Button>
              <Button variant="outline" size="sm" className="rounded-full gap-1.5" data-testid={`rc-invoice-email-${i.invoiceNumber}`} disabled={emailing === i.id} onClick={() => sendEmail(i)}><Mail size={14} /> {emailing === i.id ? "…" : "Email"}</Button>
            </div>
          </div>
        ))}
        {data.invoices.length === 0 && <p className="px-4 py-8 text-center text-muted-foreground" data-testid="rc-no-invoices">Este cliente no tiene facturas pendientes.</p>}
      </div>
    </div>
  );
}
