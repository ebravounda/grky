import { useCallback, useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck, ShieldAlert, Check, Undo2, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";

const Badge = ({ bad, text }) => (
  <span className={`text-[11px] font-bold uppercase rounded-full px-2.5 py-1 inline-flex items-center gap-1 ${bad ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
    {bad ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />} {text}
  </span>
);

const Row = ({ r, children, flagged, onAck }) => (
  <div className={`flex flex-wrap items-start gap-3 px-4 py-2.5 text-sm ${r.acked ? "opacity-50" : flagged ? "bg-red-50/70" : ""}`} data-testid={`sec-row-${r.fp}`}>
    <div className="flex-1 min-w-0 space-y-0.5">{children}</div>
    {flagged && (
      <button onClick={() => onAck(r)} data-testid={`sec-ack-${r.fp}`} className="text-xs inline-flex items-center gap-1 rounded-full border px-2.5 py-1 hover:bg-muted shrink-0">
        {r.acked ? <><Undo2 size={12} /> Volver a vigilar</> : <><Check size={12} /> Marcar revisado</>}
      </button>
    )}
  </div>
);

const Section = ({ n, title, hint, rows, bad, empty, children, id }) => (
  <section className="rounded-xl border border-border bg-card overflow-hidden" data-testid={`sec-section-${id}`}>
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b bg-muted/30">
      <span className="grid place-items-center h-7 w-7 rounded-full bg-foreground text-background text-xs font-bold">{n}</span>
      <div className="flex-1 min-w-0"><h3 className="font-heading font-bold">{title}</h3><p className="text-xs text-muted-foreground">{hint}</p></div>
      <Badge bad={bad > 0} text={bad > 0 ? `${bad} a revisar` : rows.length ? "Normal" : "Vacío · bien"} />
    </div>
    <div className="divide-y max-h-80 overflow-y-auto">{rows.length ? children : <p className="px-4 py-4 text-sm text-muted-foreground">{empty}</p>}</div>
  </section>
);

const Mono = ({ children }) => <code className="text-xs font-mono break-all text-muted-foreground">{children}</code>;
const Reasons = ({ list }) => list?.length ? <p className="text-xs text-red-700 font-medium">{list.join(" · ")}</p> : null;

export const SecurityTab = () => {
  const [d, setD] = useState(null);
  const [auto, setAuto] = useState(true);
  const [cfg, setCfg] = useState(null);
  const [showCfg, setShowCfg] = useState(false);

  const load = useCallback(() => api.get("/admin/monitor/security").then((r) => { setD(r.data); setCfg((c) => c || { ...r.data.settings, trustedIpsTxt: (r.data.settings.trustedIps || []).join(", ") }); }).catch((e) => toast.error(apiErr(e))), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!auto) return; const t = setInterval(load, 10000); return () => clearInterval(t); }, [auto, load]);

  const ack = async (r) => {
    try { r.acked ? await api.delete(`/admin/monitor/security/ack/${r.fp}`) : await api.post("/admin/monitor/security/ack", { fp: r.fp, label: r.proc || r.name || r.path || r.user || "" }); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const saveCfg = async () => {
    try { await api.put("/admin/monitor/security/settings", { trapPrefix: cfg.trapPrefix, securityAlerts: cfg.securityAlerts, trustedIps: cfg.trustedIpsTxt.split(/[\s,;]+/).filter(Boolean) }); toast.success("Ajustes de seguridad guardados"); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  if (!d) return <p className="py-10 text-center text-muted-foreground" data-testid="sec-loading">Analizando el servidor…</p>;
  const cnt = (rows, f = (r) => true) => rows.filter((r) => !r.acked && f(r)).length;
  const susp = (r) => r.suspicious;

  return (
    <div className="space-y-5" data-testid="security-tab">
      <div className={`rounded-xl p-4 flex flex-wrap items-center gap-3 ${d.openFindings ? "bg-red-600 text-white" : "bg-emerald-600 text-white"}`} data-testid="sec-summary">
        {d.openFindings ? <ShieldAlert size={22} /> : <ShieldCheck size={22} />}
        <p className="font-heading font-bold text-lg">{d.openFindings ? `${d.openFindings} elemento(s) a revisar` : "Sin señales de ataque"}</p>
        <p className="text-sm opacity-80">Actualizado {new Date(d.at).toLocaleTimeString("es-ES")}</p>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} data-testid="sec-auto" /> En vivo (10 s)</label>
          <Button size="sm" variant="secondary" onClick={load} data-testid="sec-refresh"><RefreshCw size={14} /></Button>
          <Button size="sm" variant="secondary" onClick={() => setShowCfg(!showCfg)} data-testid="sec-settings-toggle"><Settings2 size={14} /></Button>
        </div>
      </div>
      {!d.available && <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2">Falta la herramienta «ss» en este servidor: las conexiones no se pueden leer.</p>}

      {showCfg && cfg && (
        <div className="rounded-xl border p-4 grid md:grid-cols-3 gap-4 items-end" data-testid="sec-settings">
          <div><label className="text-xs font-semibold">Prefijo de la trampa en el log (vacío = cualquier línea con UID=)</label><Input data-testid="sec-trap-prefix" value={cfg.trapPrefix} onChange={(e) => setCfg({ ...cfg, trapPrefix: e.target.value })} placeholder="p.ej. BLOCK-OUT-SSH" /></div>
          <div><label className="text-xs font-semibold">IPs de confianza (no salen en logins)</label><Input data-testid="sec-trusted-ips" value={cfg.trustedIpsTxt} onChange={(e) => setCfg({ ...cfg, trustedIpsTxt: e.target.value })} placeholder="tu IP de casa/oficina" /></div>
          <div className="flex items-center gap-3"><Switch checked={cfg.securityAlerts} onCheckedChange={(v) => setCfg({ ...cfg, securityAlerts: v })} data-testid="sec-alerts-switch" /><span className="text-sm">Avisos WhatsApp + CRM</span><Button className="ml-auto" onClick={saveCfg} data-testid="sec-settings-save">Guardar</Button></div>
        </div>
      )}

      <Section n="1" id="outbound" title="Conexiones salientes" hint="Normal: 443 a Stripe, PayPal, OpenAI, Cloudflare, Plesk, Imunify o AWS, y 25/587 desde postfix. Sospechoso: 22, 23, 3333, 4444, 5555, 7777, 14444 (minería), 6667 (IRC) o un proceso desconocido." rows={d.outbound} bad={cnt(d.outbound, susp)} empty="Sin conexiones salientes.">
        {d.outbound.map((r) => <Row key={r.fp + r.local} r={r} flagged={r.suspicious} onAck={ack}><p><b>{r.proc}</b> <span className="text-muted-foreground">pid {r.pid} · {r.user}{r.site && ` · ${r.site}`}</span> → <b>{r.remote}:{r.port}</b></p><Reasons list={r.reasons} /></Row>)}
      </Section>
      <Section n="2" id="nonroot" title="Usuarios no root con conexiones" hint="Un usuario web (por ejemplo, elalde.com_…) con conexiones a IPs externas en puertos raros es mala señal." rows={d.nonRoot} bad={cnt(d.nonRoot, susp)} empty="Ningún usuario no root tiene conexiones salientes.">
        {d.nonRoot.map((r) => <Row key={r.fp + r.local} r={r} flagged={r.suspicious} onAck={ack}><p><b>{r.user}</b> (UID {r.uid}){r.site && <> · web <b>{r.site}</b></>} · {r.proc} → {r.remote}:{r.port}</p><Reasons list={r.reasons} /></Row>)}
      </Section>
      <Section n="3" id="trap" title="Trampa (intentos bloqueados, últimas 24 h)" hint="Si sale algo aquí, alguien ha intentado volver a atacar. Se muestra la web a la que pertenece el UID (como getent passwd UID)." rows={d.trap} bad={cnt(d.trap)} empty="Ningún intento bloqueado.">
        {d.trap.map((r) => <Row key={r.fp} r={r} flagged onAck={ack}><p><b>UID {r.uid ?? "?"}</b> → {r.user}{r.site && <> · web <b>{r.site}</b></>} · destino {r.dst}:{r.port}</p><Mono>{r.line}</Mono></Row>)}
      </Section>
      <Section n="4" id="webprocs" title="Procesos de usuarios web que no son PHP" hint="Debería estar vacío. Un usuario web solo debería ejecutar PHP." rows={d.webProcs} bad={cnt(d.webProcs)} empty="Vacío: los usuarios web solo ejecutan PHP.">
        {d.webProcs.map((r) => <Row key={r.fp + r.pid} r={r} flagged onAck={ack}><p><b>{r.name}</b> · {r.user}{r.site && ` · ${r.site}`} · pid {r.pid}</p><p className="text-xs text-red-700">{r.reason}</p><Mono>{r.cmd || r.exe}</Mono></Row>)}
      </Section>
      <Section n="5" id="tmpprocs" title="Procesos que corren desde /tmp, /var/tmp o /dev/shm" hint="Debería estar vacío. Un perl, python, bash o binario desde /tmp es la firma típica de un ataque." rows={d.tmpProcs} bad={cnt(d.tmpProcs)} empty="Vacío: nada se ejecuta desde carpetas temporales.">
        {d.tmpProcs.map((r) => <Row key={r.fp + r.pid} r={r} flagged onAck={ack}><p><b>{r.name}</b> · {r.user} · pid {r.pid}</p><p className="text-xs text-red-700">{r.reason}</p><Mono>{r.exe} {r.cmd}</Mono></Row>)}
      </Section>
      <Section n="6" id="cpu" title="CPU por proceso" hint="Un proceso desconocido cerca del 100 % de forma constante suele ser un minero." rows={d.cpu} bad={cnt(d.cpu, susp)} empty="Ningún proceso usa CPU significativa.">
        {d.cpu.map((r) => <Row key={r.fp + r.pid} r={r} flagged={r.suspicious} onAck={ack}><div className="flex items-center gap-3"><span className={`font-mono font-bold w-14 ${r.cpu >= 80 ? "text-red-600" : ""}`}>{r.cpu}%</span><span><b>{r.name}</b> · {r.user} · pid {r.pid}{!r.known && <span className="text-red-700 text-xs"> · desconocido</span>}</span></div></Row>)}
      </Section>
      <Section n="7" id="persistence" title="Persistencia (cambios en 7 días: systemd, cron, arranque, claves SSH)" hint="Lo vuestro de hoy (block-outbound-ssh y la entrada de cron) aparece como conocido. Cualquier otra cosa, revísala." rows={d.persistence} bad={cnt(d.persistence, (r) => !r.known)} empty="Sin cambios recientes.">
        {d.persistence.map((r) => <Row key={r.fp} r={r} flagged={!r.known} onAck={ack}><p><b>{r.path}</b> <span className="text-xs uppercase text-muted-foreground">{r.kind}</span> · {new Date(r.modified).toLocaleString("es-ES")}{r.known && <span className="text-emerald-700 text-xs"> · conocido</span>}</p>{r.preview && <Mono>{r.preview}</Mono>}</Row>)}
      </Section>
      <Section n="8" id="logins" title="Logins (SSH aceptados en 7 días y sesiones activas)" hint="No debería aparecer nada. Añade tus IPs en ajustes para ocultar tus propios accesos." rows={d.logins} bad={cnt(d.logins)} empty="Ningún login: bien.">
        {d.logins.map((r) => <Row key={r.fp} r={r} flagged onAck={ack}><p><b>{r.user}</b> desde <b>{r.ip}</b> · {r.method} · {r.time}{r.nonRoot && <span className="text-red-700 text-xs"> · usuario no root</span>}</p></Row>)}
      </Section>
    </div>
  );
};
