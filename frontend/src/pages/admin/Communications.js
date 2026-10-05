import { useEffect, useState, useRef } from "react";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Megaphone, Send, Users, CheckCircle2, AlertTriangle, Bold, Italic, Link2, Heading, List, History, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export default function Communications() {
  const [audience, setAudience] = useState("customers");
  const [resellerId, setResellerId] = useState("");
  const [resellers, setResellers] = useState([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [count, setCount] = useState(null);
  const [sending, setSending] = useState(false);
  const [job, setJob] = useState(null);
  const [history, setHistory] = useState([]);
  const [wa, setWa] = useState({ whatsappApiKey: "", whatsappInstance: "", whatsappApiUrl: "", whatsappAdminPhone: "" });
  const [waMasked, setWaMasked] = useState("");
  const [waSaving, setWaSaving] = useState(false);
  const pollRef = useRef();
  const msgRef = useRef();

  const loadHistory = () => api.get("/communications/history").then((r) => setHistory(r.data)).catch(() => {});
  const loadWa = () => api.get("/admin/settings").then((r) => {
    const d = r.data;
    setWa({ whatsappApiKey: "", whatsappInstance: d.whatsappInstance || "", whatsappApiUrl: d.whatsappApiUrl || "", whatsappAdminPhone: d.whatsappAdminPhone || "" });
    setWaMasked(d.whatsappApiKeySet ? d.whatsappApiKeyMasked : "");
  }).catch(() => {});
  useEffect(() => { api.get("/resellers").then((r) => setResellers(r.data)).catch(() => {}); loadHistory(); loadWa(); }, []);

  const saveWa = async () => {
    setWaSaving(true);
    try {
      const payload = { whatsappInstance: wa.whatsappInstance, whatsappApiUrl: wa.whatsappApiUrl, whatsappAdminPhone: wa.whatsappAdminPhone };
      if (wa.whatsappApiKey.trim()) payload.whatsappApiKey = wa.whatsappApiKey.trim();
      await api.put("/admin/settings", payload);
      toast.success("Configuración de WhatsApp guardada");
      loadWa();
    } catch (e) { toast.error(apiErr(e)); } finally { setWaSaving(false); }
  };

  const wrap = (before, after = before) => {
    const el = msgRef.current;
    if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const sel = message.slice(s, e) || "texto";
    const next = message.slice(0, s) + before + sel + after + message.slice(e);
    setMessage(next);
    setTimeout(() => { el.focus(); el.selectionStart = s + before.length; el.selectionEnd = s + before.length + sel.length; }, 0);
  };
  const insertLink = () => {
    const url = window.prompt("URL del enlace (https://…)", "https://goroky.com");
    if (!url) return;
    wrap(`<a href="${url}" style="color:#0a63ff">`, "</a>");
  };

  const testWhatsapp = async () => {
    const number = window.prompt("Número para la prueba de WhatsApp (con prefijo, ej. 34600123456)");
    if (!number) return;
    try {
      await api.post("/communications/whatsapp-test", { number, message: "Mensaje de prueba de GoRoky ✅" });
      toast.success("WhatsApp de prueba enviado correctamente");
    } catch (e) { toast.error(apiErr(e)); }
  };

  useEffect(() => {
    if (audience === "reseller" && !resellerId) { setCount(null); return; }
    const params = { audience };
    if (audience === "reseller") params.resellerId = resellerId;
    api.get("/communications/audience-count", { params }).then((r) => setCount(r.data.count)).catch(() => setCount(null));
  }, [audience, resellerId]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const poll = (jobId) => {
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/communications/bulk-email/${jobId}`);
        setJob(data);
        if (data.status === "done") { clearInterval(pollRef.current); setSending(false); loadHistory(); toast.success(`Envío completado: ${data.sent} enviados · ${data.failed} fallidos`); }
      } catch (e) { clearInterval(pollRef.current); setSending(false); }
    }, 1500);
  };

  const send = async () => {
    if (!subject.trim() || !message.trim()) return toast.error("Indica asunto y mensaje");
    if (audience === "reseller" && !resellerId) return toast.error("Elige un revendedor");
    if (!window.confirm(`¿Enviar este correo a ${count ?? "los"} destinatarios?`)) return;
    setSending(true); setJob(null);
    try {
      const { data } = await api.post("/communications/bulk-email", {
        audience, resellerId: audience === "reseller" ? resellerId : null, subject: subject.trim(), message });
      toast.success(`Enviando a ${data.total} destinatarios…`);
      setJob({ total: data.total, sent: 0, failed: 0, status: "sending" });
      poll(data.jobId);
    } catch (e) { toast.error(apiErr(e)); setSending(false); }
  };

  return (
    <div data-testid="communications-page" className="max-w-3xl">
      <PageHeader overline="Comunicaciones" title="Envío masivo"
        subtitle="Envía un correo a tus clientes con la plantilla de GoRoky." />

      <div className="mb-4">
        <Button data-testid="whatsapp-test-btn" variant="outline" className="rounded-full gap-2 text-green-600 border-green-300" onClick={testWhatsapp}>
          <MessageCircle size={15} /> Enviar WhatsApp de prueba
        </Button>
      </div>

      {/* Configuración de la API de WhatsApp */}
      <div data-testid="whatsapp-config-card" className="rounded-lg border border-border bg-card p-6 space-y-4 mb-6">
        <div className="flex items-center gap-2 text-green-600"><MessageCircle size={18} /><h3 className="font-heading font-600 text-foreground">Configuración de WhatsApp (API)</h3></div>
        <p className="text-sm text-muted-foreground">Conecta tu API de WhatsApp (whats-saas). Las credenciales se guardan en el servidor, nunca se muestran completas.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>API Key {waMasked && <span className="text-xs text-muted-foreground">(actual: {waMasked})</span>}</Label>
            <Input data-testid="wa-apikey" type="password" value={wa.whatsappApiKey}
              onChange={(e) => setWa({ ...wa, whatsappApiKey: e.target.value })}
              placeholder={waMasked ? "Déjalo vacío para mantener la actual" : "sk_live_…"} />
          </div>
          <div className="space-y-1.5">
            <Label>Nombre de instancia</Label>
            <Input data-testid="wa-instance" value={wa.whatsappInstance} onChange={(e) => setWa({ ...wa, whatsappInstance: e.target.value })} placeholder="t3_abc123_mitiendapro" />
          </div>
          <div className="space-y-1.5">
            <Label>URL del endpoint</Label>
            <Input data-testid="wa-url" value={wa.whatsappApiUrl} onChange={(e) => setWa({ ...wa, whatsappApiUrl: e.target.value })} placeholder="https://mitiendapro.com/api/v1/send" />
          </div>
          <div className="space-y-1.5">
            <Label>Tu WhatsApp (avisos de leads)</Label>
            <Input data-testid="wa-adminphone" value={wa.whatsappAdminPhone} onChange={(e) => setWa({ ...wa, whatsappAdminPhone: e.target.value })} placeholder="34699111222" />
          </div>
        </div>
        <Button data-testid="wa-save-btn" onClick={saveWa} disabled={waSaving} className="rounded-full">{waSaving ? "Guardando…" : "Guardar configuración"}</Button>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Destinatarios</Label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger data-testid="audience-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="customers">Todos los clientes del CRM</SelectItem>
                <SelectItem value="all">Todos (clientes + portal + staff)</SelectItem>
                <SelectItem value="reseller">Clientes de un revendedor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {audience === "reseller" && (
            <div className="space-y-1.5">
              <Label>Revendedor</Label>
              <Select value={resellerId} onValueChange={setResellerId}>
                <SelectTrigger data-testid="comms-reseller-select"><SelectValue placeholder="Elige revendedor" /></SelectTrigger>
                <SelectContent>
                  {resellers.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-primary bg-primary/5 rounded-md px-3 py-2">
          <Users size={16} /> {count === null ? "Selecciona el público…" : `${count} destinatario(s) con email`}
        </div>

        <div className="space-y-1.5">
          <Label>Asunto</Label>
          <Input data-testid="comms-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ej. Novedades de tu tarifa GoRoky" />
        </div>
        <div className="space-y-1.5">
          <Label>Mensaje</Label>
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/40 p-1" data-testid="comms-toolbar">
            <button type="button" data-testid="fmt-bold" title="Negrita" onClick={() => wrap("<b>", "</b>")} className="h-8 w-8 grid place-items-center rounded hover:bg-background"><Bold size={15} /></button>
            <button type="button" data-testid="fmt-italic" title="Cursiva" onClick={() => wrap("<i>", "</i>")} className="h-8 w-8 grid place-items-center rounded hover:bg-background"><Italic size={15} /></button>
            <button type="button" data-testid="fmt-heading" title="Título" onClick={() => wrap('<h2 style="font-size:17px;color:#0b1020;margin:8px 0">', "</h2>")} className="h-8 w-8 grid place-items-center rounded hover:bg-background"><Heading size={15} /></button>
            <button type="button" data-testid="fmt-list" title="Viñeta" onClick={() => wrap("<li>", "</li>")} className="h-8 w-8 grid place-items-center rounded hover:bg-background"><List size={15} /></button>
            <button type="button" data-testid="fmt-link" title="Enlace" onClick={insertLink} className="h-8 w-8 grid place-items-center rounded hover:bg-background"><Link2 size={15} /></button>
          </div>
          <Textarea ref={msgRef} data-testid="comms-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={8}
            placeholder="Escribe aquí el mensaje. Se enviará con la cabecera y el logo de GoRoky. Usa los botones de formato o pega HTML." />
          <p className="text-xs text-muted-foreground">Se añade automáticamente la cabecera con el logo de GoRoky y el pie legal. Puedes dar formato con los botones (negrita, cursiva, título, enlace).</p>
        </div>

        {job && (
          <div data-testid="comms-progress" className="rounded-md border border-border p-4 text-sm space-y-1">
            <div className="flex items-center gap-2 font-medium">
              {job.status === "done" ? <CheckCircle2 size={16} className="text-success" /> : <Send size={16} className="text-primary animate-pulse" />}
              {job.status === "done" ? "Envío completado" : "Enviando…"}
            </div>
            <p className="text-muted-foreground">Total: {job.total} · Enviados: {job.sent} · Fallidos: {job.failed}</p>
            {job.failed > 0 && <p className="text-amber-600 flex items-center gap-1.5"><AlertTriangle size={14} /> Algunos correos no se pudieron enviar (email inválido o límite de Resend).</p>}
          </div>
        )}

        <Button data-testid="comms-send-btn" onClick={send} disabled={sending || !subject.trim() || !message.trim()} className="rounded-full gap-2">
          <Megaphone size={16} /> {sending ? "Enviando…" : "Enviar correo masivo"}
        </Button>
      </div>

      {history.length > 0 && (
        <div className="mt-6" data-testid="comms-history">
          <h3 className="flex items-center gap-2 font-heading font-600 mb-3"><History size={17} className="text-primary" /> Historial de envíos</h3>
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Asunto</th>
                  <th className="px-4 py-3 font-medium">Público</th>
                  <th className="px-4 py-3 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((h) => (
                  <tr key={h.id} data-testid={`history-row-${h.id}`}>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{h.createdAt ? new Date(h.createdAt).toLocaleString("es-ES") : "—"}</td>
                    <td className="px-4 py-3 font-medium">{h.subject}</td>
                    <td className="px-4 py-3">{h.audience}</td>
                    <td className="px-4 py-3">
                      {h.status === "done"
                        ? <span className="text-success">{h.sent} enviados{h.failed > 0 ? ` · ${h.failed} fallidos` : ""}</span>
                        : <span className="text-primary">Enviando… ({h.sent}/{h.total})</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
