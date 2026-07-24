import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function StatusPill({ status }) {
  const map = {
    ACTIVE: { c: "bg-success/12 text-success", t: "Activa" },
    SUSPENDED: { c: "bg-warning/15 text-warning", t: "Suspendida" },
    paid: { c: "bg-success/12 text-success", t: "Pagada" },
    pending: { c: "bg-warning/15 text-warning", t: "Pendiente" },
    failed: { c: "bg-destructive/12 text-destructive", t: "Fallida" },
    COMPLETED: { c: "bg-success/12 text-success", t: "Completada" },
    PROVISIONING: { c: "bg-primary/12 text-primary", t: "Aprovisionando" },
    CANCELLED: { c: "bg-destructive/12 text-destructive", t: "Cancelada" },
    APPROVED: { c: "bg-success/12 text-success", t: "Aprobada" },
    REJECTED: { c: "bg-destructive/12 text-destructive", t: "Rechazada" },
    PENDING_REVIEW: { c: "bg-warning/15 text-warning", t: "Pendiente" },
    OPEN: { c: "bg-primary/12 text-primary", t: "Abierto" },
    CLOSED: { c: "bg-muted text-muted-foreground", t: "Cerrado" },
  };
  const s = map[status] || { c: "bg-muted text-muted-foreground", t: status };
  return (
    <span data-testid="status-pill" className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", s.c)}>
      {s.t}
    </span>
  );
}

export function PageHeader({ overline, title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        {overline && <p className="overline text-primary mb-2">{overline}</p>}
        <h1 className="font-heading text-3xl lg:text-4xl font-700 tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1.5 text-sm">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, hint, tone = "primary", delay = 0, testid }) {
  const tones = {
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    warning: "text-warning bg-warning/10",
    slate: "text-foreground bg-muted",
  };
  return (
    <motion.div
      data-testid={testid}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="rounded-lg border border-border bg-card p-5 card-hover"
    >
      <div className="flex items-center justify-between">
        <span className="overline text-muted-foreground">{label}</span>
        <span className={cn("grid place-items-center h-9 w-9 rounded-md", tones[tone])}>
          <Icon size={18} />
        </span>
      </div>
      <div className="mt-3 font-heading text-3xl font-700 tracking-tight">{value}</div>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </motion.div>
  );
}
