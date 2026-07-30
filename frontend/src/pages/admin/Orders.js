import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiErr, openInvoicePdf, openContractPdf, openLikesSignedContract } from "@/lib/api";
import { PageHeader, StatusPill } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ShoppingCart, FileText, Send, FileSignature, PenLine, CheckCircle2, XCircle, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [donors, setDonors] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ fiscalId: "", productId: "", portability: false, portabilityType: "postpaid", donorOperatorId: "", lineNumber: "", simType: "esim", simIcc: "", changeHolder: false, currentHolderName: "", currentHolderFirstSurname: "", currentHolderLastSurname: "", currentHolderFiscalId: "", currentHolderDocType: "DNI" });

  const loadOrders = () => api.get("/orders").then((r) => setOrders(r.data));
  useEffect(() => {
    loadOrders();
    api.get("/customers").then((r) => setCustomers(r.data));
    api.get("/products").then((r) => setProducts(r.data.filter((p) => p.type === "Main")));
    api.get("/donor-operators").then((r) => setDonors(r.data));
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const selectedProduct = products.find((p) => p.productId === form.productId);
  const isMobile = selectedProduct?.family === "Mobile";

  const sendTracking = async (o) => {
    try { const { data } = await api.post(`/orders/${o.orderId}/send-tracking`); toast.success(`Seguimiento enviado a ${data.to}`); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const sign = async (o) => {
    try { await api.post(`/orders/${o.orderId}/contract/sign`); toast.success("Contrato firmado"); loadOrders(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const sendSignEmail = async (o) => {
    try { const { data } = await api.post(`/orders/${o.orderId}/send-signature-email`); toast.success(`Correo de firma enviado a ${data.to}`); loadOrders(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const openLikesContract = async (o) => {
    try { await openLikesSignedContract(o.orderId); }
    catch (e) { toast.error(apiErr(e) || "Aún no hay contrato firmado en Likes"); }
  };

  const approveSignature = async (o) => {
    try { await api.post(`/orders/${o.orderId}/approve-signature`); toast.success("Firma aprobada · sincronizando con Likes"); loadOrders(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const removeOrder = async (o) => {
    if (!window.confirm(`¿Eliminar la orden ${o.contractNumber || o.orderId} del CRM? (No afecta a Likes; sirve para limpiar altas manuales/de prueba.)`)) return;
    try { await api.post(`/orders/${encodeURIComponent(o.orderId)}/delete`); toast.success("Orden eliminada del CRM"); loadOrders(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const activate = async (o) => {
    try { await api.post(`/orders/${o.orderId}/activate`); toast.success("Línea activada · email de bienvenida enviado"); loadOrders(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const cancel = async (o) => {
    try { await api.post(`/orders/${o.orderId}/cancel`); toast.success("Orden cancelada · línea suspendida"); loadOrders(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const showPins = async (o) => {
    if (!o.lineNumber) return toast.error("Esta orden no tiene línea");
    try {
      const { data } = await api.get(`/lines/${o.lineNumber}/sim`);
      toast.info(`PIN ${data.pin} · PUK ${data.puk} · PIN2 ${data.pin2} · PUK2 ${data.puk2}`, { duration: 10000 });
    } catch (e) { toast.error(apiErr(e)); }
  };

  const submit = async () => {
    if (!form.fiscalId || !form.productId) return toast.error("Selecciona cliente y producto");
    setSaving(true);
    try {
      const { data } = await api.post("/orders", form);
      toast.success(`Servicio creado · Factura ${data.invoiceNumber} y contrato ${data.contractNumber} generados`, {
        action: { label: "Ver factura", onClick: () => openInvoicePdf(data.invoiceId) },
      });
      setOpen(false);
      setForm({ fiscalId: "", productId: "", portability: false, portabilityType: "postpaid", donorOperatorId: "", lineNumber: "", simType: "esim", simIcc: "", changeHolder: false, currentHolderName: "", currentHolderFirstSurname: "", currentHolderLastSurname: "", currentHolderFiscalId: "", currentHolderDocType: "DNI" });
      loadOrders();
    } catch (e) { toast.error(apiErr(e)); } finally { setSaving(false); }
  };

  return (
    <div data-testid="orders-page">
      <PageHeader
        overline="Venta" title="Contratación" subtitle="Da de alta servicios. Cada alta genera una factura PDF automáticamente."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="new-order-btn" className="rounded-full gap-2"><ShoppingCart size={16} /> Nueva contratación</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Crear servicio / orden</DialogTitle>
                <DialogDescription>Al crear el servicio se genera automáticamente la factura PDF.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Cliente</Label>
                  <Select value={form.fiscalId} onValueChange={(v) => set("fiscalId", v)}>
                    <SelectTrigger data-testid="order-customer"><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => <SelectItem key={c.fiscalId} value={c.fiscalId}>{c.name} {c.firstSurname} — {c.fiscalId}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Producto / tarifa</Label>
                  <Select value={form.productId} onValueChange={(v) => set("productId", v)}>
                    <SelectTrigger data-testid="order-product"><SelectValue placeholder="Selecciona producto" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => <SelectItem key={p.productId} value={p.productId}>{p.productName} — {p.price.toFixed(2)} €</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <div><p className="text-sm font-medium">Portabilidad</p><p className="text-xs text-muted-foreground">El cliente trae su número</p></div>
                  <Switch data-testid="order-portability" checked={form.portability} onCheckedChange={(v) => set("portability", v)} />
                </div>
                {form.portability && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Número a portar</Label>
                      <Input data-testid="order-port-number" inputMode="numeric" maxLength={9} placeholder="612345678"
                        value={form.lineNumber} onChange={(e) => set("lineNumber", e.target.value.replace(/\D/g, ""))} />
                      <p className="text-xs text-muted-foreground">Número que el cliente quiere conservar (9 dígitos).</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Operador donante</Label>
                      <Select value={form.donorOperatorId} onValueChange={(v) => set("donorOperatorId", v)}>
                        <SelectTrigger data-testid="order-donor"><SelectValue placeholder="Operador de origen" /></SelectTrigger>
                        <SelectContent>
                          {donors.map((d) => <SelectItem key={d.Code} value={d.Code}>{d.Name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Titularidad de la línea (igual que Likes) */}
                    <div className="space-y-1.5">
                      <Label>Titularidad de la línea</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" data-testid="order-keep-holder"
                          onClick={() => set("changeHolder", false)}
                          className={`rounded-md border p-3 text-left text-sm ${!form.changeHolder ? "border-primary ring-1 ring-primary" : "border-border"}`}>
                          <p className="font-medium">Mantener titular</p>
                          <p className="text-xs text-muted-foreground">El titular en la otra compañía es el mismo</p>
                        </button>
                        <button type="button" data-testid="order-change-holder"
                          onClick={() => set("changeHolder", true)}
                          className={`rounded-md border p-3 text-left text-sm ${form.changeHolder ? "border-primary ring-1 ring-primary" : "border-border"}`}>
                          <p className="font-medium">Cambiar titular</p>
                          <p className="text-xs text-muted-foreground">El número está a nombre de otra persona</p>
                        </button>
                      </div>
                    </div>
                    {form.changeHolder && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-md border border-border p-3">
                        <div className="space-y-1.5">
                          <Label>Tipo de documento</Label>
                          <Select value={form.currentHolderDocType} onValueChange={(v) => set("currentHolderDocType", v)}>
                            <SelectTrigger data-testid="order-holder-doctype"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="DNI">DNI</SelectItem>
                              <SelectItem value="NIE">NIE</SelectItem>
                              <SelectItem value="Passport">Pasaporte</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Documento (NIF/NIE/Pasaporte)</Label>
                          <Input data-testid="order-holder-fiscal" placeholder="00000000X"
                            value={form.currentHolderFiscalId} onChange={(e) => set("currentHolderFiscalId", e.target.value.toUpperCase())} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Nombre</Label>
                          <Input data-testid="order-holder-name" placeholder="Nombre"
                            value={form.currentHolderName} onChange={(e) => set("currentHolderName", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Primer apellido</Label>
                          <Input data-testid="order-holder-surname1" placeholder="Primer apellido"
                            value={form.currentHolderFirstSurname} onChange={(e) => set("currentHolderFirstSurname", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Segundo apellido</Label>
                          <Input data-testid="order-holder-surname2" placeholder="Segundo apellido"
                            value={form.currentHolderLastSurname} onChange={(e) => set("currentHolderLastSurname", e.target.value)} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* Tipo de SIM (solo móvil, igual que Likes) */}
                {isMobile && (
                  <div className="space-y-1.5">
                    <Label>Tipo de SIM</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { v: "physical", l: "SIM física" },
                        { v: "esim", l: "eSIM" },
                        { v: "ship", l: "Enviar SIM" },
                      ].map((o) => (
                        <button type="button" key={o.v} data-testid={`order-sim-${o.v}`}
                          onClick={() => set("simType", o.v)}
                          className={`rounded-md border p-2.5 text-center text-sm ${form.simType === o.v ? "border-primary ring-1 ring-primary" : "border-border"}`}>
                          {o.l}
                        </button>
                      ))}
                    </div>
                    {form.simType === "physical" && (
                      <div className="space-y-1.5 pt-1">
                        <Label>ICC de la SIM física</Label>
                        <Input data-testid="order-sim-icc" inputMode="numeric" placeholder="8934120000001234567"
                          value={form.simIcc} onChange={(e) => set("simIcc", e.target.value.replace(/\D/g, ""))} />
                      </div>
                    )}
                    {form.simType === "ship" && (
                      <p className="text-xs text-muted-foreground pt-1">Se enviará una SIM física; la línea quedará pendiente de envío hasta la entrega.</p>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button data-testid="submit-order-btn" onClick={submit} disabled={saving} className="rounded-full">{saving ? "Creando…" : "Crear y facturar"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Cliente</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Línea</th>
              <th className="px-4 py-3 font-medium">Importe</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Gestión</th>
              <th className="px-4 py-3 font-medium">Factura</th>
              <th className="px-4 py-3 font-medium">Contrato</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.map((o) => (
              <tr key={o.id} data-testid={`order-row-${o.orderId}`}>
                <td className="px-4 py-3 font-medium">{o.productName}</td>
                <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{o.customerName}</td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{o.lineNumber}</td>
                <td className="px-4 py-3 font-semibold">{o.price?.toFixed(2)} €</td>
                <td className="px-4 py-3"><StatusPill status={o.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {o.status === "PROVISIONING" && (
                      <>
                        <button data-testid={`order-activate-${o.orderId}`} onClick={() => activate(o)} title="Activar línea"
                          className="inline-flex items-center gap-1 rounded-full border border-success/30 text-success px-2 py-0.5 text-xs hover:bg-success/10">
                          <CheckCircle2 size={13} /> Activar
                        </button>
                        <button data-testid={`order-cancel-${o.orderId}`} onClick={() => cancel(o)} title="Cancelar orden"
                          className="inline-flex items-center gap-1 rounded-full border border-destructive/30 text-destructive px-2 py-0.5 text-xs hover:bg-destructive/10">
                          <XCircle size={13} /> Cancelar
                        </button>
                      </>
                    )}
                    {o.family === "Mobile" && o.lineNumber && (
                      <button data-testid={`order-pins-${o.orderId}`} onClick={() => showPins(o)} title="Ver PIN/PUK"
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary text-xs">
                        <KeyRound size={13} /> PIN/PUK
                      </button>
                    )}
                    {o.status === "COMPLETED" && o.family !== "Mobile" && <span className="text-xs text-success">✓ Activa</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button data-testid={`order-pdf-${o.orderId}`} onClick={() => openInvoicePdf(o.invoiceId)} className="inline-flex items-center gap-1 text-primary hover:underline">
                      <FileText size={14} /> {o.invoiceNumber}
                    </button>
                    <button data-testid={`order-track-${o.orderId}`} onClick={() => sendTracking(o)} title="Enviar seguimiento por email" className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary">
                      <Send size={14} />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <button data-testid={`order-contract-${o.orderId}`} onClick={() => openContractPdf(o.orderId)} className="inline-flex items-center gap-1 text-primary hover:underline">
                      <FileSignature size={14} /> {o.signed ? "Ver firmado" : "Contrato"}
                    </button>
                    {/* Sin firmar: firmar directo (admin) o enviar enlace al cliente */}
                    {!o.signed && (
                      <button data-testid={`order-sign-${o.orderId}`} onClick={() => sign(o)} title="Firmar directamente (admin)" className="inline-flex items-center gap-1 text-muted-foreground hover:text-success">
                        <PenLine size={14} /> Firmar
                      </button>
                    )}
                    {!o.signed && (
                      <button data-testid={`order-send-sign-${o.orderId}`} onClick={() => sendSignEmail(o)} title="Enviar correo de firma al cliente" className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary">
                        <Send size={14} /> Enviar firma
                      </button>
                    )}
                    {/* Firmado por el cliente, pendiente de aprobación del admin */}
                    {o.signed && !o.signApproved && (
                      <>
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 text-warning px-2 py-0.5 text-xs font-medium" data-testid={`order-pending-approval-${o.orderId}`}>
                          ⏳ Firmado · pendiente aprobar
                        </span>
                        <button data-testid={`order-approve-${o.orderId}`} onClick={() => approveSignature(o)} title="Aprobar firma y sincronizar con Likes"
                          className="inline-flex items-center gap-1 rounded-full border border-success/30 text-success px-2 py-0.5 text-xs hover:bg-success/10">
                          <CheckCircle2 size={13} /> Aprobar
                        </button>
                        <button data-testid={`order-resign-${o.orderId}`} onClick={() => sendSignEmail(o)} title="Volver a solicitar firma al cliente"
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary text-xs">
                          <Send size={13} /> Volver a solicitar
                        </button>
                      </>
                    )}
                    {/* Firma aprobada y sincronizada */}
                    {o.signed && o.signApproved && <span className="text-xs text-success font-medium" data-testid={`order-approved-${o.orderId}`}>✓ Firmado y aprobado</span>}
                    {/* Contrato realmente firmado en Likes (firma digital) */}
                    {o.signed && (
                      <button data-testid={`order-likes-contract-${o.orderId}`} onClick={() => openLikesContract(o)} title="Ver el contrato firmado en Likes"
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary text-xs">
                        <FileSignature size={13} /> Contrato firmado (Likes)
                      </button>
                    )}
                    <button data-testid={`order-delete-${o.orderId}`} onClick={() => removeOrder(o)} title="Eliminar orden del CRM"
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-red-500 text-xs ml-auto">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Aún no hay contrataciones.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
