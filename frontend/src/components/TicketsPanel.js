import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { PageHeader, StatusPill } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LifeBuoy } from "lucide-react";
import { toast } from "sonner";

export default function TicketsPanel({ isClient = false }) {
  const [tickets, setTickets] = useState([]);
  const [typologies, setTypologies] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ typology: "", description: "", fiscalId: "" });

  const load = () => api.get("/tickets").then((r) => setTickets(r.data));
  useEffect(() => {
    load();
    api.get("/ticket-typologies").then((r) => setTypologies(r.data));
    if (!isClient) api.get("/customers").then((r) => setCustomers(r.data));
  }, [isClient]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.typology) return toast.error("Selecciona una tipología");
    setSaving(true);
    try {
      const category = form.typology.split("::")[0].trim();
      const payload = { category, typology: form.typology, description: form.description };
      if (!isClient && form.fiscalId) payload.fiscalIds = [form.fiscalId];
      await api.post("/tickets", payload);
      toast.success("Ticket creado");
      setOpen(false);
      setForm({ typology: "", description: "", fiscalId: "" });
      load();
    } catch (e) { toast.error(apiErr(e)); } finally { setSaving(false); }
  };

  return (
    <div data-testid="tickets-page">
      <PageHeader
        overline="Soporte" title={isClient ? "Mis tickets" : "Soporte"} subtitle="Incidencias y solicitudes de soporte técnico."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="new-ticket-btn" className="rounded-full gap-2"><LifeBuoy size={16} /> Nuevo ticket</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Crear ticket de soporte</DialogTitle>
                <DialogDescription>Selecciona la tipología y describe la incidencia.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Tipología</Label>
                  <Select value={form.typology} onValueChange={(v) => set("typology", v)}>
                    <SelectTrigger data-testid="ticket-typology"><SelectValue placeholder="Selecciona tipología" /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {typologies.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {!isClient && (
                  <div className="space-y-1.5">
                    <Label>Cliente (opcional)</Label>
                    <Select value={form.fiscalId} onValueChange={(v) => set("fiscalId", v)}>
                      <SelectTrigger data-testid="ticket-customer"><SelectValue placeholder="Asociar cliente" /></SelectTrigger>
                      <SelectContent>
                        {customers.map((c) => <SelectItem key={c.fiscalId} value={c.fiscalId}>{c.name} {c.firstSurname} — {c.fiscalId}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Descripción</Label>
                  <Textarea data-testid="ticket-description" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Describe el problema…" rows={4} />
                </div>
              </div>
              <DialogFooter>
                <Button data-testid="submit-ticket-btn" onClick={submit} disabled={saving} className="rounded-full">{saving ? "Creando…" : "Crear ticket"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="space-y-3">
        {tickets.map((t) => (
          <div key={t.id} data-testid={`ticket-${t.ticketId}`} className="rounded-lg border border-border bg-card p-5 card-hover">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-heading font-600">{t.typology}</p>
                <p className="text-sm text-muted-foreground mt-1">{t.description || "Sin descripción"}</p>
                <p className="text-xs text-muted-foreground mt-2">Ticket #{t.ticketId} · {t.created?.slice(0, 10)}</p>
              </div>
              <StatusPill status={t.status} />
            </div>
          </div>
        ))}
        {tickets.length === 0 && <p className="text-center text-muted-foreground py-12">No hay tickets todavía.</p>}
      </div>
    </div>
  );
}
