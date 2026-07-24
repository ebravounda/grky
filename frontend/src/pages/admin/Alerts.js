import { useEffect, useState, useCallback } from "react";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, CheckCircle2, Info, XCircle, Wifi, CreditCard, Mail,
  RefreshCw, CheckCheck, Server, Bell,
} from "lucide-react";
import { toast } from "sonner";

const LEVEL = {
  error: { icon: XCircle, c: "text-destructive", bg: "bg-destructive/10", label: "Error" },
  warning: { icon: AlertTriangle, c: "text-warning", bg: "bg-warning/10", label: "Aviso" },
  success: { icon: CheckCircle2, c: "text-success", bg: "bg-success/10", label: "OK" },
  info: { icon: Info, c: "text-primary", bg: "bg-primary/10", label: "Info" },
};

function Semaphore({ ok, okText, koText, icon: Icon }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
      <span className="flex items-center gap-2 text-sm font-medium"><Icon size={16} /> {ok ? okText : koText}</span>
      <span className={`h-3 w-3 rounded-full ${ok ? "bg-success" : "bg-destructive"} shadow`} />
    </div>
  );
}

export default function Alerts() {
  const [health, setHealth] = useState(null);
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, e] = await Promise.all([
        api.get("/system/health"),
        api.get("/events", { params: filter !== "all" ? { level: filter } : {} }),
      ]);
      setHealth(h.data);
      setEvents(e.data.events);
    } catch (err) { toast.error(apiErr(err)); } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const markAll = async () => { await api.post("/events/read-all"); toast.success("Marcadas como leídas"); load(); };
  const markRead = async (id) => { await api.post(`/events/${id}/read`); load(); };

  return (
    <div data-testid="alerts-page">
      <PageHeader
        overline="Monitorización" title="Alertas del sistema"
        subtitle="Errores y eventos de tus integraciones en tiempo real."
        action={
          <div className="flex gap-2">
            <Button data-testid="refresh-alerts-btn" variant="outline" className="rounded-full gap-2" onClick={load} disabled={loading}>
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Actualizar
            </Button>
            <Button data-testid="mark-all-read-btn" className="rounded-full gap-2" onClick={markAll}>
              <CheckCheck size={15} /> Marcar leídas
            </Button>
          </div>
        }
      />

      {health && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8" data-testid="health-semaphores">
          <Semaphore ok={health.likes.live} icon={Wifi} okText="Likes: conectada" koText="Likes: sin conexión (IP)" />
          <Semaphore ok={health.stripe.ok} icon={CreditCard} okText={`Stripe: activo (${health.stripe.mode})`} koText="Stripe: error" />
          <Semaphore ok={health.email.configured} icon={Mail} okText="Email: configurado" koText="Email: sin API key" />
          <Semaphore ok={health.billing.pastDue === 0} icon={Server}
            okText={`Cobros: ${health.billing.activeSubscriptions} activos`} koText={`Cobros: ${health.billing.pastDue} impagos`} />
        </div>
      )}

      {health && !health.likes.live && (
        <div data-testid="likes-error-banner" className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-destructive"><XCircle size={16} /> Error de conexión con Likes Telecom</p>
          <p className="text-sm text-muted-foreground mt-1">{health.likes.error}</p>
          <p className="text-xs text-muted-foreground mt-1">Autoriza la IP de salida del servidor en el panel de Likes Telecom para activar los datos reales.</p>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {["all", "error", "warning", "success", "info"].map((f) => (
          <button key={f} data-testid={`filter-${f}`} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
            {f === "all" ? "Todas" : LEVEL[f].label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
        {events.map((e) => {
          const L = LEVEL[e.level] || LEVEL.info;
          return (
            <div key={e.id} data-testid={`event-${e.id}`}
              className={`flex items-start gap-3 p-4 ${e.read ? "opacity-60" : ""}`}>
              <span className={`grid place-items-center h-8 w-8 rounded-md shrink-0 ${L.bg} ${L.c}`}><L.icon size={16} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{e.message}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="uppercase font-semibold">{e.source}</span> · {new Date(e.created_at).toLocaleString("es-ES")}
                </p>
              </div>
              {!e.read && (
                <button data-testid={`mark-read-${e.id}`} onClick={() => markRead(e.id)}
                  className="text-xs text-primary hover:underline shrink-0">Marcar leída</button>
              )}
            </div>
          );
        })}
        {events.length === 0 && (
          <div className="p-10 text-center text-muted-foreground flex flex-col items-center gap-2">
            <Bell size={28} className="opacity-40" /> No hay eventos.
          </div>
        )}
      </div>
    </div>
  );
}
