import { useEffect, useState, useCallback, Fragment } from "react";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Cpu, MemoryStick, HardDrive, Clock, Activity, Server, ShieldAlert, RefreshCw,
  Network, Globe, FileClock, AlertTriangle, CheckCircle2, XCircle, ExternalLink, KeyRound,
  Database, ListTree, Boxes, Plug,
} from "lucide-react";

const OK = "text-emerald-500", WARN = "text-amber-500", BAD = "text-red-500";
const barColor = (p) => (p >= 90 ? "bg-red-500" : p >= 70 ? "bg-amber-500" : "bg-emerald-500");

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-bold">{value}</p>
    </div>
  );
}

function fmtDur(s) {
  s = Number(s || 0);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return [d ? `${d}d` : "", h ? `${h}h` : "", `${m}m`].filter(Boolean).join(" ");
}

function Gauge({ label, percent, sub, icon: Icon }) {
  const p = Math.round(percent || 0);
  return (
    <div className="rounded-xl border border-border bg-card p-4" data-testid={`gauge-${label}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon size={16} /> {label}
        </span>
        <span className={`text-lg font-bold ${p >= 90 ? BAD : p >= 70 ? WARN : "text-foreground"}`}>{p}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor(p)}`} style={{ width: `${Math.min(p, 100)}%` }} />
      </div>
      {sub && <p className="text-xs text-muted-foreground mt-2">{sub}</p>}
    </div>
  );
}

function StatePill({ state }) {
  const good = state === "active" || state === true || state === "ok";
  const unknown = state === "unknown" || state == null;
  const cls = unknown ? "bg-muted text-muted-foreground" : good ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600";
  const Icon = unknown ? Activity : good ? CheckCircle2 : XCircle;
  const label = typeof state === "boolean" ? (state ? "OK" : "Caído") : (state || "—");
  return <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}><Icon size={12} /> {label}</span>;
}

