import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiErr } from "@/lib/api";
import { PageHeader, StatusPill } from "@/components/shared";
import { Input } from "@/components/ui/input";
import { Signal, Wifi, Search, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Lines() {
  const [lines, setLines] = useState([]);
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  const load = () => api.get("/lines").then((r) => setLines(r.data));
  useEffect(() => { load(); }, []);
  const filtered = lines.filter((l) =>
    !q || l.lineNumber.includes(q) || l.productName.toLowerCase().includes(q.toLowerCase()) || l.fiscalId.toLowerCase().includes(q.toLowerCase())
  );

  const remove = async (e, l) => {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar la línea ${l.lineNumber} del CRM? (No afecta a Likes. Si existe en Likes, reaparecerá al reconciliar.)`)) return;
    try { await api.post(`/lines/${encodeURIComponent(l.lineNumber)}/delete`); toast.success(`Línea ${l.lineNumber} eliminada`); load(); }
    catch (err) { toast.error(apiErr(err)); }
  };

  return (
    <div data-testid="lines-page">
      <PageHeader overline="Red" title="Líneas" subtitle="Todas las líneas móviles y de fibra de tu marca." />
      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input data-testid="line-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por número, NIF o tarifa…" className="pl-9" />
      </div>
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Línea</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Tarifa</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Cliente (NIF)</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((l) => (
              <tr key={l.id} data-testid={`line-row-${l.lineNumber}`} onClick={() => navigate(`/app/lines/${l.lineNumber}`)}
                className="cursor-pointer hover:bg-muted/40 transition-colors">
                <td className="px-4 py-3 font-medium flex items-center gap-2">
                  {l.family === "Mobile" ? <Signal size={15} className="text-primary" /> : <Wifi size={15} className="text-primary" />}
                  {l.lineNumber}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{l.productName}</td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{l.fiscalId}</td>
                <td className="px-4 py-3"><StatusPill status={l.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <button data-testid={`line-delete-${l.lineNumber}`} onClick={(e) => remove(e, l)} title="Eliminar línea del CRM"
                      className="text-muted-foreground hover:text-red-500"><Trash2 size={15} /></button>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Sin líneas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
