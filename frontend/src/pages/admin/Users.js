import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, UserPlus, Trash2, Headphones, Store, Crown, Save } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABEL = { admin: "Administrador", agent: "Agente de soporte", reseller: "Revendedor" };
const ROLE_ICON = { admin: Crown, agent: Headphones, reseller: Store };
const PERM_LABEL = {
  "dashboard.view": "Ver panel", "alerts.view": "Ver alertas", "solicitudes.manage": "Gestionar solicitudes",
  "customers.view": "Ver clientes", "customers.edit": "Editar clientes", "lines.view": "Ver líneas",
  "lines.support": "Acciones de soporte de línea", "lines.activate": "Activar líneas", "docs.upload": "Subir documentos",
  "tariffs.manage": "Gestionar tarifas", "catalog.view": "Ver catálogo", "orders.manage": "Contratación",
  "billing.manage": "Cobros recurrentes", "installations.manage": "Instalaciones", "portabilities.manage": "Portabilidades",
  "shipments.manage": "Envíos de SIM", "promotions.manage": "Promociones", "invoices.view": "Ver facturas",
  "resources.view": "Recursos", "tickets.manage": "Soporte/tickets", "settings.manage": "Configuración",
  "users.manage": "Usuarios y permisos", "commissions.view": "Ver comisiones",
};

const EMPTY = { email: "", name: "", password: "", role: "agent", commissionPerSim: 0 };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState(null);
  const [allPerms, setAllPerms] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get("/users").then((r) => setUsers(r.data));
    api.get("/roles").then((r) => { setRoles(r.data.roles); setAllPerms(r.data.allPermissions); });
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const create = async () => {
    if (!form.email || !form.name || !form.password) return toast.error("Completa email, nombre y contraseña");
    setBusy(true);
    try { await api.post("/users", form); toast.success("Usuario creado"); setOpen(false); setForm(EMPTY); load(); }
    catch (e) { toast.error(apiErr(e)); } finally { setBusy(false); }
  };

  const del = async (id) => { if (!window.confirm("¿Eliminar este usuario?")) return; await api.delete(`/users/${id}`); toast.success("Eliminado"); load(); };

  const togglePerm = (role, perm) => {
    setRoles((r) => {
      const has = r[role].includes(perm);
      return { ...r, [role]: has ? r[role].filter((p) => p !== perm) : [...r[role], perm] };
    });
  };

  const saveRole = async (role) => {
    try { await api.put(`/roles/${role}`, { permissions: roles[role] }); toast.success(`Permisos de ${ROLE_LABEL[role]} guardados`); }
    catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div data-testid="users-page">
      <PageHeader overline="Seguridad" title="Usuarios y permisos"
        subtitle="Gestiona el equipo (agentes y revendedores) y qué puede hacer cada rol."
        action={<Button data-testid="new-user-btn" className="rounded-full gap-2" onClick={() => { setForm(EMPTY); setOpen(true); }}><UserPlus size={16} /> Nuevo usuario</Button>}
      />

      {/* Staff list */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto mb-8">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr><th className="px-4 py-3 font-medium">Nombre</th><th className="px-4 py-3 font-medium">Email</th><th className="px-4 py-3 font-medium">Rol</th><th className="px-4 py-3 font-medium">Comisión/SIM</th><th className="px-4 py-3 font-medium text-right">Acción</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => {
              const Icon = ROLE_ICON[u.role] || Crown;
              return (
                <tr key={u.id} data-testid={`user-row-${u.email}`}>
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-xs font-semibold"><Icon size={14} className="text-primary" /> {ROLE_LABEL[u.role]}</span></td>
                  <td className="px-4 py-3">{u.role === "reseller" ? `${(u.commissionPerSim || 0).toFixed(2)} €` : "—"}</td>
                  <td className="px-4 py-3 text-right">{u.role !== "admin" && <Button size="sm" variant="ghost" className="text-destructive" data-testid={`delete-user-${u.email}`} onClick={() => del(u.id)}><Trash2 size={15} /></Button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Permission matrix */}
      <h3 className="font-heading font-600 flex items-center gap-2 mb-3"><ShieldCheck size={18} className="text-primary" /> Permisos por rol</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles && ["agent", "reseller"].map((role) => {
          const Icon = ROLE_ICON[role];
          return (
            <div key={role} data-testid={`role-card-${role}`} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold flex items-center gap-2"><Icon size={17} className="text-primary" /> {ROLE_LABEL[role]}</h4>
                <Button size="sm" className="rounded-full gap-1.5" data-testid={`save-role-${role}`} onClick={() => saveRole(role)}><Save size={14} /> Guardar</Button>
              </div>
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {allPerms.map((p) => (
                  <label key={p} className="flex items-center justify-between text-sm py-1 cursor-pointer">
                    <span className="text-muted-foreground">{PERM_LABEL[p] || p}</span>
                    <Switch data-testid={`perm-${role}-${p}`} checked={roles[role].includes(p)} onCheckedChange={() => togglePerm(role, p)} />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* New user dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="user-dialog">
          <DialogHeader><DialogTitle>Nuevo usuario</DialogTitle><DialogDescription>Crea una cuenta de agente o revendedor.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nombre *</Label><Input data-testid="user-name" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Email *</Label><Input data-testid="user-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Contraseña *</Label><Input data-testid="user-password" value={form.password} onChange={(e) => set("password", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={form.role} onValueChange={(v) => set("role", v)}>
                <SelectTrigger data-testid="user-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agente de soporte</SelectItem>
                  <SelectItem value="reseller">Revendedor</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role === "reseller" && (
              <div className="space-y-1.5"><Label>Comisión por SIM activada (€)</Label><Input data-testid="user-commission" type="number" step="0.01" value={form.commissionPerSim} onChange={(e) => set("commissionPerSim", parseFloat(e.target.value || 0))} /></div>
            )}
          </div>
          <DialogFooter><Button data-testid="save-user-btn" className="rounded-full" onClick={create} disabled={busy}>{busy ? "Creando…" : "Crear usuario"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
