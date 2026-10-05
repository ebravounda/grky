import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { apiErr, API } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Landmark, ShieldCheck, AlertTriangle, Banknote, ChevronRight, FileText, Download } from "lucide-react";
import { toast } from "sonner";

export default function ResellerDetail() {
  const { resellerId } = useParams();
  const [data, setData] = useState(null);
  const [sepaOpen, setSepaOpen] = useState(false);
  const [iban, setIban] = useState("");
  const [sepaBusy, setSepaBusy] = useState(false);
  const [charging, setCharging] = useState(false);
  const [charges, setCharges] = useState([]);

  const load = () => api.get(`/resellers/${resellerId}`).then((r) => setData(r.data));
  const loadCharges = () => api.get(`/resellers/${resellerId}/charges`).then((r) => setCharges(r.data)).catch(() => {});
  useEffect(() => { load(); loadCharges(); /* eslint-disable-next-line */ }, [resellerId]);

  if (!data) return <div className="text-muted-foreground">Cargando…</div>;
  const { reseller, clients, pendingTotal } = data;

  const openSepa = () => { setIban(reseller.iban || ""); setSepaOpen(true); };
  const startSepa = async () => {
    setSepaBusy(true);
    try {
      const { data: res } = await api.post(`/resellers/${resellerId}/sepa-link`, { iban: iban.trim(), origin_url: window.location.origin });
      if (res.checkout_url) {
        window.open(res.checkout_url, "_blank");
        toast.success("Enlace SEPA generado. Ábrelo/envíaselo al revendedor para que firme el mandato.");
      }
      setSepaOpen(false); load();
    } catch (e) { toast.error(apiErr(e)); } finally { setSepaBusy(false); }
  };

  const chargeAll = async () => {
    if (!reseller.mandate) return toast.error("El revendedor debe firmar antes el mandato SEPA.");
    if (!window.confirm(`¿Cobrar ${Number(pendingTotal).toFixed(2)} € al revendedor ${reseller.name} en un solo adeudo SEPA?`)) return;
    setCharging(true);
    try {
      const { data: res } = await api.post(`/resellers/${resellerId}/charge-pending`);
      toast.success(res.status === "succeeded"
        ? `Cobrado ${Number(res.total).toFixed(2)} € (${res.invoices} facturas)`
        : `Adeudo SEPA iniciado: ${Number(res.total).toFixed(2)} € (${res.invoices} facturas) · liquida en unos días`);
      load(); loadCharges();
    } catch (e) { toast.error(apiErr(e)); } finally { setCharging(false); }
  };

  const maskIban = (v) => { if (!v) return ""; const c = v.replace(/\s+/g, ""); return c.length <= 8 ? c : `${c.slice(0, 4)} •••• ${c.slice(-4)}`; };

  return (
    <div data-testid="reseller-detail-page">
      <Link to="/app/resellers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3"><ArrowLeft size={15} /> Revendedores</Link>
      <PageHeader overline="Revendedor" title={reseller.name} subtitle={reseller.email} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Datos de cobro del revendedor */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-3">
          <div className="flex items-center gap-2 text-primary"><Landmark size={18} /><h3 className="font-heading font-600 text-foreground">Domiciliación del revendedor</h3></div>
          <div className="text-sm">
            <p className="text-muted-foreground">IBAN</p>
            <p className="font-medium">{reseller.iban ? maskIban(reseller.iban) : "— sin IBAN —"}</p>
          </div>
          <div className="text-sm">
            <p className="text-muted-foreground">Mandato SEPA</p>
            {reseller.mandate ? (
              <p className="inline-flex items-center gap-1.5 text-success font-semibold"><ShieldCheck size={15} /> Firmado {reseller.last4 ? `· ••${reseller.last4}` : ""}</p>
            ) : (
              <p className="inline-flex items-center gap-1.5 text-amber-600 font-semibold"><AlertTriangle size={15} /> Pendiente de firma</p>
            )}
          </div>
          <Button data-testid="reseller-sepa-btn" variant="outline" className="w-full rounded-full gap-2" onClick={openSepa}>
            <Landmark size={15} /> {reseller.mandate ? "Cambiar IBAN / mandato" : "Configurar IBAN y mandato"}
          </Button>
        </div>

        {/* Resumen y cobro */}
        <div className="rounded-lg border border-border bg-card p-6 lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-600">Facturas pendientes de sus clientes</h3>
              <p className="text-sm text-muted-foreground">{clients.length} clientes asignados</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total a cobrar</p>
              <p className="text-2xl font-bold">{Number(pendingTotal || 0).toFixed(2)} €</p>
            </div>
          </div>
          <Button data-testid="reseller-charge-btn" className="rounded-full gap-2 self-start"
            onClick={chargeAll} disabled={charging || pendingTotal <= 0 || !reseller.mandate}>
            <Banknote size={16} /> {charging ? "Cobrando…" : "Cobrar todo por SEPA (un solo adeudo)"}
          </Button>
          {!reseller.mandate && <p className="text-xs text-amber-600 mt-2">Primero el revendedor debe firmar el mandato SEPA.</p>}
          {pendingTotal <= 0 && <p className="text-xs text-muted-foreground mt-2">No hay facturas pendientes de los clientes asignados.</p>}
        </div>
      </div>

      {/* Clientes asignados */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto mt-5">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Cliente asignado</th>
              <th className="px-4 py-3 font-medium">NIF/NIE</th>
              <th className="px-4 py-3 font-medium">Facturas pendientes</th>
              <th className="px-4 py-3 font-medium">Importe pendiente</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clients.map((c) => (
              <tr key={c.fiscalId} data-testid={`reseller-client-${c.fiscalId}`} className="hover:bg-muted/40 transition-colors">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.fiscalId}</td>
                <td className="px-4 py-3">{c.pendingCount}</td>
                <td className="px-4 py-3 font-semibold">{Number(c.pendingTotal || 0).toFixed(2)} €</td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/app/customers/${c.fiscalId}`} className="inline-flex items-center gap-1 text-primary text-xs">Ver ficha <ChevronRight size={14} /></Link>
                </td>
              </tr>
            ))}
            {clients.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Sin clientes asignados. Asígnalos desde la lista de Clientes o la ficha del cliente.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Cobros realizados */}
      {charges.length > 0 && (
        <div className="mt-5" data-testid="reseller-charges">
          <h3 className="flex items-center gap-2 font-heading font-600 mb-3"><FileText size={17} className="text-primary" /> Cobros agrupados realizados</h3>
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Facturas</th>
                  <th className="px-4 py-3 font-medium">Importe</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {charges.map((ch) => (
                  <tr key={ch.chargeId} data-testid={`charge-row-${ch.chargeId}`}>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{ch.createdAt ? new Date(ch.createdAt).toLocaleString("es-ES") : "—"}</td>
                    <td className="px-4 py-3">{ch.invoiceCount}</td>
                    <td className="px-4 py-3 font-semibold">{Number(ch.total || 0).toFixed(2)} €</td>
                    <td className="px-4 py-3">{ch.status === "succeeded" ? <span className="text-success">Cobrado</span> : ch.status === "processing" ? <span className="text-primary">En proceso</span> : ch.status}</td>
                    <td className="px-4 py-3 text-right">
                      <a href={`${API}/resellers/charges/${ch.chargeId}/receipt.pdf`} target="_blank" rel="noreferrer"
                        data-testid={`receipt-${ch.chargeId}`} className="inline-flex items-center gap-1.5 text-primary text-xs font-semibold hover:underline">
                        <Download size={14} /> Recibo PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dialogo IBAN / mandato */}
      <Dialog open={sepaOpen} onOpenChange={(o) => { if (!sepaBusy) setSepaOpen(o); }}>
        <DialogContent data-testid="reseller-sepa-dialog">
          <DialogHeader>
            <DialogTitle>Domiciliación SEPA del revendedor</DialogTitle>
            <DialogDescription>
              Introduce el IBAN del revendedor y genera el enlace de Stripe donde firmará su mandato SEPA (una sola vez). Después podrás cobrarle en bloque.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>IBAN del revendedor</Label>
            <Input data-testid="reseller-iban-input" value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())}
              placeholder="ES00 0000 0000 0000 0000 0000" className="tracking-wider" />
            <p className="text-xs text-muted-foreground">El mandato lo firma el revendedor en la pasarela segura de Stripe. No almacenamos datos bancarios.</p>
          </div>
          <DialogFooter>
            <Button data-testid="reseller-sepa-continue-btn" onClick={startSepa} disabled={sepaBusy || !iban.trim()} className="rounded-full gap-2">
              <Landmark size={16} /> {sepaBusy ? "Generando…" : "Generar enlace de mandato"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
