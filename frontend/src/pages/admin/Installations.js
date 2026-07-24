import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { PageHeader, StatusPill } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Wrench, CalendarClock, XCircle } from "lucide-react";
import { toast } from "sonner";

const STATUS = {
  PENDING_APPOINTMENT: { c: "bg-warning/15 text-warning", t: "Pendiente de cita" },
  SCHEDULED: { c: "bg-primary/12 text-primary", t: "Agendada" },
  COMPLETED: { c: "bg-success/12 text-success", t: "Completada" },
  CANCELLED: { c: "bg-destructive/12 text-destructive", t: "Cancelada" },
};

export default function Installations() {
  const [items, setItems] = useState([]);
  const [detail, setDetail] = useState(null);
  const [slot, setSlot] = useState("");
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(null);

  const load = () => api.get("/installations").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const openSchedule = async (i) => {
    const { data } = await api.get(`/installations/${i.installationId}`);
    setDetail(data); setSlot("");
  };

  const schedule = async () => {
    if (!slot) return;
    const [date, time] = slot.split("|");
    try {
      await api.post(`/installations/${detail.installationId}/appointment`, { date, slot: time });
      toast.success("Cita agendada");
      setDetail(null); load();
    } catch (e) { toast.error(apiErr(e)); }
  };

  const cancel = async (i) => {
    try {
      await api.post(`/installations/${i.installationId}/cancel`, { reason: reason || "Cancelada por el distribuidor" });
      toast.success("Instalación cancelada");
      setCancelling(null); setReason(""); load();
    } catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div data-testid="installations-page">
      <PageHeader overline="Provisión" title="Instalaciones" subtitle="Instalaciones de fibra: agenda citas y gestiona su estado." />
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Cliente</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Producto</th>
              <th className="px-4 py-3 font-medium">Cita</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((i) => {
              const s = STATUS[i.status] || { c: "bg-muted", t: i.status };
              return (
                <tr key={i.id} data-testid={`installation-row-${i.installationId}`}>
                  <td className="px-4 py-3 font-medium">{i.installationId}</td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{i.customerName}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{i.productName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{i.appointment ? `${i.appointment.date} ${i.appointment.slot}` : "—"}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.c}`}>{s.t}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      {i.status !== "CANCELLED" && i.status !== "COMPLETED" && (
                        <Button data-testid={`schedule-${i.installationId}`} variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => openSchedule(i)}>
                          <CalendarClock size={14} /> Agendar
                        </Button>
                      )}
                      {i.status !== "CANCELLED" && (
                        <Button data-testid={`cancel-install-${i.installationId}`} variant="outline" size="sm" className="rounded-full text-destructive hover:bg-destructive/10" onClick={() => setCancelling(i)}>
                          <XCircle size={14} />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Sin instalaciones.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Agendar cita de instalación</DialogTitle>
            <DialogDescription>Selecciona una franja disponible para la instalación.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Franja disponible</Label>
            <Select value={slot} onValueChange={setSlot}>
              <SelectTrigger data-testid="slot-select"><SelectValue placeholder="Elige fecha y hora" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {(detail?.availableAppointments || []).map((a, idx) => (
                  <SelectItem key={idx} value={`${a.date}|${a.slot}`}>{a.date} · {a.slot}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter><Button data-testid="confirm-schedule-btn" onClick={schedule} className="rounded-full">Confirmar cita</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar instalación</DialogTitle>
            <DialogDescription>Indica el motivo de la cancelación.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5"><Label>Motivo</Label><Input data-testid="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo" /></div>
          <DialogFooter><Button data-testid="confirm-cancel-install-btn" onClick={() => cancel(cancelling)} className="rounded-full bg-destructive hover:bg-destructive/90">Cancelar instalación</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
