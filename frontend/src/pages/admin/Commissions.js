import { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, StatCard } from "@/components/shared";
import { Wallet, Signal, TrendingUp } from "lucide-react";

export default function Commissions() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/commissions").then((r) => setData(r.data)); }, []);
  if (!data) return <div className="text-muted-foreground">Cargando…</div>;

  return (
    <div data-testid="commissions-page">
      <PageHeader overline="Revendedores" title="Comisiones"
        subtitle="Ingresos generados por cada SIM activada." />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <StatCard icon={Wallet} label="Total comisiones" value={`${data.total.toFixed(2)} €`} />
        <StatCard icon={Signal} label="SIMs activadas" value={data.count} />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Revendedor</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Línea</th>
              <th className="px-4 py-3 font-medium text-right">Comisión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.commissions.map((c) => (
              <tr key={c.id} data-testid={`commission-${c.commissionId}`}>
                <td className="px-4 py-3 text-muted-foreground">{new Date(c.created).toLocaleDateString("es-ES")}</td>
                <td className="px-4 py-3 font-medium">{c.resellerName}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.customerName}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.lineNumber}</td>
                <td className="px-4 py-3 text-right font-semibold text-success">+{c.amount.toFixed(2)} €</td>
              </tr>
            ))}
            {data.commissions.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground"><TrendingUp size={26} className="mx-auto mb-2 opacity-40" />Aún no hay comisiones generadas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
