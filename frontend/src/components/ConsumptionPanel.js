import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Gauge, Phone, MessageSquare, Wifi, ChevronDown } from "lucide-react";

const fmtDur = (s) => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, "0")}`;

export const UsageBar = ({ used, total }) => {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1"><span className="font-semibold">{Number(used || 0).toFixed(2)} GB</span><span className="text-muted-foreground">{total ? `de ${total} GB` : "sin límite"}</span></div>
      <div className="h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${pct > 85 ? "bg-[#FF7A00]" : "bg-[#015EEF]"}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
};

const LineUsage = ({ l }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border p-4 space-y-3" data-testid={`consumption-line-${l.lineNumber}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-heading font-bold">{l.lineNumber}</span>
        <span className="text-xs text-muted-foreground">{l.productName}</span>
        {l.status && <span className="ml-auto text-[11px] uppercase font-semibold text-muted-foreground">{l.status}</span>}
      </div>
      <div className="grid sm:grid-cols-3 gap-4 items-center">
        <div className="flex items-center gap-2"><Wifi size={16} className="text-primary shrink-0" /><UsageBar used={l.usedGB} total={l.totalGB} /></div>
        <div className="flex items-center gap-2 text-sm"><Phone size={16} className="text-primary" /><b>{l.nationalMinutes}</b> min · {l.callsCount} llamadas</div>
        <div className="flex items-center gap-2 text-sm"><MessageSquare size={16} className="text-primary" /><b>{l.sms}</b> SMS</div>
      </div>
      {l.calls?.length > 0 && (
        <div>
          <button type="button" onClick={() => setOpen(!open)} className="text-xs text-primary inline-flex items-center gap-1" data-testid={`consumption-calls-toggle-${l.lineNumber}`}>
            {open ? "Ocultar" : "Ver"} detalle de llamadas <ChevronDown size={13} className={open ? "rotate-180" : ""} />
          </button>
          {open && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-md border divide-y text-xs">
              {l.calls.map((c, i) => (
                <div key={i} className="flex gap-3 px-3 py-1.5"><span className="w-36 text-muted-foreground">{c.date ? new Date(c.date).toLocaleString("es-ES") : "—"}</span><span className="flex-1">{c.number || "—"}</span><span className="font-mono">{fmtDur(c.duration)}</span></div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ConsumptionPanel = ({ fiscalId }) => {
  const [lines, setLines] = useState(null);
  useEffect(() => { api.get(`/customers/${fiscalId}/consumption`).then((r) => setLines(r.data)).catch(() => setLines([])); }, [fiscalId]);
  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-3" data-testid="consumption-panel">
      <h3 className="font-heading font-bold flex items-center gap-2"><Gauge size={18} className="text-primary" /> Consumo <span className="text-xs font-normal text-muted-foreground">(solo lectura)</span></h3>
      {lines === null && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {lines?.length === 0 && <p className="text-sm text-muted-foreground" data-testid="consumption-empty">Este cliente no tiene líneas.</p>}
      {lines?.map((l) => <LineUsage key={l.lineNumber} l={l} />)}
    </section>
  );
};
