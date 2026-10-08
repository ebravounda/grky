import { useEffect, useState } from "react";
import api, { apiErr, openInvoicePdf, API } from "@/lib/api";
import { PageHeader, StatusPill } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileText, CreditCard, Mail, FileArchive, CheckCheck, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function Invoices() {
  const { user, hasPerm } = useAuth();
  const isReseller = user?.role === "reseller";
  const canBulk = !isReseller && hasPerm("billing.manage");
  const [sel, setSel] = useState([]);
  const [marking, setMarking] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [paying, setPaying] = useState(null);
  const [emailing, setEmailing] = useState(null);
  const [expStatus, setExpStatus] = useState("paid");
  const [expPeriod, setExpPeriod] = useState("all");

  const load = () => api.get("/invoices").then((r) => setInvoices(r.data));
  useEffect(() => { load(); }, []);

  const unpaidIds = invoices.filter((i) => i.status !== "paid").map((i) => i.id);
  const toggle = (id) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const allSel = unpaidIds.length > 0 && unpaidIds.every((id) => sel.includes(id));
  const selTotal = invoices.filter((i) => sel.includes(i.id)).reduce((a, i) => a + i.total, 0);
  const markPaid = async () => {
    if (!window.confirm(`¿Marcar ${sel.length} factura(s) como pagadas (${selTotal.toFixed(2)} €)?`)) return;
    setMarking(true);
    try {
      const { data } = await api.post("/invoices/mark-paid-bulk", { ids: sel });
      toast.success(`${data.updated} factura(s) marcadas como pagadas`);
      setSel([]); load();
    } catch (e) { toast.error(apiErr(e)); } finally { setMarking(false); }
  };

  const periods = Array.from(new Set(invoices.map((i) => i.period).filter(Boolean)));
  const matchCount = invoices.filter((i) =>
    (expStatus === "all" || i.status === expStatus) && (expPeriod === "all" || i.period === expPeriod)).length;

  const downloadZip = () => {
    if (matchCount === 0) return toast.error("No hay facturas para esos filtros");
    const params = new URLSearchParams();
    if (expStatus !== "all") params.set("status", expStatus);
    if (expPeriod !== "all") params.set("period", expPeriod);
    window.open(`${API}/invoices/export.zip?${params.toString()}`, "_blank");
    toast.success(`Descargando ${matchCount} factura(s) en ZIP…`);
  };

  const pay = async (inv) => {
    setPaying(inv.id);
    try {
      const { data } = await api.post("/payments/checkout", { invoiceId: inv.id, origin_url: window.location.origin });
      window.location.href = data.checkout_url;
    } catch (e) { toast.error(apiErr(e)); setPaying(null); }
  };

  const sendEmail = async (inv) => {
    setEmailing(inv.id);
    try {
      const { data } = await api.post(`/invoices/${inv.id}/email`);
      toast.success(`Factura enviada a ${data.to}`);
    } catch (e) { toast.error(apiErr(e)); } finally { setEmailing(null); }
  };

  return (
    <div data-testid="invoices-page">
      <PageHeader overline="Facturación" title={isReseller ? "Facturas impagadas" : "Facturas"}
        subtitle={isReseller ? "Facturas pendientes de pago de tus clientes." : "Facturas generadas y cobros con Stripe."} />

      {/* Exportar para gestoría */}
      {!isReseller && <div data-testid="invoice-export-bar" className="flex flex-wrap items-center gap-3 mb-4 rounded-lg border border-border bg-card p-3">
        <span className="flex items-center gap-2 text-sm font-medium"><FileArchive size={16} className="text-primary" /> Exportar para gestoría</span>
        <div className="w-40">
          <Select value={expStatus} onValueChange={setExpStatus}>
            <SelectTrigger data-testid="export-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="paid">Solo pagadas</SelectItem>
              <SelectItem value="pending">Solo pendientes</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Select value={expPeriod} onValueChange={setExpPeriod}>
            <SelectTrigger data-testid="export-period"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los periodos</SelectItem>
              {periods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground">{matchCount} factura(s)</span>
        <Button data-testid="export-zip-btn" className="rounded-full gap-2" onClick={downloadZip} disabled={matchCount === 0}>
          <FileArchive size={15} /> Descargar ZIP
        </Button>
      </div>}

      {canBulk && sel.length > 0 && (
        <div data-testid="bulk-bar" className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-3 rounded-full border border-primary/30 bg-primary/5 backdrop-blur px-4 py-2">
          <span className="text-sm" data-testid="bulk-count"><b>{sel.length}</b> seleccionada(s) · {selTotal.toFixed(2)} €</span>
          <Button data-testid="bulk-mark-paid-btn" size="sm" className="rounded-full gap-1.5 bg-success hover:bg-success/90 text-white" disabled={marking} onClick={markPaid}>
            <CheckCheck size={14} /> {marking ? "Marcando…" : "Marcar como pagadas"}
          </Button>
          <Button data-testid="bulk-clear-btn" size="sm" variant="ghost" className="rounded-full gap-1" onClick={() => setSel([])}><X size={14} /> Quitar selección</Button>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              {canBulk && <th className="pl-4 py-3 w-8"><Checkbox data-testid="select-all-unpaid" checked={allSel} onCheckedChange={(v) => setSel(v ? unpaidIds : [])} aria-label="Seleccionar todas las pendientes" /></th>}
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
              <tr key={i.id} data-testid={`invoice-row-${i.invoiceNumber}`} className={sel.includes(i.id) ? "bg-primary/5" : ""}>
                {canBulk && <td className="pl-4 py-3">{i.status !== "paid" && <Checkbox data-testid={`select-invoice-${i.invoiceNumber}`} checked={sel.includes(i.id)} onCheckedChange={() => toggle(i.id)} />}</td>}
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
                    <Button data-testid={`invoice-email-${i.invoiceNumber}`} variant="outline" size="sm" className="rounded-full gap-1.5" disabled={emailing === i.id} onClick={() => sendEmail(i)}>
                      <Mail size={14} /> {emailing === i.id ? "…" : "Email"}
                    </Button>
                    {i.status === "pending" && !isReseller && (
                      <Button data-testid={`invoice-pay-${i.invoiceNumber}`} size="sm" className="rounded-full gap-1.5" disabled={paying === i.id} onClick={() => pay(i)}>
                        <CreditCard size={14} /> {paying === i.id ? "…" : "Cobrar"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={canBulk ? 7 : 6} className="px-4 py-10 text-center text-muted-foreground">Sin facturas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
