import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Building2, Wifi, Mail, CreditCard, CheckCircle2, AlertTriangle, Send, ShieldCheck, Euro } from "lucide-react";
import { toast } from "sonner";
import ContractTemplateCard from "./ContractTemplateCard";
import LikesCard from "./LikesCard";

function StatusRow({ ok, okText, koText }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${ok ? "text-success" : "text-warning"}`}>
      {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {ok ? okText : koText}
    </span>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [s, setS] = useState(null);
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [stripeForm, setStripeForm] = useState({ stripeSecretKey: "", stripePublishableKey: "", stripeWebhookSecret: "", stripeMode: "test" });

  useEffect(() => {
    api.get("/settings").then((r) => { setS(r.data); setTestEmail(user?.email || ""); });
    api.get("/admin/settings").then((r) => {
      setCfg(r.data);
      setStripeForm({ stripeSecretKey: "", stripePublishableKey: r.data.stripePublishableKey || "", stripeWebhookSecret: "", stripeMode: r.data.stripeMode || "test" });
    });
  }, [user]);
  if (!s) return <div className="text-muted-foreground">Cargando…</div>;

  const saveCfg = async (patch) => {
    setSavingCfg(true);
    try {
      const { data } = await api.put("/admin/settings", patch);
      setCfg(data);
      toast.success("Configuración guardada");
      return data;
    } catch (e) { toast.error(apiErr(e)); } finally { setSavingCfg(false); }
  };

  const saveStripe = async () => {
    const patch = { stripePublishableKey: stripeForm.stripePublishableKey, stripeMode: stripeForm.stripeMode };
    if (stripeForm.stripeSecretKey.trim()) patch.stripeSecretKey = stripeForm.stripeSecretKey.trim();
    if (stripeForm.stripeWebhookSecret.trim()) patch.stripeWebhookSecret = stripeForm.stripeWebhookSecret.trim();
    const r = await saveCfg(patch);
    if (r) {
      setStripeForm((f) => ({ ...f, stripeSecretKey: "", stripeWebhookSecret: "" }));
      api.get("/settings").then((res) => setS(res.data));
      api.get("/admin/settings").then((res) => setCfg(res.data));
    }
  };

  const sendTest = async () => {
    if (!testEmail) return;
    setSending(true);
    try {
      await api.post("/email/test", { email: testEmail });
      toast.success(`Email de prueba enviado a ${testEmail}`);
    } catch (e) { toast.error(apiErr(e)); } finally { setSending(false); }
  };

  return (
    <div data-testid="settings-page">
      <PageHeader overline="Ajustes" title="Configuración" subtitle="Datos de tu marca e integraciones conectadas." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div data-testid="share-link-card" className="rounded-lg border border-primary/30 bg-primary/5 p-6 lg:col-span-2">
          <div className="flex items-center gap-2 text-primary mb-2"><Mail size={18} /><h3 className="font-heading font-600 text-foreground">Portal público de contratación</h3></div>
          <p className="text-sm text-muted-foreground mb-4">Comparte este enlace con tus clientes para que contraten online (móvil, fibra, satélite y TV) con verificación de identidad y firma digital.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input readOnly data-testid="public-link" value={`${window.location.origin}/contratar`} className="font-mono text-sm" />
            <Button data-testid="copy-link-btn" className="rounded-full gap-2" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/contratar`); toast.success("Enlace copiado"); }}>Copiar</Button>
            <Button variant="outline" data-testid="open-link-btn" className="rounded-full" onClick={() => window.open("/contratar", "_blank")}>Abrir</Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 space-y-3">
          <div className="flex items-center gap-2 text-primary"><Building2 size={18} /><h3 className="font-heading font-600 text-foreground">Datos del emisor</h3></div>
          <Row l="Marca" v={s.issuer.brand} />
          <Row l="Razón social" v={s.issuer.legal} />
          <Row l="CIF" v={s.issuer.cif} />
          <Row l="Dirección" v={s.issuer.address} />
        </div>

        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2 text-primary"><Wifi size={18} /><h3 className="font-heading font-600 text-foreground">Integraciones</h3></div>
          <div className="flex items-center justify-between">
            <span className="text-sm">API Likes Telecom</span>
            <StatusRow ok={s.likes.live} okText="Conectada (datos reales)" koText="Modo demo (IP no autorizada)" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm flex items-center gap-1.5"><CreditCard size={14} /> Stripe</span>
            <StatusRow ok={!!s.stripeConfigured} okText={`Activo (${s.stripeMode})`} koText="No configurado" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm flex items-center gap-1.5"><Mail size={14} /> Email (Resend)</span>
            <StatusRow ok={s.emailConfigured} okText="Configurado" koText="Falta API key" />
          </div>
          {!s.likes.live && <p className="text-xs text-muted-foreground">Autoriza la IP de salida en Likes para activar datos reales.</p>}
        </div>

        <div data-testid="onboarding-config-card" className="rounded-lg border border-border bg-card p-6 space-y-4 lg:col-span-2">
          <div className="flex items-center gap-2 text-primary"><ShieldCheck size={18} /><h3 className="font-heading font-600 text-foreground">Altas y cobros</h3></div>
          {cfg && (
            <>
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Auto-aprobación de altas online</p>
                  <p className="text-xs text-muted-foreground">Si está activo, las líneas se activan automáticamente al recibir el pago, sin revisión manual en «Solicitudes».</p>
                </div>
                <Switch data-testid="auto-approve-switch" checked={!!cfg.autoApprove} disabled={savingCfg}
                  onCheckedChange={(v) => saveCfg({ autoApprove: v })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><Euro size={14} /> Envío SIM · Península</Label>
                  <Input data-testid="ship-peninsula-input" type="number" step="0.01" min="0"
                    value={cfg.shippingFeePeninsula ?? 8} onChange={(e) => setCfg((c) => ({ ...c, shippingFeePeninsula: parseFloat(e.target.value || 0) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><Euro size={14} /> Envío SIM · Islas</Label>
                  <Input data-testid="ship-islands-input" type="number" step="0.01" min="0"
                    value={cfg.shippingFeeIslands ?? 10} onChange={(e) => setCfg((c) => ({ ...c, shippingFeeIslands: parseFloat(e.target.value || 0) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><Euro size={14} /> Día de facturación</Label>
                  <Input data-testid="billing-day-input" type="number" min="1" max="28"
                    value={cfg.billingDay ?? 5} onChange={(e) => setCfg((c) => ({ ...c, billingDay: parseInt(e.target.value || 5) }))} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button data-testid="save-billing-btn" className="rounded-full" disabled={savingCfg}
                  onClick={() => saveCfg({ shippingFeePeninsula: cfg.shippingFeePeninsula, shippingFeeIslands: cfg.shippingFeeIslands, billingDay: cfg.billingDay })}>Guardar facturación</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                El cliente <b>no paga cuota de alta</b>. En la primera factura solo se cobra el <b>envío de la SIM</b>
                (Península {(cfg.shippingFeePeninsula ?? 8).toFixed?.(2) || cfg.shippingFeePeninsula}€ · Islas {(cfg.shippingFeeIslands ?? 10).toFixed?.(2) || cfg.shippingFeeIslands}€ —Canarias/Baleares—)
                más la <b>parte proporcional</b> de la cuota según los días que falten para la facturación del día <b>{cfg.billingDay ?? 5}</b> de cada mes.
              </p>
              <p className="text-xs text-muted-foreground">
                Recordatorios de pago: <b>{(cfg.reminderDays || []).join(" y ")} días</b> antes del cobro ·
                Suspensión tras <b>{cfg.maxFailed}</b> intentos fallidos.
              </p>
            </>
          )}
        </div>

        <LikesCard />

        <div data-testid="stripe-config-card" className="rounded-lg border border-border bg-card p-6 space-y-4 lg:col-span-2">
          <div className="flex items-center gap-2 text-primary"><CreditCard size={18} /><h3 className="font-heading font-600 text-foreground">Pasarela de pago (Stripe)</h3></div>
          <p className="text-sm text-muted-foreground">Introduce tus claves de Stripe. Se guardan de forma segura en el servidor. Usa claves <b>test</b> para pruebas y <b>live</b> en producción.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Clave secreta (Secret key)</Label>
              <Input data-testid="stripe-secret-input" type="password" autoComplete="off"
                placeholder={cfg?.stripeSecretKeySet ? `Guardada (${cfg.stripeSecretKeyMasked})` : "sk_live_… o sk_test_…"}
                value={stripeForm.stripeSecretKey} onChange={(e) => setStripeForm((f) => ({ ...f, stripeSecretKey: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Clave publicable (Publishable key)</Label>
              <Input data-testid="stripe-publishable-input" autoComplete="off" placeholder="pk_live_… o pk_test_…"
                value={stripeForm.stripePublishableKey} onChange={(e) => setStripeForm((f) => ({ ...f, stripePublishableKey: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Secreto del webhook (Signing secret)</Label>
              <Input data-testid="stripe-webhook-input" type="password" autoComplete="off"
                placeholder={cfg?.stripeWebhookSecretSet ? `Guardado (${cfg.stripeWebhookSecretMasked})` : "whsec_…"}
                value={stripeForm.stripeWebhookSecret} onChange={(e) => setStripeForm((f) => ({ ...f, stripeWebhookSecret: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Modo</Label>
              <div className="flex gap-2">
                {["test", "live"].map((m) => (
                  <button key={m} type="button" data-testid={`stripe-mode-${m}`}
                    onClick={() => setStripeForm((f) => ({ ...f, stripeMode: m }))}
                    className={`flex-1 rounded-md border p-2 text-sm capitalize transition ${stripeForm.stripeMode === m ? "border-primary ring-2 ring-primary/30 bg-primary/5 font-medium" : "border-border"}`}>
                    {m === "live" ? "Producción (live)" : "Pruebas (test)"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-md border border-border bg-accent/30 p-3 text-xs text-muted-foreground">
            URL del webhook (configúrala en tu panel de Stripe → Developers → Webhooks):
            <code className="ml-1 text-foreground break-all">{`${window.location.origin.replace('http://', 'https://')}/api/stripe/webhook`}</code>
            <br />Eventos: <code className="text-foreground">checkout.session.completed</code>, <code className="text-foreground">invoice.payment_succeeded</code>, <code className="text-foreground">invoice.payment_failed</code>
          </div>
          <div className="flex justify-end">
            <Button data-testid="save-stripe-btn" className="rounded-full gap-2" disabled={savingCfg} onClick={saveStripe}>
              <CreditCard size={15} /> {savingCfg ? "Guardando…" : "Guardar claves de Stripe"}
            </Button>
          </div>
        </div>

        <ContractTemplateCard />

        <div className="rounded-lg border border-border bg-card p-6 lg:col-span-2">
          <div className="flex items-center gap-2 text-primary mb-4"><Mail size={18} /><h3 className="font-heading font-600 text-foreground">Enviar email de prueba</h3></div>
          {!s.emailConfigured && (
            <div className="mb-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              El email aún no está configurado. Añade tu API key de Resend para activarlo.
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 max-w-xl">
            <div className="flex-1 space-y-1.5">
              <Label>Email destinatario</Label>
              <Input data-testid="test-email-input" type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="tu@email.com" />
            </div>
            <div className="flex items-end">
              <Button data-testid="send-test-email-btn" onClick={sendTest} disabled={sending || !s.emailConfigured} className="rounded-full gap-2">
                <Send size={15} /> {sending ? "Enviando…" : "Enviar prueba"}
              </Button>
            </div>
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
