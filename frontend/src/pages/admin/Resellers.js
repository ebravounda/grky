import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Store, ChevronRight, ShieldCheck, AlertTriangle } from "lucide-react";

export default function Resellers() {
  const [rows, setRows] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/resellers").then((r) => setRows(r.data)).catch((e) => { setRows([]); });
  }, []);

  if (!rows) return <div className="text-muted-foreground">Cargando…</div>;

  return (
    <div data-testid="resellers-page">
      <PageHeader overline="CRM" title="Revendedores"
        subtitle="Asigna el IBAN del revendedor y cóbrale en bloque las facturas de sus clientes." />

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Revendedor</th>
              <th className="px-4 py-3 font-medium">Mandato SEPA</th>
              <th className="px-4 py-3 font-medium">Clientes</th>
              <th className="px-4 py-3 font-medium">Facturas pendientes</th>
              <th className="px-4 py-3 font-medium">Total pendiente</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} data-testid={`reseller-row-${r.id}`} onClick={() => navigate(`/app/resellers/${r.id}`)}
                className="cursor-pointer hover:bg-muted/40 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid place-items-center h-9 w-9 rounded-lg bg-primary/10 text-primary shrink-0"><Store size={17} /></span>
                    <div className="leading-tight">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {r.mandate ? (
                    <span className="inline-flex items-center gap-1.5 text-success text-xs font-semibold"><ShieldCheck size={14} /> Firmado {r.last4 ? `· ••${r.last4}` : ""}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-amber-600 text-xs font-semibold"><AlertTriangle size={14} /> Sin mandato</span>
                  )}
                </td>
                <td className="px-4 py-3">{r.clients}</td>
                <td className="px-4 py-3">{r.pendingCount}</td>
                <td className="px-4 py-3 font-semibold">{Number(r.pendingTotal || 0).toFixed(2)} €</td>
                <td className="px-4 py-3 text-right"><ChevronRight size={16} className="text-muted-foreground" /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No hay revendedores. Créalos en "Usuarios y permisos" con el rol Revendedor.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
