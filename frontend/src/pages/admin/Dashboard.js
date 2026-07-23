import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { PageHeader, StatCard, StatusPill } from "@/components/shared";
import { Users, Signal, Euro, ReceiptText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["hsl(230 100% 55%)", "hsl(173 60% 40%)", "hsl(38 92% 50%)", "hsl(280 65% 60%)"];

export default function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/dashboard/stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);

  if (!stats) return <div className="text-muted-foreground">Cargando panel…</div>;

  return (
    <div data-testid="admin-dashboard">
      <PageHeader overline="Resumen" title="Panel de control" subtitle="Estado general de tu operación Goroky Telecom." />

      <div className={`mb-6 flex items-center gap-3 rounded-lg border p-4 text-sm ${stats.connection.live ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"}`}
        data-testid="likes-connection-banner">
        {stats.connection.live ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
        <div>
          <span className="font-semibold">API Likes Telecom: {stats.connection.live ? "Conectada" : "Modo demo (mock)"}.</span>{" "}
          {stats.connection.live
            ? "Datos en tiempo real."
            : `Autoriza la IP de salida en Likes para datos reales. (${stats.connection.error})`}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard testid="stat-customers" icon={Users} label="Clientes" value={stats.customers} tone="primary" delay={0} />
        <StatCard testid="stat-lines" icon={Signal} label="Líneas activas" value={stats.activeLines} hint={`${stats.totalLines} en total`} tone="success" delay={0.05} />
        <StatCard testid="stat-revenue" icon={Euro} label="Ingresos cobrados" value={`${stats.revenue.toFixed(2)} €`} tone="primary" delay={0.1} />
        <StatCard testid="stat-pending" icon={ReceiptText} label="Facturas pendientes" value={stats.pendingInvoices} tone="warning" delay={0.15} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="font-heading font-600 mb-4">Líneas por familia</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
              <PieChart>
                <Pie data={stats.linesByFamily} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {stats.linesByFamily.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {stats.linesByFamily.map((e, i) => (
              <span key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} /> {e.name} ({e.value})
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-600">Últimas contrataciones</h3>
            <Link to="/app/orders" className="text-sm text-primary hover:underline">Ver todas</Link>
          </div>
          {stats.recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Aún no hay contrataciones. Crea la primera desde “Contratación”.</p>
          ) : (
            <div className="divide-y divide-border">
              {stats.recentOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-sm">{o.productName}</p>
                    <p className="text-xs text-muted-foreground">{o.customerName} · {o.lineNumber}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">{o.price?.toFixed(2)} €</p>
                    <StatusPill status={o.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
