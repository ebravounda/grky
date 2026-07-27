import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { API } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ClipboardCheck, Check, X, Eye, CreditCard, Landmark, Smartphone, FileText } from "lucide-react";
import { toast } from "sonner";

const REVIEW = {
  PENDING_REVIEW: { c: "bg-warning/15 text-warning", t: "Pendiente" },
  APPROVED: { c: "bg-success/12 text-success", t: "Aprobada" },
  REJECTED: { c: "bg-destructive/12 text-destructive", t: "Rechazada" },
};
const PAY = { paid: { c: "text-success", t: "Pagado" }, pending: { c: "text-warning", t: "Pago pendiente" } };

export default function Solicitudes() {
  const [apps, setApps] = useState([]);
  const [detail, setDetail] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/applications").then((r) => setApps(r.data));
  useEffect(() => { load(); }, []);

  const openDetail = async (token) => {
    try { const { data } = await api.get(`/applications/${token}/detail`); setDetail(data); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const approve = async (token) => {
    setBusy(true);
    try { await api.post(`/applications/${token}/approve`); toast.success("Alta aprobada y creada en Likes · datos reales sincronizados"); setDetail(null); load(); }
    catch (e) { toast.error(apiErr(e)); } finally { setBusy(false); }
  };

  const reject = async () => {
    setBusy(true);
    try { await api.post(`/applications/${rejecting}/reject`, { reason }); toast.success("Solicitud rechazada"); setRejecting(null); setReason(""); setDetail(null); load(); }
    catch (e) { toast.error(apiErr(e)); } finally { setBusy(false); }
  };

  const pending = apps.filter((a) => a.reviewStatus === "PENDING_REVIEW" && a.status === "COMPLETED");

  return (
    <div data-testid="solicitudes-page">
      <PageHeader overline="Altas" title="Solicitudes"
        subtitle="Revisa la documentación de las altas online y aprueba la activación de líneas." />

      {pending.length > 0 && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning font-medium">
          Tienes {pending.length} solicitud(es) pendiente(s) de revisión.
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Producto</th>
              <th className="px-4 py-3 font-medium">Pago</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">SIM</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {apps.map((a) => {
              const rv = REVIEW[a.reviewStatus] || REVIEW.PENDING_REVIEW;
              const pay = PAY[a.paymentStatus] || PAY.pending;
              return (
                <tr key={a.token} data-testid={`app-row-${a.fiscalId}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.fiscalId} · {a.email}</div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{a.productName}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs">
                      {a.paymentMethod === "card" ? <CreditCard size={13} /> : <Landmark size={13} />}
                      <span className={pay.c}>{pay.t}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs uppercase text-muted-foreground">{a.simType === "physical" ? "Física" : "eSIM"}</span>
                  </td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${rv.c}`}>{rv.t}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button data-testid={`review-btn-${a.fiscalId}`} size="sm" variant="outline" className="rounded-full gap-1 h-8" onClick={() => openDetail(a.token)}>
                        <Eye size={14} /> Revisar
                      </Button>
                      {a.reviewStatus === "PENDING_REVIEW" && a.status === "COMPLETED" && (
                        <>
                          <Button data-testid={`approve-btn-${a.fiscalId}`} size="sm" className="rounded-full gap-1 h-8 bg-success hover:bg-success/90" onClick={() => approve(a.token)} disabled={busy}>
                            <Check size={14} /> Aprobar
                          </Button>
                          <Button data-testid={`reject-btn-${a.fiscalId}`} size="sm" variant="outline" className="rounded-full gap-1 h-8 text-destructive border-destructive/30" onClick={() => setRejecting(a.token)}>
                            <X size={14} />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {apps.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground"><ClipboardCheck size={26} className="mx-auto mb-2 opacity-40" />No hay solicitudes de alta.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Detalle / revisión KYC */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="app-detail-dialog">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>Revisión de solicitud · {detail.name} {detail.firstSurname}</DialogTitle>
                <DialogDescription>Verifica la identidad y los datos antes de aprobar.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field l="NIF/NIE" v={detail.fiscalId} />
                <Field l="Email" v={detail.email} />
                <Field l="Teléfono" v={detail.contactPhone} />
                <Field l="Producto" v={detail.productName} />
                <Field l="Dirección" v={`${detail.address}, ${detail.postalCode} ${detail.city}`} />
                <Field l="IBAN" v={detail.iban || "—"} />
                <Field l="Método de pago" v={detail.paymentMethod === "card" ? "Tarjeta" : "Domiciliación SEPA"} />
                <Field l="Tipo SIM" v={detail.simType === "physical" ? "SIM física" : "eSIM"} />
                <Field l="Estado pago" v={detail.paymentStatus === "paid" ? "Pagado ✓" : "Pendiente"} />
                <Field l="Contrato" v={detail.contractCode} />
              </div>
              <div className="mt-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Documentación (KYC)</p>
                <div className="grid grid-cols-3 gap-2">
                  {detail.fileIds?.front && <DocThumb label="DNI anverso" id={detail.fileIds.front} />}
                  {detail.fileIds?.back && <DocThumb label="DNI reverso" id={detail.fileIds.back} />}
                  {detail.fileIds?.selfie && <DocThumb label="Selfie" id={detail.fileIds.selfie} />}
                </div>
                <a href={`${API}/public/applications/${detail.token}/contract.pdf`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary text-sm hover:underline mt-3">
                  <FileText size={14} /> Ver contrato firmado
                </a>
              </div>
              {detail.reviewStatus === "PENDING_REVIEW" && detail.status === "COMPLETED" && (
                <DialogFooter className="gap-2">
                  <Button variant="outline" className="rounded-full text-destructive border-destructive/30 gap-1" onClick={() => setRejecting(detail.token)}><X size={15} /> Rechazar</Button>
                  <Button className="rounded-full gap-1 bg-success hover:bg-success/90" onClick={() => approve(detail.token)} disabled={busy}><Check size={15} /> Aprobar y activar</Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Rechazo */}
      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent data-testid="reject-dialog">
          <DialogHeader><DialogTitle>Rechazar solicitud</DialogTitle>
            <DialogDescription>Se cancelará el alta y se avisará al cliente por email.</DialogDescription>
          </DialogHeader>
          <Textarea data-testid="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo del rechazo (documentación ilegible, datos incorrectos…)" />
          <DialogFooter>
            <Button data-testid="confirm-reject-btn" variant="outline" className="rounded-full text-destructive border-destructive/30" onClick={reject} disabled={busy}>Confirmar rechazo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ l, v }) {
  return <div className="rounded-md border border-border/60 p-2.5"><p className="text-[11px] uppercase text-muted-foreground">{l}</p><p className="font-medium break-words">{v || "—"}</p></div>;
}

function DocThumb({ label, id }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!id) return;
    let active = true;
    api.get(`/files/${id}`, { responseType: "blob" }).then((r) => {
      if (active) setUrl(URL.createObjectURL(r.data));
    }).catch(() => {});
    return () => { active = false; };
  }, [id]);
  return (
    <div className="block" data-testid={`doc-${label}`}>
      <div className="h-28 w-full rounded-md border border-border bg-muted grid place-items-center overflow-hidden">
        {url ? <img src={url} alt={label} className="h-full w-full object-cover" />
          : <span className="text-[11px] text-muted-foreground">Cargando…</span>}
      </div>
      <p className="text-[11px] text-center text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