export default function ServerMonitor() {
  const [data, setData] = useState(null);
  const [domains, setDomains] = useState(null);
  const [changes, setChanges] = useState(null);
  const [hours, setHours] = useState(24);
  const [tab, setTab] = useState("system");
  const [auto, setAuto] = useState(true);
  const [plesk, setPlesk] = useState({ pleskHost: "", pleskApiKeyMasked: "", configured: false });
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [hostInput, setHostInput] = useState("");
  const [pleskDomains, setPleskDomains] = useState(null);
  const [savingPlesk, setSavingPlesk] = useState(false);
  const [databases, setDatabases] = useState(null);
  const [services, setServices] = useState(null);
  const [mysqlPw, setMysqlPw] = useState("");
  const [openDom, setOpenDom] = useState(null);

  const openInPlesk = async (f) => {
    try {
      const { data: res } = await api.post("/admin/monitor/plesk/file-link", { domain: f.domain, path: f.path });
      if (res.url) window.open(res.url, "_blank");
      else toast.error("No se pudo generar el enlace");
    } catch (e) { toast.error(apiErr(e)); }
  };

  const loadSystem = useCallback(() => {
    api.get("/admin/monitor/system").then((r) => setData(r.data)).catch((e) => toast.error(apiErr(e)));
  }, []);

  useEffect(() => { loadSystem(); }, [loadSystem]);
  useEffect(() => {
    api.get("/admin/monitor/plesk/config").then((r) => { setPlesk(r.data); setHostInput(r.data.pleskHost || ""); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!auto || tab !== "system") return;
    const iv = setInterval(loadSystem, 5000);
    return () => clearInterval(iv);
  }, [auto, tab, loadSystem]);

  const loadDomains = () => {
    setDomains("loading");
    api.get("/admin/monitor/domains").then((r) => setDomains(r.data)).catch((e) => { toast.error(apiErr(e)); setDomains(null); });
  };
  const loadChanges = (h = hours) => {
    setChanges("loading");
    api.get(`/admin/monitor/file-changes?hours=${h}`).then((r) => setChanges(r.data)).catch((e) => { toast.error(apiErr(e)); setChanges(null); });
  };
  const loadDatabases = () => {
    setDatabases("loading");
    api.get("/admin/monitor/databases").then((r) => setDatabases(r.data)).catch((e) => { toast.error(apiErr(e)); setDatabases(null); });
  };
  const loadServices = () => {
    setServices("loading");
    api.get("/admin/monitor/services").then((r) => setServices(r.data)).catch((e) => { toast.error(apiErr(e)); setServices(null); });
  };

  const savePlesk = async () => {
    setSavingPlesk(true);
    try {
      const body = { pleskHost: hostInput, mysqlHost: plesk.mysqlHost, mysqlUser: plesk.mysqlUser, mysqlPort: plesk.mysqlPort };
      if (apiKeyInput.trim()) body.pleskApiKey = apiKeyInput.trim();
      if (mysqlPw.trim()) body.mysqlPassword = mysqlPw.trim();
      const { data: res } = await api.put("/admin/monitor/plesk/config", body);
      if (res.test?.ok) toast.success(`Plesk conectado · ${res.test.domains} dominio(s)`);
      else toast.error(`Plesk: ${res.test?.error || "no conecta"}`);
      setApiKeyInput("");
      setMysqlPw("");
      const cfg = await api.get("/admin/monitor/plesk/config");
      setPlesk(cfg.data);
    } catch (e) { toast.error(apiErr(e)); } finally { setSavingPlesk(false); }
  };

  const loadPleskDomains = () => {
    setPleskDomains("loading");
    api.get("/admin/monitor/plesk/domains").then((r) => setPleskDomains(r.data.domains || [])).catch((e) => { toast.error(apiErr(e)); setPleskDomains(null); });
  };
  const openPleskPanel = async () => {
    try {
      const { data: res } = await api.post("/admin/monitor/plesk/login-link");
      const link = (res.links || [])[0] || res.panelUrl;
      if (link) window.open(link, "_blank");
      else toast.error("No se pudo generar el enlace de acceso");
    } catch (e) { toast.error(apiErr(e)); }
  };

  const m = data?.metrics;
  const TABS = [
    { k: "system", label: "Sistema", icon: Activity },
    { k: "databases", label: "Bases de datos", icon: Database },
    { k: "services", label: "Servicios & Apps", icon: ListTree },
    { k: "domains", label: "Dominios & Ataques", icon: ShieldAlert },
    { k: "files", label: "Cambios de archivos", icon: FileClock },
    { k: "plesk", label: "Plesk & MySQL", icon: KeyRound },
  ];

  return (
    <div data-testid="monitor-page">
      <PageHeader overline="Infraestructura" title="Monitor del servidor"
        subtitle="Estado en vivo del servidor, recursos por dominio y seguridad. Solo visible para el administrador principal." />

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {TABS.map((t) => (
          <button key={t.k} data-testid={`monitor-tab-${t.k}`} onClick={() => {
            setTab(t.k);
            if (t.k === "domains" && !domains) loadDomains();
            if (t.k === "files" && !changes) loadChanges();
            if (t.k === "databases" && !databases) loadDatabases();
            if (t.k === "services" && !services) loadServices();
          }}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === t.k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {tab === "system" && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input type="checkbox" data-testid="monitor-auto" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto 5s
            </label>
          )}
          <Button data-testid="monitor-refresh" variant="outline" size="sm" className="rounded-full" onClick={() => { loadSystem(); if (tab === "domains") loadDomains(); if (tab === "files") loadChanges(); if (tab === "databases") loadDatabases(); if (tab === "services") loadServices(); }}>
            <RefreshCw size={14} className="mr-1.5" /> Actualizar
          </Button>
        </div>
      </div>

      {/* SISTEMA */}
      {tab === "system" && (
        !m ? <div className="text-muted-foreground">Cargando métricas…</div> : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Gauge label="CPU" percent={m.cpu.percent} icon={Cpu}
                sub={`${m.cpu.cores} núcleos · carga ${m.cpu.load["1m"]} / ${m.cpu.load["5m"]} / ${m.cpu.load["15m"]}`} />
              <Gauge label="RAM" percent={m.memory.percent} icon={MemoryStick}
                sub={`${m.memory.usedH} / ${m.memory.totalH}`} />
              <Gauge label="Swap" percent={m.swap.percent} icon={MemoryStick}
                sub={`${m.swap.usedH} / ${m.swap.totalH}`} />
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"><Clock size={16} /> Uptime</span>
                </div>
                <p className="text-2xl font-bold">{m.uptime.human}</p>
                <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1.5"><Network size={12} /> ↑ {m.network.sentH} · ↓ {m.network.recvH}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{m.host}</p>
              </div>
            </div>

            {/* Discos */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-semibold mb-4 inline-flex items-center gap-2"><HardDrive size={18} /> Discos</h3>
              <div className="space-y-3">
                {m.disks.map((d, i) => (
                  <div key={i} data-testid={`disk-${i}`}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{d.mount} <span className="text-muted-foreground font-normal">· {d.fstype}</span></span>
                      <span className="text-muted-foreground">{d.usedH} / {d.totalH} ({d.percent}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full ${barColor(d.percent)}`} style={{ width: `${d.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Servicios + integraciones */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-semibold mb-4 inline-flex items-center gap-2"><Server size={18} /> Servicios del sistema</h3>
                <div className="grid grid-cols-2 gap-2">
                  {data.services.map((s) => (
                    <div key={s.name} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                      <span className="text-sm font-medium">{s.name}</span><StatePill state={s.state} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-semibold mb-4 inline-flex items-center gap-2"><Activity size={18} /> Integraciones</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"><span className="text-sm font-medium">MongoDB</span><StatePill state={data.integrations.mongo.ok} /></div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"><span className="text-sm font-medium">Likes Telecom</span><StatePill state={data.integrations.likes.live} /></div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"><span className="text-sm font-medium">Stripe ({data.integrations.stripe.mode})</span><StatePill state="ok" /></div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"><span className="text-sm font-medium">Email (Resend)</span><StatePill state={data.integrations.email.configured} /></div>
                </div>
              </div>
            </div>

            {/* Top procesos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[["CPU", m.topCpu, "cpu_percent"], ["Memoria", m.topMem, "memory_percent"]].map(([title, list, key]) => (
                <div key={title} className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-semibold mb-3">Top procesos · {title}</h3>
                  <table className="w-full text-sm">
                    <tbody>
                      {list.map((p, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          <td className="py-1.5 font-medium truncate max-w-[160px]">{p.name}</td>
                          <td className="py-1.5 text-muted-foreground text-xs">{p.username}</td>
                          <td className="py-1.5 text-right font-semibold">{p[key]}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* BASES DE DATOS */}
      {tab === "databases" && (
        databases === "loading" ? <div className="text-muted-foreground">Cargando bases de datos…</div> :
        !databases ? <div className="text-muted-foreground">Pulsa Actualizar.</div> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* MongoDB */}
            <div className="rounded-xl border border-border bg-card p-5" data-testid="db-mongo">
              <h3 className="font-semibold mb-3 inline-flex items-center gap-2"><Boxes size={18} className="text-emerald-500" /> MongoDB {databases.mongo.version && <span className="text-xs text-muted-foreground font-normal">v{databases.mongo.version}</span>}</h3>
              {!databases.mongo.available ? <p className="text-sm text-muted-foreground">{databases.mongo.note}</p> : (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <Stat label="Tamaño total" value={databases.mongo.totalHuman} />
                    <Stat label="Conexiones" value={`${databases.mongo.connections.current ?? "—"} / ${databases.mongo.connections.available ?? "—"}`} />
                    <Stat label="Memoria" value={databases.mongo.memResidentMB ? `${databases.mongo.memResidentMB} MB` : "—"} />
                    <Stat label="Uptime" value={fmtDur(databases.mongo.uptime)} />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Bases de datos</p>
                  <table className="w-full text-sm">
                    <tbody>
                      {databases.mongo.databases.map((d, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0"><td className="py-1.5 font-medium">{d.name}</td><td className="py-1.5 text-right text-muted-foreground">{d.human}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  {databases.mongo.opcounters && (
                    <p className="text-xs text-muted-foreground mt-3">Ops: query {databases.mongo.opcounters.query?.toLocaleString?.() || 0} · insert {databases.mongo.opcounters.insert?.toLocaleString?.() || 0} · update {databases.mongo.opcounters.update?.toLocaleString?.() || 0}</p>
                  )}
                </>
              )}
            </div>
            {/* MySQL */}
            <div className="rounded-xl border border-border bg-card p-5" data-testid="db-mysql">
              <h3 className="font-semibold mb-3 inline-flex items-center gap-2"><Database size={18} className="text-sky-500" /> MySQL / MariaDB {databases.mysql.version && <span className="text-xs text-muted-foreground font-normal">{databases.mysql.version}</span>}</h3>
              {!databases.mysql.available ? (
                <div className="text-sm text-muted-foreground">
                  <p>{databases.mysql.note}</p>
                  <p className="mt-2 text-xs">Configúralo en la pestaña «Plesk & MySQL». En tu VPS con Plesk suele detectarse solo.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <Stat label="Tamaño total" value={databases.mysql.totalHuman} />
                    <Stat label="Conexiones" value={`${databases.mysql.threadsConnected} / ${databases.mysql.maxConnections}`} />
                    <Stat label="Consultas" value={Number(databases.mysql.queries).toLocaleString()} />
                    <Stat label="Uptime" value={fmtDur(databases.mysql.uptime)} />
                    <Stat label="Consultas lentas" value={databases.mysql.slowQueries} />
                    <Stat label="Conex. abortadas" value={databases.mysql.abortedConnects} />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Bases de datos ({databases.mysql.databases.length})</p>
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {databases.mysql.databases.map((d, i) => (
                          <tr key={i} data-testid={`mysqldb-${i}`} className="border-b border-border/50 last:border-0">
                            <td className="py-1.5 font-medium">{d.name}</td>
                            <td className="py-1.5 text-right text-xs text-muted-foreground">{d.tables} tablas</td>
                            <td className="py-1.5 text-right text-muted-foreground">{d.human}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      )}

      {/* SERVICIOS & APPS */}
      {tab === "services" && (
        services === "loading" ? <div className="text-muted-foreground">Cargando servicios…</div> :
        !services ? <div className="text-muted-foreground">Pulsa Actualizar.</div> : (
          <div className="space-y-6">
            {!services.apps.available ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 inline-flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5" /> {services.apps.note}</div>
            ) : (
              <>
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-semibold mb-4 inline-flex items-center gap-2"><Boxes size={18} /> Tus aplicaciones</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {services.keywords.map((kw) => {
                      const list = services.apps.apps[kw] || [];
                      return (
                        <div key={kw} data-testid={`app-${kw}`} className="rounded-lg border border-border bg-muted/30 p-3">
                          <p className="font-semibold capitalize mb-2">{kw}</p>
                          {list.length === 0 ? <p className="text-xs text-muted-foreground">Sin servicios systemd detectados con este nombre.</p> : list.map((s, i) => (
                            <div key={i} className="flex items-center justify-between py-1 text-sm">
                              <span className="truncate">{s.name} <span className="text-xs text-muted-foreground">· {s.memoryH}</span></span>
                              <StatePill state={s.state} />
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">{services.apps.runningCount} servicios activos de {services.apps.totalCount} totales.</p>
                </div>

                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-semibold mb-4 inline-flex items-center gap-2"><ListTree size={18} /> Servicios activos</h3>
                  <div className="max-h-96 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {services.apps.running.map((s, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-1.5 text-sm">
                        <span className="truncate">{s.name}</span><StatePill state={s.state} />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-semibold mb-4 inline-flex items-center gap-2"><Plug size={18} /> Puertos a la escucha</h3>
              {!services.ports.available ? <p className="text-sm text-muted-foreground">{services.ports.note}</p> : (
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="p-2 font-medium">Puerto</th><th className="p-2 font-medium">Dirección</th><th className="p-2 font-medium">Proceso</th></tr></thead>
                    <tbody>
                      {services.ports.ports.map((p, i) => (
                        <tr key={i} data-testid={`port-${i}`} className="border-b border-border/50 last:border-0">
                          <td className="p-2 font-mono font-medium">{p.port}</td>
                          <td className="p-2 text-xs text-muted-foreground">{p.local}</td>
                          <td className="p-2 text-xs font-mono break-all">{p.process || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* DOMINIOS & ATAQUES */}
      {tab === "domains" && (
        domains === "loading" ? <div className="text-muted-foreground">Analizando logs…</div> :
        !domains ? <div className="text-muted-foreground">Pulsa Actualizar.</div> : (
          <div className="space-y-6">
            {!domains.traffic.available && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 inline-flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5" /> {domains.traffic.note}
              </div>
            )}
            {domains.traffic.available && (
              <>
                {/* Panel destacado de IPs atacando */}
                {(domains.traffic.attackers || []).length === 0 ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 inline-flex items-center gap-2" data-testid="no-attacks">
                    <CheckCircle2 size={16} /> Sin ataques detectados en los últimos {domains.traffic.windowMinutes} min.
                  </div>
                ) : (
                  <div className="rounded-xl border-2 border-red-500/40 bg-red-500/5 p-5" data-testid="attackers-panel">
                    <h3 className="font-semibold mb-4 inline-flex items-center gap-2 text-red-600"><ShieldAlert size={18} /> {domains.traffic.attackers.length} IP(s) atacando · últimos {domains.traffic.windowMinutes} min</h3>
                    <div className="space-y-3">
                      {domains.traffic.attackers.map((a, i) => (
                        <div key={i} data-testid={`attacker-${i}`} className="rounded-lg border border-border bg-card p-3">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${a.confidence === "high" ? "bg-red-500/15 text-red-600" : "bg-amber-500/15 text-amber-600"}`}>{a.confidence === "high" ? "Confianza alta" : "Confianza media"}</span>
                            <span className="font-mono font-semibold">{a.ip}</span>
                            <span className="text-xs text-muted-foreground">→ {a.domain}</span>
                            {a.kinds.map((k) => <span key={k} className="text-[10px] uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded">{({brute_force:"Fuerza bruta",vuln_scan:"Escaneo",injection:"Inyección",flood:"Flood/DoS"})[k] || k}</span>)}
                            <span className="ml-auto text-xs text-muted-foreground">{a.requests} pet · {a.rpm}/min</span>
                          </div>
                          <ul className="list-disc pl-5 text-sm space-y-0.5">{a.reasons.map((r, ri) => <li key={ri}>{r}</li>)}</ul>
                          {a.userAgent && <p className="text-[11px] text-muted-foreground mt-1 font-mono truncate">UA: {a.userAgent}{a.knownBot ? " · (parece bot conocido — verificar, el UA se puede falsificar)" : ""}</p>}
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-3">Umbrales configurables en «Plesk & MySQL». Ventana de análisis: {domains.traffic.windowMinutes} min.</p>
                  </div>
                )}

                <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-semibold mb-4 inline-flex items-center gap-2"><ShieldAlert size={18} /> Tráfico por dominio ({domains.traffic.windowMinutes} min)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead><tr className="text-left text-muted-foreground border-b border-border">
                      <th className="p-2 font-medium">Dominio</th><th className="p-2 font-medium text-right">Peticiones</th>
                      <th className="p-2 font-medium text-right">Errores</th><th className="p-2 font-medium">IP más activa</th><th className="p-2 font-medium">Alerta</th>
                    </tr></thead>
                    <tbody>
                      {domains.traffic.domains.map((d, i) => (
                        <Fragment key={i}>
                          <tr data-testid={`traffic-${i}`} onClick={() => setOpenDom(openDom === i ? null : i)}
                            className={`border-b border-border/50 last:border-0 cursor-pointer hover:bg-muted/40 ${d.suspicious ? "bg-red-500/5" : ""}`}>
                            <td className="p-2 font-medium">{d.domain}</td>
                            <td className="p-2 text-right">{d.requests.toLocaleString()}</td>
                            <td className="p-2 text-right">{d.errors} ({d.errorRate}%)</td>
                            <td className="p-2 text-xs">{d.topIps[0] ? `${d.topIps[0].ip} (${d.topIps[0].hits})` : "—"}</td>
                            <td className="p-2">{d.suspicious ? <span data-testid={`attack-${i}`} className={`inline-flex items-center gap-1 font-semibold text-xs ${d.severity === "high" ? "text-red-600" : "text-amber-600"}`}><AlertTriangle size={13} /> {d.severity === "high" ? "Ataque probable" : "Posible ataque"} · ver</span> : <span className="text-emerald-600 text-xs">OK</span>}</td>
                          </tr>
                          {openDom === i && (
                            <tr data-testid={`traffic-detail-${i}`}><td colSpan={5} className="p-4 bg-muted/30">
                              {d.reasons.length > 0 ? (
                                <div className="mb-3">
                                  <p className="text-xs font-semibold text-red-600 mb-1 inline-flex items-center gap-1.5"><ShieldAlert size={14} /> Motivos de la alerta</p>
                                  <ul className="list-disc pl-5 space-y-0.5 text-sm">{d.reasons.map((r, ri) => <li key={ri}>{r}</li>)}</ul>
                                </div>
                              ) : <p className="text-sm text-muted-foreground mb-2">Sin indicios de ataque. Detalle del tráfico:</p>}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                <div><p className="font-semibold mb-1">Top IPs</p>{d.topIps.map((x, xi) => <div key={xi} className="flex justify-between"><span className="font-mono">{x.ip}</span><span className="text-muted-foreground">{x.hits}</span></div>)}</div>
                                <div><p className="font-semibold mb-1">Rutas más pedidas</p>{d.topPaths.map((x, xi) => <div key={xi} className="flex justify-between gap-2"><span className="font-mono truncate">{x.path}</span><span className="text-muted-foreground">{x.hits}</span></div>)}</div>
                                <div><p className="font-semibold mb-1">Códigos de estado</p>{Object.entries(d.statusCodes).map(([c, n]) => <div key={c} className="flex justify-between"><span className="font-mono">{c}</span><span className="text-muted-foreground">{n}</span></div>)}</div>
                              </div>
                              {d.flaggedIps && d.flaggedIps.length > 0 && (
                                <div className="mt-3">
                                  <p className="font-semibold text-xs text-red-600 mb-1">IPs marcadas ({d.flaggedIps.length})</p>
                                  {d.flaggedIps.map((f, fi) => (
                                    <div key={fi} className="text-xs py-1 border-t border-border/40 first:border-0">
                                      <span className="font-mono font-semibold">{f.ip}</span> · {f.confidence === "high" ? "alta" : "media"} · {f.requests} pet ({f.rpm}/min)
                                      <span className="text-muted-foreground"> — {f.reasons.join(" ")}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td></tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              </>
            )}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-semibold mb-4 inline-flex items-center gap-2"><HardDrive size={18} /> Uso de disco por dominio</h3>
              {!domains.disk.available ? <p className="text-sm text-muted-foreground">{domains.disk.note}</p> : (
                <table className="w-full text-sm">
                  <tbody>
                    {domains.disk.domains.map((d, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 font-medium">{d.domain}</td>
                        <td className="py-1.5 text-right text-muted-foreground">{d.human}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      )}

      {/* CAMBIOS DE ARCHIVOS */}
      {tab === "files" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Últimas</span>
            <select data-testid="changes-hours" value={hours} onChange={(e) => { const h = Number(e.target.value); setHours(h); loadChanges(h); }}
              className="rounded-md border border-border bg-card px-2 py-1 text-sm">
              <option value={6}>6 horas</option><option value={24}>24 horas</option><option value={72}>3 días</option><option value={168}>7 días</option>
            </select>
          </div>
          {changes === "loading" ? <div className="text-muted-foreground">Escaneando…</div> :
          !changes ? <div className="text-muted-foreground">Pulsa Actualizar.</div> :
          !changes.available ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 inline-flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5" /> {changes.note}</div> : (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-semibold mb-4 inline-flex items-center gap-2"><FileClock size={18} /> {changes.count} archivo(s) modificados</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[680px]">
                  <thead><tr className="text-left text-muted-foreground border-b border-border">
                    <th className="p-2 font-medium">Fecha</th><th className="p-2 font-medium">Dominio</th><th className="p-2 font-medium">Ruta</th><th className="p-2 font-medium text-right">Tamaño</th><th className="p-2 font-medium"></th>
                  </tr></thead>
                  <tbody>
                    {changes.files.map((f, i) => (
                      <tr key={i} data-testid={`change-${i}`} className={`border-b border-border/50 last:border-0 ${f.suspicious ? "bg-amber-500/5" : ""}`}>
                        <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(f.mtime).toLocaleString("es-ES")}</td>
                        <td className="p-2 font-medium">{f.domain}</td>
                        <td className="p-2 text-xs font-mono break-all">{f.suspicious && <AlertTriangle size={12} className="inline mr-1 text-amber-500" />}{f.path}</td>
                        <td className="p-2 text-right text-muted-foreground">{f.sizeH}</td>
                        <td className="p-2 text-right">
                          <button data-testid={`change-plesk-${i}`} onClick={() => openInPlesk(f)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline whitespace-nowrap">
                            <ExternalLink size={12} /> Revisar en Plesk
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PLESK */}
      {tab === "plesk" && (
        <div className="space-y-6 max-w-3xl">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold mb-1 inline-flex items-center gap-2"><KeyRound size={18} /> Conexión con Plesk</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Introduce la API key de Plesk (X-API-Key). Genérala en el VPS con:
              <code className="block mt-1 rounded bg-muted px-2 py-1 text-xs">curl -k -X POST --user 'admin:CONTRASEÑA' -d '{"{}"}' "https://127.0.0.1:8443/api/v2/auth/keys"</code>
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Host de Plesk</label>
                <Input data-testid="plesk-host" value={hostInput} onChange={(e) => setHostInput(e.target.value)} placeholder="https://127.0.0.1:8443" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">API Key {plesk.configured && <span className="text-emerald-600 text-xs">· configurada {plesk.pleskApiKeyMasked}</span>}</label>
                <Input data-testid="plesk-apikey" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder={plesk.configured ? "•••• (dejar en blanco para no cambiar)" : "Pega aquí tu API key"} className="mt-1" />
              </div>
              <div className="pt-3 border-t border-border">
                <p className="text-sm font-semibold mb-2 inline-flex items-center gap-2"><Database size={15} /> MySQL / MariaDB (solo lectura)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Host</label>
                    <Input data-testid="mysql-host" value={plesk.mysqlHost || ""} onChange={(e) => setPlesk({ ...plesk, mysqlHost: e.target.value })} placeholder="127.0.0.1" className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Puerto</label>
                    <Input data-testid="mysql-port" value={plesk.mysqlPort || 3306} onChange={(e) => setPlesk({ ...plesk, mysqlPort: Number(e.target.value) })} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Usuario</label>
                    <Input data-testid="mysql-user" value={plesk.mysqlUser || ""} onChange={(e) => setPlesk({ ...plesk, mysqlUser: e.target.value })} placeholder="admin" className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Contraseña {plesk.mysqlConfigured && <span className="text-emerald-600">· ok {plesk.mysqlPasswordMasked}</span>}</label>
                    <Input data-testid="mysql-pw" type="password" value={mysqlPw} onChange={(e) => setMysqlPw(e.target.value)} placeholder={plesk.mysqlConfigured ? "•••• (auto en VPS)" : "clave o auto (Plesk)"} className="mt-1" />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">En tu VPS con Plesk se detecta automáticamente (usuario admin). Solo rellena si usas otra cuenta de solo lectura.</p>
              </div>
              <div className="flex gap-2">
                <Button data-testid="plesk-save" onClick={savePlesk} disabled={savingPlesk}>{savingPlesk ? "Guardando…" : "Guardar y probar"}</Button>
                <Button data-testid="plesk-open-panel" variant="outline" onClick={openPleskPanel} disabled={!plesk.configured}><ExternalLink size={14} className="mr-1.5" /> Abrir panel de Plesk</Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold inline-flex items-center gap-2"><Globe size={18} /> Dominios en Plesk</h3>
              <Button data-testid="plesk-load-domains" size="sm" variant="outline" onClick={loadPleskDomains} disabled={!plesk.configured}>Cargar dominios</Button>
            </div>
            {pleskDomains === "loading" ? <p className="text-sm text-muted-foreground">Cargando…</p> :
            !pleskDomains ? <p className="text-sm text-muted-foreground">{plesk.configured ? "Pulsa «Cargar dominios»." : "Configura Plesk primero."}</p> :
            pleskDomains.length === 0 ? <p className="text-sm text-muted-foreground">Sin dominios.</p> : (
              <table className="w-full text-sm">
                <tbody>
                  {pleskDomains.map((d, i) => (
                    <tr key={i} data-testid={`plesk-domain-${i}`} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5 font-medium">{d.name || d.ascii_name || d.id}</td>
                      <td className="py-1.5 text-right"><StatePill state={(d.hosting_type && d.status === "active") || d.status === "active"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
