import { useState } from "react";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertTriangle, ExternalLink, Search, XCircle } from "lucide-react";
import { CANCEL_TONE } from "@/components/PaymentCancellationsPanel";
import { toast } from "sonner";

const fmt = (d) => new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });

export const DuplicateChargesButton = ({ onChanged }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(null);

  const cancel = async (g, c) => {
    if (!window.confirm(`¿Cancelar en Stripe el cobro de ${g.amount.toFixed(2)} € del ${fmt(c.created)} a ${g.customerName}?\n\nSi el SEPA está en proceso o ya cobrado, se devolverá el importe completo.`)) return;
    setCancelling(c.id);
    try {
      const { data: d } = await api.post(`/billing/payments/${c.id}/cancel`, { keepPiId: g.charges[0].id });
      toast.success(`Cobro cancelado · ${d.statusLabel}`);
      setData((prev) => ({ ...prev, groups: prev.groups.map((gg) => ({ ...gg, charges: gg.charges.map((cc) => cc.id === c.id ? { ...cc, cancelStatus: d.status, cancelLabel: d.statusLabel } : cc) })) }));
      onChanged && onChanged();
    } catch (e) { toast.error(apiErr(e)); } finally { setCancelling(null); }
  };

  const scan = async () => {
    setOpen(true); setLoading(true); setData(null);
    try { const { data: d } = await api.get("/billing/duplicate-charges", { params: { days: 120 } }); setData(d); }
    catch (e) { toast.error(apiErr(e)); setOpen(false); } finally { setLoading(false); }
  };

  return (
    <>
      <Button data-testid="duplicate-charges-btn" variant="outline" className="rounded-full gap-2 text-amber-700 border-amber-300" onClick={scan}>
        <AlertTriangle size={15} /> Cobros duplicados
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto" data-testid="duplicate-charges-dialog">
          <DialogHeader>
            <DialogTitle>Cobros duplicados en Stripe</DialogTitle>
            <DialogDescription>Clientes cobrados varias veces por el mismo importe en menos de 20 días (últimos 120 días). Pulsa «Cancelar cobro» para anularlo o devolverlo en Stripe.</DialogDescription>
          </DialogHeader>
          {loading && <p className="py-10 text-center text-muted-foreground flex items-center justify-center gap-2"><Search size={16} className="animate-pulse" /> Consultando Stripe…</p>}
          {data && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3" data-testid="dup-affected"><p className="text-xs text-muted-foreground">Clientes afectados</p><p className="text-2xl font-bold">{data.affectedCustomers}</p></div>
                <div className="rounded-lg border p-3 border-destructive/40" data-testid="dup-total-extra"><p className="text-xs text-muted-foreground">Importe cobrado de más</p><p className="text-2xl font-bold text-destructive">{data.totalExtra.toFixed(2)} €</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Cobros revisados</p><p className="text-2xl font-bold">{data.scanned}</p></div>
              </div>
              {data.groups.length === 0 && <p className="py-6 text-center text-muted-foreground" data-testid="dup-none">No se han encontrado cobros duplicados.</p>}
              {data.groups.map((g, gi) => (
                <div key={gi} className="rounded-lg border border-border" data-testid={`dup-group-${gi}`}>
                  <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-muted/40 border-b">
                    <span className="font-semibold">{g.customerName}</span>
                    {g.fiscalId && <span className="text-xs text-muted-foreground">{g.fiscalId}</span>}
                    <span className="ml-auto text-sm"><b>{g.count}×</b> {g.amount.toFixed(2)} € · <span className="text-destructive font-semibold">{g.extraAmount.toFixed(2)} € de más</span></span>
                  </div>
                  <div className="divide-y">
                    {g.charges.map((c, ci) => (
                      <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                        <span className={`text-[11px] font-bold uppercase rounded-full px-2 py-0.5 ${ci === 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{ci === 0 ? "Original" : "Duplicado"}</span>
                        <span>{fmt(c.created)}</span>
                        <span className="text-muted-foreground truncate max-w-[280px]">{c.description}</span>
                        <span className="text-xs uppercase text-muted-foreground">{c.method === "sepa_debit" ? "SEPA" : c.method} · {c.status === "processing" ? "en proceso" : "cobrado"}</span>
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-primary hover:underline" data-testid={`dup-stripe-link-${c.id}`}>Abrir en Stripe <ExternalLink size={13} /></a>
                        {c.cancelStatus ? (
                          <span data-testid={`dup-cancel-status-${c.id}`} className={`text-[11px] font-bold uppercase rounded-full px-2 py-0.5 ${CANCEL_TONE[c.cancelStatus] || "bg-muted"}`}>{c.cancelLabel}</span>
                        ) : ci > 0 && (
                          <Button size="sm" variant="outline" className="h-7 rounded-full gap-1 text-destructive border-destructive/40" disabled={cancelling === c.id}
                            data-testid={`dup-cancel-btn-${c.id}`} onClick={() => cancel(g, c)}>
                            <XCircle size={13} /> {cancelling === c.id ? "Cancelando…" : "Cancelar cobro"}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
