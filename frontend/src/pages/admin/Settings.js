import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Wifi, Mail, CreditCard, CheckCircle2, AlertTriangle, Send } from "lucide-react";
import { toast } from "sonner";

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

  useEffect(() => { api.get("/settings").then((r) => { setS(r.data); setTestEmail(user?.email || ""); }); }, [user]);
  if (!s) return <div className="text-muted-foreground">Cargando…</div>;

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
            <StatusRow ok={true} okText={`Activo (${s.stripeMode})`} koText="No configurado" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm flex items-center gap-1.5"><Mail size={14} /> Email (Resend)</span>
            <StatusRow ok={s.emailConfigured} okText="Configurado" koText="Falta API key" />
          </div>
          {!s.likes.live && <p className="text-xs text-muted-foreground">Autoriza la IP de salida en Likes para activar datos reales.</p>}
        </div>

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
