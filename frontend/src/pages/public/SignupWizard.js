import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { apiErr } from "@/lib/api";
import { resizeImage } from "@/lib/img";
import CameraCapture from "@/components/CameraCapture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowRight, ArrowLeft, IdCard, CheckCircle2, Upload, Plus, Repeat, Send, Smartphone, QrCode } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const STEPS = ["Datos", "Tu línea", "Dirección y pago", "Documentos", "Confirmar"];

export default function SignupWizard() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [operators, setOperators] = useState([]);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    docType: "DNI", fiscalId: "", name: "", firstSurname: "", lastSurname: "", dob: "",
    contactPhone: "", email: "", address: "", city: "", postalCode: "", province: "",
    iban: "", bank: "", acceptedTerms: false, docFront: null, docBack: null, selfie: null,
    paymentMethod: "sepa", simType: "esim", simIcc: "",
    lineType: "new", donorOperatorId: "", portMsisdn: "", portIcc: "",
    currentHolderName: "", currentHolderFiscalId: "", changeHolder: false,
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => { api.get(`/public/products/${productId}`).then((r) => setProduct(r.data)).catch(() => navigate("/contratar")); }, [productId]);
  useEffect(() => { api.get("/public/donor-operators").then((r) => setOperators(r.data || [])).catch(() => {}); }, []);

  const uploadDoc = async (key, e) => {
    const file = e.target.files?.[0];
    if (file) set(key, await resizeImage(file));
  };

  const isMobile = product?.family === "Mobile";
  const isFiber = product?.family === "Fiber";
  const canPort = isMobile || isFiber;
  const isPort = f.lineType === "portability" || f.lineType === "portability_prepaid";

  const validStep = () => {
    if (step === 0) return f.fiscalId && f.name && f.email && f.contactPhone && f.dob;
    if (step === 1) {
      if (isPort && (!f.donorOperatorId || !f.portMsisdn)) return false;
      if (isMobile && f.simType === "physical" && !f.simIcc) return false;
      return true;
    }
    if (step === 2) return f.address && f.city && f.postalCode && f.province && (f.paymentMethod === "card" || f.iban);
    if (step === 3) return f.docFront && f.docBack && f.selfie;
    if (step === 4) return f.acceptedTerms;
    return true;
  };

  const next = () => { if (!validStep()) return toast.error("Completa los campos obligatorios"); setStep((s) => s + 1); };

  const submit = async () => {
    if (!f.acceptedTerms) return toast.error("Debes aceptar los términos");
    setSaving(true);
    try {
      const { data } = await api.post("/public/applications", { productId, ...f });
      toast.success("Solicitud creada. Ahora firma tu contrato.");
      navigate(`/firmar/${data.token}`);
    } catch (e) { toast.error(apiErr(e)); } finally { setSaving(false); }
  };

  if (!product) return <div className="min-h-screen grid place-items-center bg-background"><div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>;

  const lineTypeLabel = { new: "Número nuevo", portability: "Portabilidad", portability_prepaid: "Portabilidad prepago" }[f.lineType];
  const simTypeLabel = { esim: "eSIM", physical: "SIM física", ship: "Enviar SIM" }[f.simType];

  return (
    <div className="min-h-screen bg-background" data-testid="signup-wizard">
      <header className="border-b border-border glass sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5"><img src="https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png" alt="GoRoky" className="h-7 w-auto" /></div>
          <button onClick={() => navigate("/contratar")} className="text-sm text-muted-foreground hover:text-primary">Cambiar tarifa</button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 py-8">
        <div className="rounded-lg border border-border bg-accent/40 p-4 mb-6 flex items-center justify-between">
          <div><p className="text-sm text-muted-foreground">Contratando</p><p className="font-heading font-600">{product.productName}</p></div>
          <p className="font-heading text-2xl font-700">{product.price.toFixed(2)} €<span className="text-sm text-muted-foreground">/mes</span></p>
        </div>

        {/* progreso */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
              <p className={`text-xs mt-1.5 ${i === step ? "text-primary font-semibold" : "text-muted-foreground"}`}>{s}</p>
            </div>
          ))}
        </div>

        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="rounded-lg border border-border bg-card p-6">
          {step === 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo de documento</Label>
                <Select value={f.docType} onValueChange={(v) => set("docType", v)}>
                  <SelectTrigger data-testid="doc-type-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DNI">DNI</SelectItem>
                    <SelectItem value="NIE">NIE</SelectItem>
                    <SelectItem value="PASSPORT">Pasaporte</SelectItem>
                    <SelectItem value="RED_CARD">Tarjeta roja / documento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Nº documento *</Label><Input data-testid="w-fiscalId" value={f.fiscalId} onChange={(e) => set("fiscalId", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Nombre *</Label><Input data-testid="w-name" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Apellidos</Label><Input data-testid="w-surname" value={f.firstSurname} onChange={(e) => set("firstSurname", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Fecha de nacimiento *</Label><Input data-testid="w-dob" type="date" value={f.dob} onChange={(e) => set("dob", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Teléfono de contacto *</Label><Input data-testid="w-phone" value={f.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Email *</Label><Input data-testid="w-email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              {canPort && (
                <div>
                  <Label className="mb-2 block">Selecciona el tipo de línea *</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <LineOpt testid="lt-new" active={f.lineType === "new"} onClick={() => set("lineType", "new")}
                      icon={Plus} title="Número nuevo" desc="Se asignará un número nuevo" />
                    <LineOpt testid="lt-port" active={f.lineType === "portability"} onClick={() => set("lineType", "portability")}
                      icon={Repeat} title="Portabilidad" desc="Conserva tu número actual" />
                    {isMobile && (
                      <LineOpt testid="lt-port-prepaid" active={f.lineType === "portability_prepaid"} onClick={() => set("lineType", "portability_prepaid")}
                        icon={Repeat} title="Portabilidad prepago" desc="Tu número prepago" />
                    )}
                  </div>
                </div>
              )}

              {isPort && (
                <div className="rounded-lg border border-border bg-accent/30 p-4 grid grid-cols-2 gap-4">
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <Label>Operador actual (donante) *</Label>
                    <Select value={f.donorOperatorId} onValueChange={(v) => set("donorOperatorId", v)}>
                      <SelectTrigger data-testid="w-donor"><SelectValue placeholder="Selecciona operador" /></SelectTrigger>
                      <SelectContent>
                        {operators.map((o) => <SelectItem key={o.Code} value={o.Code}>{o.Name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 col-span-2 sm:col-span-1"><Label>Número a portar *</Label><Input data-testid="w-port-msisdn" value={f.portMsisdn} onChange={(e) => set("portMsisdn", e.target.value)} placeholder={isMobile ? "6XXXXXXXX" : "9XXXXXXXX"} /></div>
                  <div className="space-y-1.5 col-span-2"><Label>ICC de la SIM actual (opcional)</Label><Input data-testid="w-port-icc" value={f.portIcc} onChange={(e) => set("portIcc", e.target.value)} placeholder="8934..." /></div>

                  <div className="col-span-2 border-t border-border/60 pt-3">
                    <label className="flex items-start gap-3 cursor-pointer mb-3">
                      <Checkbox data-testid="w-change-holder" checked={f.changeHolder} onCheckedChange={(v) => set("changeHolder", !!v)} className="mt-0.5" />
                      <span className="text-sm text-muted-foreground">El número está a nombre de <b className="text-foreground">otra persona</b> (cambio de titular)</span>
                    </label>
                    {f.changeHolder && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5"><Label>Nombre del titular actual</Label><Input data-testid="w-holder-name" value={f.currentHolderName} onChange={(e) => set("currentHolderName", e.target.value)} /></div>
                        <div className="space-y-1.5"><Label>NIF/NIE del titular actual</Label><Input data-testid="w-holder-fiscal" value={f.currentHolderFiscalId} onChange={(e) => set("currentHolderFiscalId", e.target.value)} /></div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isMobile && (
                <div>
                  <Label className="mb-2 block">Selecciona el tipo de SIM *</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <LineOpt testid="sim-esim" active={f.simType === "esim"} onClick={() => set("simType", "esim")}
                      icon={QrCode} title="eSIM" desc="Activación por QR (email)" />
                    <LineOpt testid="sim-physical" active={f.simType === "physical"} onClick={() => set("simType", "physical")}
                      icon={Smartphone} title="SIM física" desc="Ya tengo la SIM (ICC)" />
                    <LineOpt testid="sim-ship" active={f.simType === "ship"} onClick={() => set("simType", "ship")}
                      icon={Send} title="Enviar SIM" desc="Envío a tu domicilio" />
                  </div>
                  {f.simType === "physical" && (
                    <div className="space-y-1.5 mt-3"><Label>ICC de la SIM física *</Label><Input data-testid="w-sim-icc" value={f.simIcc} onChange={(e) => set("simIcc", e.target.value)} placeholder="8934..." /></div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2"><Label>Dirección *</Label><Input data-testid="w-address" value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Calle, número, piso" /></div>
              <div className="space-y-1.5"><Label>Ciudad *</Label><Input data-testid="w-city" value={f.city} onChange={(e) => set("city", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Código postal *</Label><Input data-testid="w-postal" value={f.postalCode} onChange={(e) => set("postalCode", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Provincia *</Label><Input data-testid="w-province" value={f.province} onChange={(e) => set("province", e.target.value)} /></div>

              <div className="col-span-2 mt-2">
                <Label className="mb-2 block">Método de pago *</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" data-testid="pay-sepa" onClick={() => set("paymentMethod", "sepa")}
                    className={`rounded-lg border p-3 text-left transition ${f.paymentMethod === "sepa" ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border"}`}>
                    <p className="font-medium text-sm">Domiciliación SEPA</p>
                    <p className="text-xs text-muted-foreground">Cobro mensual en tu cuenta bancaria</p>
                  </button>
                  <button type="button" data-testid="pay-card" onClick={() => set("paymentMethod", "card")}
                    className={`rounded-lg border p-3 text-left transition ${f.paymentMethod === "card" ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border"}`}>
                    <p className="font-medium text-sm">Tarjeta</p>
                    <p className="text-xs text-muted-foreground">Cobro mensual automático a tu tarjeta</p>
                  </button>
                </div>
              </div>

              {f.paymentMethod === "sepa" && (
                <>
                  <div className="space-y-1.5"><Label>Banco</Label><Input data-testid="w-bank" value={f.bank} onChange={(e) => set("bank", e.target.value)} /></div>
                  <div className="space-y-1.5 col-span-2"><Label>IBAN (cuenta bancaria) *</Label><Input data-testid="w-iban" value={f.iban} onChange={(e) => set("iban", e.target.value)} placeholder="ES.." /></div>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <DocSlot label="Documento (anverso) *" value={f.docFront} onFile={(e) => uploadDoc("docFront", e)} onClear={() => set("docFront", null)} testid="doc-front" />
                <DocSlot label="Documento (reverso) *" value={f.docBack} onFile={(e) => uploadDoc("docBack", e)} onClear={() => set("docBack", null)} testid="doc-back" />
              </div>
              <div>
                <Label className="mb-2 block">Selfie de verificación *</Label>
                <CameraCapture value={f.selfie} onChange={(v) => set("selfie", v)} testid="selfie" />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-heading font-600">Revisa tus datos</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Info l="Titular" v={`${f.name} ${f.firstSurname}`} />
                <Info l="Documento" v={`${f.docType} ${f.fiscalId}`} />
                <Info l="Nacimiento" v={f.dob} />
                <Info l="Teléfono" v={f.contactPhone} />
                <Info l="Email" v={f.email} />
                <Info l="Dirección" v={`${f.address}, ${f.postalCode} ${f.city}`} />
                {canPort && <Info l="Tipo de línea" v={lineTypeLabel} />}
                {isPort && <Info l="Nº a portar" v={f.portMsisdn} />}
                {isPort && <Info l="Operador donante" v={operators.find((o) => o.Code === f.donorOperatorId)?.Name || f.donorOperatorId} />}
                {isPort && f.changeHolder && <Info l="Titular actual" v={`${f.currentHolderName} (${f.currentHolderFiscalId})`} />}
                <Info l="IBAN" v={f.iban} />
                <Info l="Método de pago" v={f.paymentMethod === "card" ? "Tarjeta" : "Domiciliación SEPA"} />
                {isMobile && <Info l="Tipo SIM" v={simTypeLabel} />}
                {isMobile && f.simType === "physical" && <Info l="ICC SIM" v={f.simIcc} />}
              </div>
              <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer">
                <Checkbox data-testid="accept-terms" checked={f.acceptedTerms} onCheckedChange={(v) => set("acceptedTerms", !!v)} className="mt-0.5" />
                <span className="text-sm text-muted-foreground">Acepto los <b className="text-foreground">términos y condiciones</b>, la política de privacidad y el tratamiento de mis datos para la contratación del servicio.</span>
              </label>
            </div>
          )}

          <div className="flex justify-between mt-8">
            <Button type="button" variant="outline" className="rounded-full gap-1.5" onClick={() => step === 0 ? navigate("/contratar") : setStep((s) => s - 1)} data-testid="wizard-back">
              <ArrowLeft size={15} /> Atrás
            </Button>
            {step < 4 ? (
              <Button type="button" className="rounded-full gap-1.5" onClick={next} data-testid="wizard-next">Siguiente <ArrowRight size={15} /></Button>
            ) : (
              <Button type="button" className="rounded-full gap-1.5" disabled={saving || !f.acceptedTerms} onClick={submit} data-testid="wizard-submit">{saving ? "Enviando…" : "Crear y firmar"} <CheckCircle2 size={15} /></Button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function LineOpt({ active, onClick, icon: Icon, title, desc, testid }) {
  return (
    <button type="button" data-testid={testid} onClick={onClick}
      className={`rounded-lg border p-4 text-left transition ${active ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border hover:bg-muted"}`}>
      <Icon size={18} className={active ? "text-primary mb-2" : "text-muted-foreground mb-2"} />
      <p className="font-medium text-sm">{title}</p>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </button>
  );
}

function DocSlot({ label, value, onFile, onClear, testid }) {
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      {value ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <img src={value} alt={label} className="w-full h-36 object-cover" data-testid={`${testid}-preview`} />
          <div className="p-2 bg-card flex justify-between items-center">
            <span className="text-xs text-success flex items-center gap-1"><CheckCircle2 size={13} /> Subido</span>
            <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={onClear}>Quitar</button>
          </div>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center h-36 rounded-lg border-2 border-dashed border-border cursor-pointer hover:bg-muted transition-colors">
          <IdCard size={26} className="text-muted-foreground mb-2" />
          <span className="text-xs text-muted-foreground flex items-center gap-1"><Upload size={12} /> Subir imagen</span>
          <input type="file" accept="image/*" className="hidden" onChange={onFile} data-testid={`${testid}-input`} />
        </label>
      )}
    </div>
  );
}

function Info({ l, v }) {
  return <div className="border-b border-border/60 pb-1.5"><span className="text-muted-foreground text-xs">{l}</span><p className="font-medium">{v || "—"}</p></div>;
}
