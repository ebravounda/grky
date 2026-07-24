import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import api, { apiErr, openInvoicePdf, openContractPdf } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, StatusPill } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Signal, Wifi, FileText, User, FolderUp, UserCog, Plus, CheckCircle2, Package,
  ShieldCheck, FileSignature, CreditCard, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

const DOC_TYPES = [
  { v: "DNI_FRONT", l: "DNI/NIE anverso" },
  { v: "DNI_BACK", l: "DNI/NIE reverso" },
  { v: "IAE", l: "Alta IAE (autónomos)" },
  { v: "DEED", l: "Escrituras (sociedad)" },
  { v: "CIF", l: "Tarjeta CIF" },
  { v: "OTHER", l: "Otro" },
];

export default function CustomerDetail() {
  const { fiscalId } = useParams();
  const { hasPerm } = useAuth();
  const [data, setData] = useState(null);
  const [docs, setDocs] = useState([]);
  const [kyc, setKyc] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [docType, setDocType] = useState("DNI_FRONT");
  const fileRef = useRef();
  const [titularOpen, setTitularOpen] = useState(false);
  const [titularSub, setTitularSub] = useState(null);
  const [newTitular, setNewTitular] = useState("");
  const [optOpen, setOptOpen] = useState(false);
  const [optSub, setOptSub] = useState(null);
  const [optList, setOptList] = useState([]);
  const [optSel, setOptSel] = useState("");
  const [chargeOpen, setChargeOpen] = useState(false);
  const [charge, setCharge] = useState({ concept: "", amount: "", method: "card" });
  const [charging, setCharging] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = () => api.get(`/customers/${fiscalId}`).then((r) => setData(r.data));
  const loadDocs = () => api.get(`/customers/${fiscalId}/documents`).then((r) => setDocs(r.data));
  useEffect(() => { load(); loadDocs(); api.get("/customers").then((r) => setCustomers(r.data)); api.get(`/customers/${fiscalId}/kyc`).then((r) => setKyc(r.data)).catch(() => {}); }, [fiscalId]);
  if (!data) return <div className="text-muted-foreground">Cargando…</div>;

  const { customer, lines, subscriptions, invoices } = data;

  const doCharge = async () => {
    const amount = parseFloat(charge.amount);
    if (!charge.concept || !amount || amount <= 0) return toast.error("Indica concepto e importe válidos");
    setCharging(true);
    try {
      const { data: res } = await api.post(`/customers/${fiscalId}/charge`, {
        concept: charge.concept, amount, method: charge.method, origin_url: window.location.origin,
      });
      if (res.status === "paid") {
        toast.success(`Cobrado ${amount.toFixed(2)} € · Factura ${res.invoiceNumber} enviada por email`);
      } else {
        toast.success(`Factura ${res.invoiceNumber} creada y enviada. Enlace de pago generado.`);
        if (res.checkout_url) window.open(res.checkout_url, "_blank");
      }
      setChargeOpen(false); setCharge({ concept: "", amount: "", method: "card" });
      load();
    } catch (e) { toast.error(apiErr(e)); } finally { setCharging(false); }
  };

  const syncLikes = async () => {
    setSyncing(true);
    try {
      const { data: res } = await api.post(`/customers/${fiscalId}/sync-likes`);
      if (res.synced) {
        toast.success(`Alta sincronizada con Likes${res.likesOrderId ? ` · Orden ${res.likesOrderId}` : ""}`);
      } else {
        toast.warning("Likes respondió pero el alta no se completó. Revisa el log.");
      }
      if (res.log?.length) console.log("Likes sync log:", res.log);
      // traer estado real (órdenes, líneas, consumos, SVAs, portabilidades)
      try { await api.post(`/customers/${fiscalId}/reconcile`); } catch (_) {}
      load();
    } catch (e) { toast.error(apiErr(e)); } finally { setSyncing(false); }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = String(reader.result).split(",")[1];
      try {
        await api.post(`/customers/${fiscalId}/documents`, { type: docType, filename: file.name, contentBase64: b64 });
        toast.success("Documento subido");
        loadDocs();
      } catch (err) { toast.error(apiErr(err)); }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const openTitular = (sub) => { setTitularSub(sub); setNewTitular(""); setTitularOpen(true); };
  const confirmTitular = async () => {
    if (!newTitular) return;
    try {
      await api.post("/subscriptions/change-titular", { subscriptionId: titularSub.subscriptionId, newFiscalId: newTitular });
      toast.success("Titular cambiado");
      setTitularOpen(false); load();
    } catch (e) { toast.error(apiErr(e)); }
  };

  const openOpt = async (sub) => {
    setOptSub(sub); setOptSel("");
    const { data: list } = await api.get(`/subscriptions/${sub.subscriptionId}/optional-products`);
    setOptList(list); setOptOpen(true);
  };
  const confirmOpt = async () => {
    if (!optSel) return;
    try {
      await api.post("/subscriptions/add-optional", { subscriptionId: optSub.subscriptionId, productId: optSel });
      toast.success("Bono/opcional añadido");
      setOptOpen(false); load();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const removeOpt = async (sub, productId) => {
    try { await api.post("/subscriptions/terminate-optional", { subscriptionId: sub.subscriptionId, productId }); toast.success("Opcional eliminado"); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div data-testid="customer-detail">
      <Link to="/app/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-4"><ArrowLeft size={15} /> Clientes</Link>
      <PageHeader overline={customer.customerType} title={`${customer.name} ${customer.firstSurname || ""}`} subtitle={`NIF/NIE: ${customer.fiscalId}`}
        action={hasPerm("billing.manage") && (
          <div className="flex gap-2">
            <Button data-testid="sync-likes-btn" variant="outline" className="rounded-full gap-2" onClick={syncLikes} disabled={syncing}>
              <RefreshCw size={16} className={syncing ? "animate-spin" : ""} /> {syncing ? "Sincronizando…" : "Sincronizar con Likes"}
            </Button>
            <Button data-testid="open-charge-btn" className="rounded-full gap-2" onClick={() => setChargeOpen(true)}>
              <CreditCard size={16} /> Cobrar servicio
            </Button>
          </div>
        )}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="rounded-lg border border-border bg-card p-6 space-y-3">
          <div className="flex items-center gap-2 text-primary"><User size={18} /><h3 className="font-heading font-600 text-foreground">Datos de contacto</h3></div>
          <Row l="Email" v={customer.email} />
          <Row l="Teléfono" v={customer.contactPhone} />
          <Row l="IBAN" v={customer.iban} />
          <Row l="Método de pago" v={customer.paymentMethod} />
          <Row l="Dirección" v={`${customer.billingAddress?.street || ""} ${customer.billingAddress?.streetNumber || ""}`} />
          <Row l="Ciudad" v={`${customer.billingAddress?.postalCode || ""} ${customer.billingAddress?.cityName || ""}`} />
        </div>

        <div className="rounded-lg border border-border bg-card p-6 lg:col-span-2">
          <h3 className="font-heading font-600 mb-4">Líneas y servicios ({lines.length})</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {lines.map((l) => (
              <Link key={l.id} to={`/app/lines/${l.lineNumber}`} data-testid={`cust-line-${l.lineNumber}`} className="rounded-lg border border-border p-4 card-hover block">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {l.family === "Mobile" ? <Signal size={16} className="text-primary" /> : <Wifi size={16} className="text-primary" />}{l.lineNumber}
                  </span>
                  <StatusPill status={l.status} />
                </div>
                <p className="text-sm text-muted-foreground mt-2">{l.productName}</p>
                <p className="text-sm font-semibold mt-1">{l.price?.toFixed(2)} €/mes {l.eSim && <span className="text-xs text-primary">· eSIM</span>}</p>
              </Link>
            ))}
            {lines.length === 0 && <p className="text-sm text-muted-foreground">Sin líneas contratadas.</p>}
          </div>
        </div>

        {/* Suscripciones + bonos + titular */}
        <div className="rounded-lg border border-border bg-card p-6 lg:col-span-3">
          <div className="flex items-center gap-2 text-primary mb-4"><Package size={18} /><h3 className="font-heading font-600 text-foreground">Suscripciones ({subscriptions.length})</h3></div>
          <div className="space-y-3">
            {subscriptions.map((s) => (
              <div key={s.id} data-testid={`subscription-${s.subscriptionId}`} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{s.family === "Mobile" ? "Móvil" : s.family === "Fiber" ? "Fibra" : s.family} · {s.products?.[0]?.lineNumber}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {s.products?.map((p, i) => (
                        <span key={i} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${p.type === "Optional" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                          {p.productName}
                          {p.type === "Optional" && <button data-testid={`remove-opt-${p.productId}`} onClick={() => removeOpt(s, p.productId)} className="ml-1 hover:text-destructive">×</button>}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button data-testid={`add-opt-${s.subscriptionId}`} variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => openOpt(s)}><Plus size={13} /> Bono/opcional</Button>
                    <Button data-testid={`titular-${s.subscriptionId}`} variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => openTitular(s)}><UserCog size={13} /> Cambiar titular</Button>
                  </div>
                </div>
              </div>
            ))}
            {subscriptions.length === 0 && <p className="text-sm text-muted-foreground">Sin suscripciones.</p>}
          </div>
        </div>

        {/* Documentación */}
        <div className="rounded-lg border border-border bg-card p-6 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 text-primary"><FolderUp size={18} /><h3 className="font-heading font-600 text-foreground">Documentación</h3></div>
            <div className="flex items-center gap-2">
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger data-testid="doc-type" className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>{DOC_TYPES.map((d) => <SelectItem key={d.v} value={d.v}>{d.l}</SelectItem>)}</SelectContent>
              </Select>
              <input ref={fileRef} type="file" className="hidden" data-testid="doc-file-input" onChange={onFile} />
              <Button data-testid="upload-doc-btn" className="rounded-full gap-2" onClick={() => fileRef.current?.click()}><FolderUp size={15} /> Subir</Button>
            </div>
          </div>
          {docs.length === 0 ? <p className="text-sm text-muted-foreground">Sin documentos subidos.</p> : (
            <div className="divide-y divide-border">
              {docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="flex items-center gap-2"><CheckCircle2 size={15} className="text-success" /> {DOC_TYPES.find((t) => t.v === d.type)?.l || d.type} — <span className="text-muted-foreground">{d.filename}</span></span>
                  <span className="text-xs text-muted-foreground">{d.uploadedAt?.slice(0, 10)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Verificación / KYC */}
        {kyc && kyc.kyc && (
          <div data-testid="kyc-section" className="rounded-lg border border-border bg-card p-6 lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2 text-primary"><ShieldCheck size={18} /><h3 className="font-heading font-600 text-foreground">Verificación de identidad (KYC)</h3></div>
              {kyc.contractOrderId && (
                <Button data-testid="kyc-contract-btn" variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => openContractPdf(kyc.contractOrderId)}>
                  <FileSignature size={14} /> Contrato {kyc.contractCode}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 text-sm">
              <Row l="Código contrato" v={kyc.contractCode} />
              <Row l="Firmado" v={kyc.signedAt?.slice(0, 10)} />
              <Row l="Tipo doc." v={kyc.kyc.docType} />
              <Row l="Nacimiento" v={kyc.kyc.dob} />
              <Row l="IBAN" v={kyc.kyc.iban} />
              <Row l="Banco" v={kyc.kyc.bank} />
              <Row l="Firmante" v={kyc.kyc.signerName} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KycImage fileId={kyc.kyc.selfieId} label="Selfie" testid="kyc-selfie" />
              <KycImage fileId={kyc.kyc.fileIds?.front} label="Documento anverso" testid="kyc-front" />
              <KycImage fileId={kyc.kyc.fileIds?.back} label="Documento reverso" testid="kyc-back" />
              <KycImage fileId={kyc.kyc.signatureId} label="Firma" testid="kyc-signature" contain />
            </div>
          </div>
        )}

        {/* Facturas */}
        <div className="rounded-lg border border-border bg-card p-6 lg:col-span-3">
          <h3 className="font-heading font-600 mb-4">Facturas ({invoices.length})</h3>
          <div className="divide-y divide-border">
            {invoices.map((i) => (
              <div key={i.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <FileText size={18} className="text-muted-foreground" />
                  <div><p className="text-sm font-medium">{i.invoiceNumber}</p><p className="text-xs text-muted-foreground">{i.date?.slice(0, 10)}</p></div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-sm">{i.total.toFixed(2)} €</span>
                  <StatusPill status={i.status} />
                  <button data-testid={`inv-pdf-${i.invoiceNumber}`} onClick={() => openInvoicePdf(i.id)} className="text-sm text-primary hover:underline">PDF</button>
                </div>
              </div>
            ))}
            {invoices.length === 0 && <p className="text-sm text-muted-foreground">Sin facturas.</p>}
          </div>
        </div>
      </div>

      <Dialog open={titularOpen} onOpenChange={setTitularOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cambio de titular</DialogTitle><DialogDescription>Transfiere la suscripción y sus líneas a otro cliente.</DialogDescription></DialogHeader>
          <div className="space-y-1.5">
            <Label>Nuevo titular</Label>
            <Select value={newTitular} onValueChange={setNewTitular}>
              <SelectTrigger data-testid="new-titular-select"><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
              <SelectContent>{customers.filter((c) => c.fiscalId !== fiscalId).map((c) => <SelectItem key={c.fiscalId} value={c.fiscalId}>{c.name} {c.firstSurname} — {c.fiscalId}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter><Button data-testid="confirm-titular-btn" onClick={confirmTitular} className="rounded-full">Confirmar cambio</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={optOpen} onOpenChange={setOptOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Añadir bono / opcional</DialogTitle><DialogDescription>Productos opcionales compatibles con esta suscripción.</DialogDescription></DialogHeader>
          <div className="space-y-1.5">
            <Label>Producto opcional</Label>
            <Select value={optSel} onValueChange={setOptSel}>
              <SelectTrigger data-testid="opt-select"><SelectValue placeholder="Selecciona bono/opcional" /></SelectTrigger>
              <SelectContent>{optList.map((o) => <SelectItem key={o.productId} value={o.productId}>{o.productName} — {o.price.toFixed(2)} €</SelectItem>)}</SelectContent>
            </Select>
            {optList.length === 0 && <p className="text-xs text-muted-foreground">No hay opcionales compatibles. Crea tarifas de tipo "Opcional" en Tarifas.</p>}
          </div>
          <DialogFooter><Button data-testid="confirm-opt-btn" onClick={confirmOpt} className="rounded-full">Añadir</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={chargeOpen} onOpenChange={setChargeOpen}>
        <DialogContent data-testid="charge-dialog">
          <DialogHeader>
            <DialogTitle>Cobrar servicio adicional</DialogTitle>
            <DialogDescription>Se emite una factura y se envía por email. Con tarjeta guardada el cobro es inmediato; con SEPA/sin tarjeta se genera un enlace de pago.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Concepto</Label>
              <Input data-testid="charge-concept" value={charge.concept} onChange={(e) => setCharge((c) => ({ ...c, concept: e.target.value }))} placeholder="Ej. Router WiFi 6, instalación, portabilidad…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Importe (€ con IVA)</Label>
                <Input data-testid="charge-amount" type="number" step="0.01" min="0" value={charge.amount} onChange={(e) => setCharge((c) => ({ ...c, amount: e.target.value }))} placeholder="19.99" />
              </div>
              <div className="space-y-1.5">
                <Label>Método</Label>
                <Select value={charge.method} onValueChange={(v) => setCharge((c) => ({ ...c, method: v }))}>
                  <SelectTrigger data-testid="charge-method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card">Tarjeta guardada (cobro inmediato)</SelectItem>
                    <SelectItem value="sepa">SEPA / enlace de pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {charge.amount > 0 && (
              <p className="text-xs text-muted-foreground">Base sin IVA: <b>{(parseFloat(charge.amount) / 1.21).toFixed(2)} €</b> · IVA 21%: <b>{(parseFloat(charge.amount) - parseFloat(charge.amount) / 1.21).toFixed(2)} €</b></p>
            )}
          </div>
          <DialogFooter>
            <Button data-testid="confirm-charge-btn" onClick={doCharge} disabled={charging} className="rounded-full">{charging ? "Procesando…" : "Cobrar y facturar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

function KycImage({ fileId, label, testid, contain }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!fileId) return;
    let active = true;
    api.get(`/files/${fileId}`, { responseType: "blob" }).then((r) => {
      if (active) setUrl(URL.createObjectURL(r.data));
    }).catch(() => {});
    return () => { active = false; };
  }, [fileId]);
  return (
    <div data-testid={testid}>
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      <div className="rounded-lg border border-border bg-muted h-32 overflow-hidden grid place-items-center">
        {url ? <img src={url} alt={label} className={`w-full h-full ${contain ? "object-contain bg-white" : "object-cover"}`} />
          : <span className="text-xs text-muted-foreground">No disponible</span>}
      </div>
    </div>
  );
}
