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
import { Megaphone, Send, Users, CheckCircle2, AlertTriangle } from "lucide-react";
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
  const pollRef = useRef();

  useEffect(() => { api.get("/resellers").then((r) => setResellers(r.data)).catch(() => {}); }, []);

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
        if (data.status === "done") { clearInterval(pollRef.current); setSending(false); toast.success(`Envío completado: ${data.sent} enviados · ${data.failed} fallidos`); }
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
          <Textarea data-testid="comms-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={8}
            placeholder="Escribe aquí el mensaje. Se enviará con la cabecera y el estilo de GoRoky. Los saltos de línea se respetan." />
          <p className="text-xs text-muted-foreground">Texto plano; los saltos de línea se convierten en párrafos. Se añade automáticamente la cabecera de marca.</p>
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
    </div>
  );
}
