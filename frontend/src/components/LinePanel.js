import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StatusPill } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Signal, Wifi, Lock, Unlock, Gauge, Phone, MessageSquare, Database, QrCode, RefreshCw, CreditCard, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function LinePanel({ lineNumber, backLink, backLabel }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [line, setLine] = useState(null);
  const [busy, setBusy] = useState(false);
  const [esim, setEsim] = useState(null);
  const [spnOpen, setSpnOpen] = useState(false);
  const [spn, setSpn] = useState("");
  const [climitOpen, setClimitOpen] = useState(false);
  const [climit, setClimit] = useState("");

  const load = () => api.get(`/lines/${lineNumber}`).then((r) => {
    setLine(r.data);
    if (r.data.eSim) api.get(`/lines/${lineNumber}/esim`).then((e) => setEsim(e.data)).catch(() => {});
  });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [lineNumber]);
  if (!line) return <div className="text-muted-foreground">Cargando línea…</div>;

  const isMobile = line.family === "Mobile";
  const pct = line.totalGB ? Math.min(100, Math.round((line.usedGB / line.totalGB) * 100)) : 0;

  const duplicateSim = async () => {
    setBusy(true);
    try { const { data } = await api.post(`/lines/${lineNumber}/sim-duplicate`); toast.success(`Nueva SIM: ${data.icc}`); load(); }
    catch (e) { toast.error(apiErr(e)); } finally { setBusy(false); }
  };
  const saveSpn = async () => {
    try { await api.put(`/lines/${lineNumber}/spn`, { spn }); toast.success("SPN actualizado"); setSpnOpen(false); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const saveClimit = async () => {
    try { await api.put(`/lines/${lineNumber}/credit-limit`, { creditLimit: parseFloat(climit) }); toast.success("Límite de crédito actualizado"); setClimitOpen(false); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const showSim = async () => {
    try { const { data } = await api.get(`/lines/${lineNumber}/sim`); toast.info(`IMSI ${data.imsi} · PIN ${data.pin} · PUK ${data.puk}`, { duration: 8000 }); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const toggleBlock = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/lines/${lineNumber}/toggle-block`);
      setLine((l) => ({ ...l, status: data.status }));
      toast.success(data.status === "ACTIVE" ? "Línea reactivada" : "Línea suspendida");
    } catch (e) { toast.error(apiErr(e)); } finally { setBusy(false); }
  };

  const toggleSva = async (code, status) => {
    const svas = line.svas.map((s) => (s.code === code ? { ...s, status } : s));
    setLine((l) => ({ ...l, svas }));
    try { await api.put(`/lines/${lineNumber}/svas`, { svas: [{ code, status }] }); }
    catch (e) { toast.error(apiErr(e)); load(); }
  };

  return (
    <div data-testid="line-panel">
      <Link to={backLink} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-4"><ArrowLeft size={15} /> {backLabel}</Link>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center h-12 w-12 rounded-lg bg-primary/10 text-primary">
            {isMobile ? <Signal size={22} /> : <Wifi size={22} />}
          </div>
          <div>
            <h1 className="font-heading text-3xl font-700 tracking-tight">{line.lineNumber}</h1>
            <p className="text-sm text-muted-foreground">{line.productName} · {line.price?.toFixed(2)} €/mes</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={line.status} />
          <Button data-testid="toggle-block-btn" onClick={toggleBlock} disabled={busy}
            variant={line.status === "ACTIVE" ? "outline" : "default"} className="rounded-full gap-2">
            {line.status === "ACTIVE" ? <><Lock size={15} /> Suspender</> : <><Unlock size={15} /> Reactivar</>}
          </Button>
        </div>
      </div>

      {isMobile && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { icon: Phone, label: "Minutos nacionales", value: `${line.nationalMinutes ?? 0}`, testid: "usage-minutes" },
            { icon: MessageSquare, label: "SMS enviados", value: `${line.smsUsed ?? 0}`, testid: "usage-sms" },
            { icon: Database, label: "Datos usados", value: `${line.usedGB} GB`, testid: "usage-data" },
          ].map((s) => (
            <div key={s.label} data-testid={s.testid} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-primary mb-2"><s.icon size={16} /><span className="overline text-muted-foreground">{s.label}</span></div>
              <p className="font-heading text-2xl font-700">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {isMobile && (
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-center gap-2 text-primary mb-4"><Gauge size={18} /><h3 className="font-heading font-600 text-foreground">Consumo de datos</h3></div>
            <div className="relative h-40 grid place-items-center">
              <svg viewBox="0 0 120 120" className="h-40 w-40 -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
                <motion.circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--primary))" strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 52}
                  initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - pct / 100) }}
                  transition={{ duration: 1 }} />
              </svg>
              <div className="absolute text-center">
                <p className="font-heading text-3xl font-700">{line.usedGB}</p>
                <p className="text-xs text-muted-foreground">de {line.totalGB} GB</p>
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground mt-2">{(line.totalGB - line.usedGB).toFixed(1)} GB disponibles</p>
          </div>
        )}

        {isMobile && (
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="font-heading font-600 mb-4">Servicios (SVAs)</h3>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {line.svas?.map((s) => (
                <div key={s.code} className="flex items-center justify-between">
                  <span className="text-sm">{s.spanishName}</span>
                  <Switch data-testid={`sva-${s.code}`} checked={s.status} onCheckedChange={(v) => toggleSva(s.code, v)} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-6 space-y-3">
          <h3 className="font-heading font-600 mb-1">Detalles</h3>
          <Row l="Familia" v={isMobile ? "Móvil" : "Fibra"} />
          <Row l="ICC / SIM" v={line.icc} />
          <Row l="eSIM" v={line.eSim ? "Sí" : "No"} />
          {isMobile && <Row l="Límite de crédito" v={`${line.creditLimit} €`} />}
          <Row l="Alta" v={line.created?.slice(0, 10)} />
        </div>

        {line.eSim && esim && (
          <div data-testid="esim-card" className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-center gap-2 text-primary mb-4"><QrCode size={18} /><h3 className="font-heading font-600 text-foreground">eSIM</h3></div>
            <div className="flex flex-col items-center">
              <img src={esim.qrUrl} alt="QR eSIM" className="h-40 w-40 rounded-md border border-border bg-white p-2" />
              <p className="text-xs text-muted-foreground mt-3 text-center">Escanea el QR desde tu móvil para instalar la eSIM.</p>
              <div className="w-full mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Código activación</span><span className="font-medium break-all text-right">{esim.activationCode}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">SM-DP+</span><span className="font-medium">{esim.smdpAddress}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">PIN / PUK</span><span className="font-medium">{esim.pin} / {esim.puk}</span></div>
              </div>
            </div>
          </div>
        )}

        {isAdmin && isMobile && (
          <div data-testid="line-actions-card" className="rounded-lg border border-border bg-card p-6">
            <h3 className="font-heading font-600 mb-4">Acciones de SIM / línea</h3>
            <div className="space-y-2.5">
              <Button data-testid="sim-duplicate-btn" variant="outline" className="w-full justify-start gap-2 rounded-md" disabled={busy} onClick={duplicateSim}><RefreshCw size={15} /> Duplicar SIM</Button>
              <Button data-testid="sim-info-btn" variant="outline" className="w-full justify-start gap-2 rounded-md" onClick={showSim}><ScanLine size={15} /> Ver datos SIM (IMSI/PIN/PUK)</Button>
              <Button data-testid="spn-btn" variant="outline" className="w-full justify-start gap-2 rounded-md" onClick={() => { setSpn(line.spn || ""); setSpnOpen(true); }}><Signal size={15} /> Cambiar SPN (nombre red)</Button>
              <Button data-testid="climit-btn" variant="outline" className="w-full justify-start gap-2 rounded-md" onClick={() => { setClimit(String(line.creditLimit || "")); setClimitOpen(true); }}><CreditCard size={15} /> Límite de crédito</Button>
            </div>
          </div>
        )}

        {isMobile && line.cdrs?.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-6 lg:col-span-3">
            <h3 className="font-heading font-600 mb-4">Últimos consumos (CDRs)</h3>
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left"><tr>
                <th className="py-2 font-medium">Tipo</th><th className="py-2 font-medium">Destino</th>
                <th className="py-2 font-medium hidden sm:table-cell">Fecha</th><th className="py-2 font-medium text-right">Importe / Datos</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {line.cdrs.map((c, i) => (
                  <tr key={i}>
                    <td className="py-2">{c.type}</td>
                    <td className="py-2 text-muted-foreground">{c.calledNumber || c.destination}</td>
                    <td className="py-2 hidden sm:table-cell text-muted-foreground">{c.date?.slice(0, 10)}</td>
                    <td className="py-2 text-right">{c.type === "DATA" ? `${(c.bytes / 1e6).toFixed(1)} MB` : `${c.price.toFixed(2)} €`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={spnOpen} onOpenChange={setSpnOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cambiar SPN</DialogTitle><DialogDescription>Nombre de red que se muestra en el dispositivo.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label>SPN</Label><Input data-testid="spn-input" value={spn} onChange={(e) => setSpn(e.target.value)} /></div>
          <DialogFooter><Button data-testid="save-spn-btn" onClick={saveSpn} className="rounded-full">Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={climitOpen} onOpenChange={setClimitOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Límite de crédito</DialogTitle><DialogDescription>Importe máximo de consumo antes de bloquear la línea.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label>Límite (€)</Label><Input data-testid="climit-input" type="number" step="1" value={climit} onChange={(e) => setClimit(e.target.value)} /></div>
          <DialogFooter><Button data-testid="save-climit-btn" onClick={saveClimit} className="rounded-full">Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ l, v }) {
  return (
    <div className="flex justify-between gap-4 text-sm border-b border-border/60 pb-2">
      <span className="text-muted-foreground">{l}</span>
      <span className="font-medium text-right break-all">{v || "—"}</span>
    </div>
  );
}
