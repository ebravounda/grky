import { useCallback, useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck, ShieldAlert, Check, Undo2, RefreshCw, Settings2, Square, Ban, Mail, FileWarning } from "lucide-react";
import { toast } from "sonner";

const Badge = ({ bad, text }) => (
  <span className={`text-[11px] font-bold uppercase rounded-full px-2.5 py-1 inline-flex items-center gap-1 ${bad ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
    {bad ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />} {text}
  </span>
);

const ActBtn = ({ onClick, icon: I, children, tid }) => (
  <button onClick={onClick} data-testid={tid} className="text-xs inline-flex items-center gap-1 rounded-full bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 shrink-0 transition-colors"><I size={12} /> {children}</button>
);

const Row = ({ r, children, flagged, onAck, actions }) => (
  <div className={`flex flex-wrap items-start gap-2 px-4 py-2.5 text-sm ${r.acked ? "opacity-50" : flagged ? "bg-red-50/70" : ""}`} data-testid={`sec-row-${r.fp}`}>
    <div className="flex-1 min-w-0 space-y-0.5">{children}</div>
    {actions}
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

const BlockedList = ({ blocked, onUnblock }) => (
  <section className="rounded-xl border border-border bg-card overflow-hidden" data-testid="sec-blocked-list">
    <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2"><Ban size={16} /><h3 className="font-heading font-bold">IPs bloqueadas en el firewall</h3><span className="ml-auto text-xs text-muted-foreground">{blocked.length}</span></div>
    <div className="divide-y">
      {blocked.map((b) => (
        <div key={b._id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm" data-testid={`sec-blocked-${b._id}`}>
          <b className="font-mono">{b._id}</b><span className="text-xs text-muted-foreground">{b.reason}</span>
          <span className="text-xs text-muted-foreground ml-auto">{new Date(b.at).toLocaleString("es-ES")} · {b.by} · {b.engine}</span>
          <Button size="sm" variant="outline" onClick={() => onUnblock(b._id)} data-testid={`sec-unblock-${b._id}`}>Desbloquear</Button>
        </div>
      ))}
      {blocked.length === 0 && <p className="px-4 py-4 text-sm text-muted-foreground">Ninguna IP bloqueada.</p>}
    </div>
  </section>
);

export const SecurityTab = () => {
  const [d, setD] = useState(null);
  const [auto, setAuto] = useState(true);
  const [cfg, setCfg] = useState(null);
  const [showCfg, setShowCfg] = useState(false);
  const [blocked, setBlocked] = useState([]);

  const load = useCallback(() => api.get("/admin/monitor/security").then((r) => { setD(r.data); setCfg((c) => c || { ...r.data.settings, trustedIpsTxt: (r.data.settings.trustedIps || []).join(", ") }); }).catch((e) => toast.error(apiErr(e))), []);
  const loadBlocked = useCallback(() => api.get("/admin/monitor/security/blocked").then((r) => setBlocked(r.data)).catch(() => {}), []);
  useEffect(() => { load(); loadBlocked(); }, [load, loadBlocked]);
  useEffect(() => { if (!auto) return; const t = setInterval(load, 10000); return () => clearInterval(t); }, [auto, load]);

  const call = async (fn, ok) => { try { const r = await fn(); toast.success(ok(r.data)); load(); loadBlocked(); } catch (e) { toast.error(apiErr(e)); } };
  const ack = (r) => call(() => (r.acked ? api.delete(`/admin/monitor/security/ack/${r.fp}`) : api.post("/admin/monitor/security/ack", { fp: r.fp, label: r.proc || r.name || r.path || r.user || "" })), () => (r.acked ? "Vuelve a vigilarse" : "Marcado como revisado"));
  const kill = (r) => window.confirm(`¿Detener el proceso «${r.name || r.proc}» (pid ${r.pid}, usuario ${r.user})?\n\nSe le pedirá que se cierre y, si no lo hace en 3 segundos, se forzará. También se detendrán los procesos que haya lanzado.`)
    && call(() => api.post("/admin/monitor/security/kill", { pid: r.pid }), (x) => `Detenido ${x.name} · ${x.stopped} proceso(s)${x.forced ? `, ${x.forced} forzado(s)` : ""}`);
  const block = (ip, reason) => window.confirm(`¿Bloquear la IP ${ip} en el firewall de forma permanente?\n\nSe cortará todo el tráfico entrante y saliente con esa IP. Podrás desbloquearla desde la lista de IPs bloqueadas.`)
    && call(() => api.post("/admin/monitor/security/block", { ip, reason }), (x) => `IP ${x.ip} bloqueada (${x.engine})`);
  const unblock = (ip) => window.confirm(`¿Desbloquear la IP ${ip}?`) && call(() => api.delete(`/admin/monitor/security/block/${encodeURIComponent(ip)}`), () => `IP ${ip} desbloqueada`);
  const sendReport = () => call(() => api.post("/admin/monitor/security/report"), (x) => `Informe enviado a ${x.to}`);
  const saveCfg = () => call(() => api.put("/admin/monitor/security/settings", { reportEmail: cfg.reportEmail, trapPrefix: cfg.trapPrefix, securityAlerts: cfg.securityAlerts, trustedIps: cfg.trustedIpsTxt.split(/[\s,;]+/).filter(Boolean) }), () => "Ajustes de seguridad guardados");

  if (!d) return <p className="py-10 text-center text-muted-foreground" data-testid="sec-loading">Analizando el servidor…</p>;
  const cnt = (rows, f = () => true) => rows.filter((r) => !r.acked && f(r)).length;
  const susp = (r) => r.suspicious;
  const ipAct = (ip, reason, k) => ip && ((d.blockedIps || []).includes(ip)
    ? <span className="text-[11px] font-bold uppercase rounded-full px-2 py-1 bg-foreground text-background shrink-0" data-testid={`sec-ip-blocked-${k}`}>Bloqueada</span>
    : ip !== d.myIp && <ActBtn icon={Ban} tid={`sec-block-${k}`} onClick={() => block(ip, reason)}>Bloquear IP</ActBtn>);
  const killAct = (r) => r.pid ? <ActBtn icon={Square} tid={`sec-kill-${r.pid}`} onClick={() => kill(r)}>Detener</ActBtn> : null;
  const php = d.phpUploads || [];

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
          <div><label className="text-xs font-semibold">IPs de confianza (no salen en logins, nunca se bloquean)</label><Input data-testid="sec-trusted-ips" value={cfg.trustedIpsTxt} onChange={(e) => setCfg({ ...cfg, trustedIpsTxt: e.target.value })} placeholder={`tu IP actual: ${d.myIp || "?"}`} /></div>
          <div><label className="text-xs font-semibold">Email del informe semanal (lunes)</label><Input data-testid="sec-report-email" value={cfg.reportEmail || ""} onChange={(e) => setCfg({ ...cfg, reportEmail: e.target.value })} /></div>
          <div className="flex items-center gap-3"><Switch checked={cfg.securityAlerts} onCheckedChange={(v) => setCfg({ ...cfg, securityAlerts: v })} data-testid="sec-alerts-switch" /><span className="text-sm">Avisos WhatsApp + CRM</span></div>
          <Button variant="outline" className="gap-2" onClick={sendReport} data-testid="sec-report-send"><Mail size={14} /> Enviar informe ahora</Button>
          <Button onClick={saveCfg} data-testid="sec-settings-save">Guardar ajustes</Button>
        </div>
      )}

      <Section n="1" id="outbound" title="Conexiones salientes" hint="Normal: 443 a Stripe, PayPal, OpenAI, Cloudflare, Plesk, Imunify o AWS, y 25/587 desde postfix. Sospechoso: 22, 23, 3333, 4444, 5555, 7777, 14444 (minería), 6667 (IRC) o un proceso desconocido." rows={d.outbound} bad={cnt(d.outbound, susp)} empty="Sin conexiones salientes.">
        {d.outbound.map((r) => <Row key={r.fp + r.local} r={r} flagged={r.suspicious} onAck={ack} actions={r.suspicious && <>{killAct(r)}{ipAct(r.remote, `${r.proc} → ${r.port}`, `o-${r.local}`)}</>}><p><b>{r.proc}</b> <span className="text-muted-foreground">pid {r.pid} · {r.user}{r.site && ` · ${r.site}`}</span> → <b>{r.remote}:{r.port}</b></p><Reasons list={r.reasons} /></Row>)}
      </Section>
      <Section n="2" id="nonroot" title="Usuarios no root con conexiones" hint="Un usuario web (por ejemplo, elalde.com_…) con conexiones a IPs externas en puertos raros es mala señal." rows={d.nonRoot} bad={cnt(d.nonRoot, susp)} empty="Ningún usuario no root tiene conexiones salientes.">
        {d.nonRoot.map((r) => <Row key={r.fp + r.local} r={r} flagged={r.suspicious} onAck={ack} actions={r.suspicious && <>{killAct(r)}{ipAct(r.remote, `${r.user} → ${r.port}`, `n-${r.local}`)}</>}><p><b>{r.user}</b> (UID {r.uid}){r.site && <> · web <b>{r.site}</b></>} · {r.proc} → {r.remote}:{r.port}</p><Reasons list={r.reasons} /></Row>)}
      </Section>
      <Section n="3" id="trap" title="Trampa (intentos bloqueados, últimas 24 h)" hint="Si sale algo aquí, alguien ha intentado volver a atacar. Se muestra la web a la que pertenece el UID (como getent passwd UID)." rows={d.trap} bad={cnt(d.trap)} empty="Ningún intento bloqueado.">
        {d.trap.map((r) => <Row key={r.fp} r={r} flagged onAck={ack} actions={ipAct(r.dst, `Trampa UID ${r.uid}`, `t-${r.fp}`)}><p><b>UID {r.uid ?? "?"}</b> → {r.user}{r.site && <> · web <b>{r.site}</b></>} · destino {r.dst}:{r.port}</p><Mono>{r.line}</Mono></Row>)}
      </Section>
      <Section n="4" id="webprocs" title="Procesos de usuarios web que no son PHP" hint="Debería estar vacío. Un usuario web solo debería ejecutar PHP." rows={d.webProcs} bad={cnt(d.webProcs)} empty="Vacío: los usuarios web solo ejecutan PHP.">
        {d.webProcs.map((r) => <Row key={r.fp + r.pid} r={r} flagged onAck={ack} actions={killAct(r)}><p><b>{r.name}</b> · {r.user}{r.site && ` · ${r.site}`} · pid {r.pid}</p><p className="text-xs text-red-700">{r.reason}</p><Mono>{r.cmd || r.exe}</Mono></Row>)}
      </Section>
      <Section n="5" id="tmpprocs" title="Procesos que corren desde /tmp, /var/tmp o /dev/shm" hint="Debería estar vacío. Un perl, python, bash o binario desde /tmp es la firma típica de un ataque." rows={d.tmpProcs} bad={cnt(d.tmpProcs)} empty="Vacío: nada se ejecuta desde carpetas temporales.">
        {d.tmpProcs.map((r) => <Row key={r.fp + r.pid} r={r} flagged onAck={ack} actions={killAct(r)}><p><b>{r.name}</b> · {r.user} · pid {r.pid}</p><p className="text-xs text-red-700">{r.reason}</p><Mono>{r.exe} {r.cmd}</Mono></Row>)}
      </Section>
      <Section n="6" id="cpu" title="CPU por proceso" hint="Un proceso desconocido cerca del 100 % de forma constante suele ser un minero." rows={d.cpu} bad={cnt(d.cpu, susp)} empty="Ningún proceso usa CPU significativa.">
        {d.cpu.map((r) => <Row key={r.fp + r.pid} r={r} flagged={r.suspicious} onAck={ack} actions={!r.known && killAct(r)}><div className="flex items-center gap-3"><span className={`font-mono font-bold w-14 ${r.cpu >= 80 ? "text-red-600" : ""}`}>{r.cpu}%</span><span><b>{r.name}</b> · {r.user} · pid {r.pid}{!r.known && <span className="text-red-700 text-xs"> · desconocido</span>}</span></div></Row>)}
      </Section>
      <Section n="7" id="persistence" title="Persistencia (cambios en 7 días: systemd, cron, arranque, claves SSH)" hint="Lo vuestro de hoy (block-outbound-ssh y la entrada de cron) aparece como conocido. Cualquier otra cosa, revísala." rows={d.persistence} bad={cnt(d.persistence, (r) => !r.known)} empty="Sin cambios recientes.">
        {d.persistence.map((r) => <Row key={r.fp} r={r} flagged={!r.known} onAck={ack}><p><b>{r.path}</b> <span className="text-xs uppercase text-muted-foreground">{r.kind}</span> · {new Date(r.modified).toLocaleString("es-ES")}{r.known && <span className="text-emerald-700 text-xs"> · conocido</span>}</p>{r.preview && <Mono>{r.preview}</Mono>}</Row>)}
      </Section>
      <Section n="8" id="logins" title="Logins (SSH aceptados en 7 días y sesiones activas)" hint="No debería aparecer nada. Añade tus IPs en ajustes para ocultar tus propios accesos." rows={d.logins} bad={cnt(d.logins)} empty="Ningún login: bien.">
        {d.logins.map((r) => <Row key={r.fp} r={r} flagged onAck={ack} actions={ipAct(r.ip, `Login ${r.user}`, `l-${r.fp}`)}><p><b>{r.user}</b> desde <b>{r.ip}</b> · {r.method} · {r.time}{r.nonRoot && <span className="text-red-700 text-xs"> · usuario no root</span>}</p></Row>)}
      </Section>
      <Section n="9" id="php" title="Archivos PHP nuevos en carpetas de subidas (7 días)" hint="En uploads, images, files, tmp o cache no debería haber PHP: suele ser una puerta trasera subida por un atacante." rows={php} bad={cnt(php)} empty="Ningún PHP nuevo en carpetas de subidas.">
        {php.map((r) => <Row key={r.fp} r={r} flagged onAck={ack}><p className="flex items-center gap-1.5"><FileWarning size={14} className="text-red-600" /><b>{r.site}</b> · {r.owner} · {new Date(r.modified).toLocaleString("es-ES")} · {r.size} bytes</p><Mono>{r.path}</Mono></Row>)}
      </Section>
      <BlockedList blocked={blocked} onUnblock={unblock} />
    </div>
  );
};
