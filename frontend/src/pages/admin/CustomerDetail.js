import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { openInvoicePdf } from "@/lib/api";
import { PageHeader, StatusPill } from "@/components/shared";
import { ArrowLeft, Signal, Wifi, FileText, User } from "lucide-react";

export default function CustomerDetail() {
  const { fiscalId } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => { api.get(`/customers/${fiscalId}`).then((r) => setData(r.data)); }, [fiscalId]);
  if (!data) return <div className="text-muted-foreground">Cargando…</div>;

  const { customer, lines, subscriptions, invoices } = data;
  const openPdf = (id) => openInvoicePdf(id);

  return (
    <div data-testid="customer-detail">
      <Link to="/app/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-4"><ArrowLeft size={15} /> Clientes</Link>
      <PageHeader overline={customer.customerType} title={`${customer.name} ${customer.firstSurname || ""}`} subtitle={`NIF/NIE: ${customer.fiscalId}`} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="rounded-lg border border-border bg-card p-6 space-y-3">
          <div className="flex items-center gap-2 text-primary"><User size={18} /><h3 className="font-heading font-600 text-foreground">Datos de contacto</h3></div>
          <Row l="Email" v={customer.email} />
          <Row l="Teléfono" v={customer.contactPhone} />
          <Row l="Dirección" v={`${customer.billingAddress?.street || ""} ${customer.billingAddress?.streetNumber || ""}`} />
          <Row l="Ciudad" v={`${customer.billingAddress?.postalCode || ""} ${customer.billingAddress?.cityName || ""}`} />
          <Row l="Provincia" v={customer.billingAddress?.provinceName} />
        </div>

        <div className="rounded-lg border border-border bg-card p-6 lg:col-span-2">
          <h3 className="font-heading font-600 mb-4">Líneas y servicios ({lines.length})</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {lines.map((l) => (
              <Link key={l.id} to={`/app/lines/${l.lineNumber}`} data-testid={`cust-line-${l.lineNumber}`}
                className="rounded-lg border border-border p-4 card-hover block">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {l.family === "Mobile" ? <Signal size={16} className="text-primary" /> : <Wifi size={16} className="text-primary" />}
                    {l.lineNumber}
                  </span>
                  <StatusPill status={l.status} />
                </div>
                <p className="text-sm text-muted-foreground mt-2">{l.productName}</p>
                <p className="text-sm font-semibold mt-1">{l.price?.toFixed(2)} €/mes</p>
              </Link>
            ))}
            {lines.length === 0 && <p className="text-sm text-muted-foreground">Sin líneas contratadas.</p>}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 lg:col-span-3">
          <h3 className="font-heading font-600 mb-4">Facturas ({invoices.length})</h3>
          <div className="divide-y divide-border">
            {invoices.map((i) => (
              <div key={i.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <FileText size={18} className="text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{i.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">{i.date?.slice(0, 10)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-sm">{i.total.toFixed(2)} €</span>
                  <StatusPill status={i.status} />
                  <button data-testid={`inv-pdf-${i.invoiceNumber}`} onClick={() => openPdf(i.id)} className="text-sm text-primary hover:underline">PDF</button>
                </div>
              </div>
            ))}
            {invoices.length === 0 && <p className="text-sm text-muted-foreground">Sin facturas.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ l, v }) {
  return (
    <div className="flex justify-between gap-4 text-sm border-b border-border/60 pb-2">
      <span className="text-muted-foreground">{l}</span>
      <span className="font-medium text-right">{v || "—"}</span>
    </div>
  );
}
