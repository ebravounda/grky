import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { PhoneCall, Check, RotateCcw, Trash2, Phone } from "lucide-react";
import { toast } from "sonner";

const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
};

export default function Callbacks() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = () => api.get("/admin/callbacks").then((r) => setItems(r.data)).catch((e) => toast.error(apiErr(e)));
  useEffect(() => { load(); }, []);

  const toggle = async (id) => {
    setBusy(id);
    try { await api.post(`/admin/callbacks/${id}/status`); load(); }
    catch (e) { toast.error(apiErr(e)); } finally { setBusy(null); }
  };
  const remove = async (id) => {
    if (!window.confirm("¿Eliminar esta solicitud de llamada?")) return;
    setBusy(id);
    try { await api.post(`/admin/callbacks/${id}/delete`); toast.success("Eliminada"); load(); }
    catch (e) { toast.error(apiErr(e)); } finally { setBusy(null); }
  };

  const pending = items.filter((i) => i.status !== "done").length;

  return (
    <div data-testid="callbacks-page">
      <PageHeader overline="Contacto" title="Llamadas"
        subtitle="Solicitudes de «Te llamamos» enviadas desde la web con el producto de interés." />

      {pending > 0 && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning font-medium">
          Tienes {pending} llamada(s) pendiente(s) por atender.
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Apellido</th>
              <th className="px-4 py-3 font-medium">Teléfono</th>
              <th className="px-4 py-3 font-medium">Producto de interés</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((i) => (
              <tr key={i.id} data-testid={`callback-row-${i.id}`} className={i.status === "done" ? "opacity-60" : ""}>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtDate(i.createdAt)}</td>
                <td className="px-4 py-3 font-medium">{i.name}</td>
                <td className="px-4 py-3">{i.surname || "—"}</td>
                <td className="px-4 py-3">
                  <a href={`tel:${i.phone}`} className="inline-flex items-center gap-1.5 text-[#015EEF] font-semibold hover:underline" data-testid={`callback-phone-${i.id}`}>
                    <Phone size={14} /> {i.phone}
                  </a>
                </td>
                <td className="px-4 py-3">{i.productName || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${i.status === "done" ? "bg-success/12 text-success" : "bg-warning/15 text-warning"}`}>
                    {i.status === "done" ? "Atendida" : "Pendiente"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="outline" disabled={busy === i.id} onClick={() => toggle(i.id)}
                      data-testid={`callback-toggle-${i.id}`} className="gap-1.5">
                      {i.status === "done" ? <><RotateCcw size={14} /> Reabrir</> : <><Check size={14} /> Atendida</>}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy === i.id} onClick={() => remove(i.id)}
                      data-testid={`callback-delete-${i.id}`} className="text-destructive hover:bg-destructive/10">
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                <PhoneCall size={28} className="mx-auto mb-3 opacity-40" />
                Aún no hay solicitudes de llamada.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
