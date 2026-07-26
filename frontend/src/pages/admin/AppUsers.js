import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Smartphone, Search, KeyRound, LogOut, Lock, Unlock, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

function fmtDate(iso) {
  if (!iso) return "Nunca";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export default function AppUsers() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [pwDialog, setPwDialog] = useState(null);
  const [newPw, setNewPw] = useState("");

  const load = () => {
    setLoading(true);
    api.get("/admin/app-users").then((r) => setUsers(r.data)).catch((e) => toast.error(apiErr(e))).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const act = async (u, fn, ok) => {
    setBusy(u.id);
    try { await fn(); toast.success(ok); load(); }
    catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(null); }
  };

  const resetPw = (u) => act(u, () => api.post(`/admin/app-users/${u.id}/reset-password`), `Contraseña restablecida y enviada a ${u.email}`);
  const forceLogout = (u) => act(u, () => api.post(`/admin/app-users/${u.id}/logout`), "Sesión cerrada en su dispositivo");
  const toggleBlock = (u) => act(u, () => api.post(`/admin/app-users/${u.id}/block`, { blocked: !u.appBlocked }), u.appBlocked ? "Acceso desbloqueado" : "Acceso bloqueado");
  const saveManualPw = async () => {
    if (newPw.trim().length < 6) return toast.error("Mínimo 6 caracteres");
    try {
      await api.post(`/admin/app-users/${pwDialog.id}/set-password`, { password: newPw.trim() });
      toast.success("Contraseña actualizada");
      setPwDialog(null); setNewPw(""); load();
    } catch (e) { toast.error(apiErr(e)); }
  };

  const filtered = users.filter((u) =>
    !q || (u.name || "").toLowerCase().includes(q.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(q.toLowerCase()) ||
    (u.fiscalId || "").toLowerCase().includes(q.toLowerCase()));

  return (
    <div data-testid="app-users-page">
      <PageHeader overline="Acceso" title="Usuarios de la app"
        subtitle="Clientes con acceso a la app: último ingreso, sesión, contraseña y bloqueo." />

      <div className="relative mb-5 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input data-testid="app-users-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, email o NIF…" className="pl-9" />
      </div>

      {loading ? (
        <div className="text-muted-foreground">Cargando…</div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-3 font-medium">Cliente</th>
                <th className="p-3 font-medium">Servicios activos</th>
                <th className="p-3 font-medium">Último acceso</th>
                <th className="p-3 font-medium">Estado</th>
                <th className="p-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} data-testid={`app-user-${u.id}`} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="p-3">
                    <p className="font-medium text-foreground">{u.name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                    {u.fiscalId && <p className="text-xs text-muted-foreground">{u.fiscalId}</p>}
                  </td>
                  <td className="p-3">
                    {u.activeServices > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-success font-medium"><CheckCircle2 size={14} /> {u.activeServices} activo{u.activeServices > 1 ? "s" : ""}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground"><XCircle size={14} /> Sin servicios</span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{fmtDate(u.lastLogin)}</td>
                  <td className="p-3">
                    {u.appBlocked
                      ? <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-xs font-medium"><Lock size={12} /> Bloqueado</span>
                      : <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success/10 text-success text-xs font-medium"><Unlock size={12} /> Activo</span>}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      <Button size="sm" variant="outline" className="rounded-full h-8 gap-1.5" disabled={busy === u.id}
                        data-testid={`reset-pw-${u.id}`} onClick={() => resetPw(u)}><RefreshCw size={13} /> Restablecer</Button>
                      <Button size="sm" variant="outline" className="rounded-full h-8 gap-1.5" disabled={busy === u.id}
                        data-testid={`set-pw-${u.id}`} onClick={() => { setPwDialog(u); setNewPw(""); }}><KeyRound size={13} /> Contraseña</Button>
                      <Button size="sm" variant="outline" className="rounded-full h-8 gap-1.5" disabled={busy === u.id}
                        data-testid={`logout-${u.id}`} onClick={() => forceLogout(u)}><LogOut size={13} /> Cerrar sesión</Button>
                      <Button size="sm" variant={u.appBlocked ? "default" : "destructive"} className="rounded-full h-8 gap-1.5" disabled={busy === u.id}
                        data-testid={`block-${u.id}`} onClick={() => toggleBlock(u)}>
                        {u.appBlocked ? <><Unlock size={13} /> Desbloquear</> : <><Lock size={13} /> Bloquear</>}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No hay usuarios de app.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!pwDialog} onOpenChange={(o) => !o && setPwDialog(null)}>
        <DialogContent data-testid="set-pw-dialog">
          <DialogHeader>
            <DialogTitle>Establecer contraseña</DialogTitle>
            <DialogDescription>Define una contraseña para {pwDialog?.email}. Se cerrará su sesión actual.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Nueva contraseña</Label>
            <Input data-testid="manual-pw-input" type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Mínimo 6 caracteres" />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setPwDialog(null)}>Cancelar</Button>
            <Button className="rounded-full" data-testid="save-manual-pw" onClick={saveManualPw}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
