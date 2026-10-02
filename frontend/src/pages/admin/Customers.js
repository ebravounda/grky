import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { UserPlus, Search, ChevronRight, Store } from "lucide-react";
import { toast } from "sonner";

const empty = {
  fiscalId: "", customerType: "Residential", fiscalIdType: "DNI", name: "", firstSurname: "", lastSurname: "",
  email: "", contactPhone: "", iban: "", paymentMethod: "NO", street: "", streetNumber: "",
  postalCode: "", cityName: "", provinceName: "", createPortalAccess: false, portalPassword: "",
};

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState([]);
  const [resellers, setResellers] = useState([]);
  const [bulkReseller, setBulkReseller] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const { hasPerm } = useAuth();
  const navigate = useNavigate();

  const load = () => api.get("/customers", { params: q ? { q } : {} }).then((r) => setCustomers(r.data));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q]);
  useEffect(() => { if (hasPerm("billing.manage")) api.get("/resellers").then((r) => setResellers(r.data)).catch(() => {}); }, [hasPerm]);

  const toggleSel = (fid) => setSelected((s) => s.includes(fid) ? s.filter((x) => x !== fid) : [...s, fid]);
  const allSelected = customers.length > 0 && selected.length === customers.length;
  const toggleAll = () => setSelected(allSelected ? [] : customers.map((c) => c.fiscalId));
  const bulkAssign = async () => {
    if (!bulkReseller || selected.length === 0) return;
    setBulkBusy(true);
    try {
      const { data } = await api.post("/customers/bulk-reseller", {
        fiscalIds: selected, resellerId: bulkReseller === "none" ? null : bulkReseller });
      toast.success(`${data.updated} cliente(s) ${bulkReseller === "none" ? "desasignados" : "asignados al revendedor"}`);
      setSelected([]); setBulkReseller(""); load();
    } catch (e) { toast.error(apiErr(e)); } finally { setBulkBusy(false); }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      await api.post("/customers", form);
      toast.success("Cliente creado");
      setOpen(false);
      setForm(empty);
      load();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="customers-page">
      <PageHeader
        overline="CRM" title="Clientes" subtitle="Gestiona los clientes de tu marca."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="new-customer-btn" className="rounded-full gap-2"><UserPlus size={16} /> Nuevo cliente</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Crear cliente final</DialogTitle>
                <DialogDescription>Introduce los datos del cliente y su documentación fiscal.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tipo de documento</Label>
                  <Select value={form.fiscalIdType} onValueChange={(v) => set("fiscalIdType", v)}>
                    <SelectTrigger data-testid="cust-doctype"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DNI">DNI</SelectItem>
                      <SelectItem value="NIE">NIE</SelectItem>
                      <SelectItem value="CIF">CIF</SelectItem>
                      <SelectItem value="Passport">Pasaporte</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>NIF/NIE</Label><Input data-testid="cust-fiscalId" value={form.fiscalId} onChange={(e) => set("fiscalId", e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={form.customerType} onValueChange={(v) => set("customerType", v)}>
                    <SelectTrigger data-testid="cust-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Residential">Residencial</SelectItem>
                      <SelectItem value="Freelance">Autónomo</SelectItem>
                      <SelectItem value="Society">Sociedad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Nombre / Razón social</Label><Input data-testid="cust-name" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Primer apellido</Label><Input value={form.firstSurname} onChange={(e) => set("firstSurname", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input data-testid="cust-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Teléfono</Label><Input data-testid="cust-phone" value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>IBAN (SEPA)</Label><Input data-testid="cust-iban" value={form.iban} onChange={(e) => set("iban", e.target.value)} placeholder="ES..." /></div>
                <div className="space-y-1.5">
                  <Label>Método de pago</Label>
                  <Select value={form.paymentMethod} onValueChange={(v) => set("paymentMethod", v)}>
                    <SelectTrigger data-testid="cust-payment"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NO">Sin domiciliar</SelectItem>
                      <SelectItem value="SEPA CORE">SEPA CORE</SelectItem>
                      <SelectItem value="SEPA B2B">SEPA B2B</SelectItem>
                      <SelectItem value="CASH">Efectivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 col-span-2"><Label>Dirección</Label><Input value={form.street} onChange={(e) => set("street", e.target.value)} placeholder="Calle" /></div>
                <div className="space-y-1.5"><Label>Nº</Label><Input value={form.streetNumber} onChange={(e) => set("streetNumber", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>C.P.</Label><Input value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Ciudad</Label><Input value={form.cityName} onChange={(e) => set("cityName", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Provincia</Label><Input value={form.provinceName} onChange={(e) => set("provinceName", e.target.value)} /></div>
                <div className="col-span-2 flex items-center justify-between rounded-md border border-border p-3 mt-1">
                  <div><p className="text-sm font-medium">Acceso al área de clientes</p><p className="text-xs text-muted-foreground">Crea usuario para el portal</p></div>
                  <Switch data-testid="cust-portal-switch" checked={form.createPortalAccess} onCheckedChange={(v) => set("createPortalAccess", v)} />
                </div>
                {form.createPortalAccess && (
                  <div className="space-y-1.5 col-span-2"><Label>Contraseña del portal</Label><Input data-testid="cust-portal-pw" type="text" value={form.portalPassword} onChange={(e) => set("portalPassword", e.target.value)} /></div>
                )}
              </div>
              <DialogFooter>
                <Button data-testid="save-customer-btn" onClick={submit} disabled={saving} className="rounded-full">{saving ? "Guardando…" : "Crear cliente"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input data-testid="customer-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, NIF o email…" className="pl-9" />
      </div>

      {hasPerm("billing.manage") && selected.length > 0 && (
        <div data-testid="bulk-reseller-bar" className="flex flex-wrap items-center gap-3 mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <span className="flex items-center gap-2 text-sm font-medium text-primary"><Store size={16} /> {selected.length} seleccionado(s)</span>
          <div className="flex-1 min-w-[220px] max-w-xs">
            <Select value={bulkReseller} onValueChange={setBulkReseller}>
              <SelectTrigger data-testid="bulk-reseller-select"><SelectValue placeholder="Asignar a revendedor…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Quitar revendedor (cobro al cliente)</SelectItem>
                {resellers.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}{r.mandate ? " · SEPA ✓" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button data-testid="bulk-assign-btn" className="rounded-full" onClick={bulkAssign} disabled={bulkBusy || !bulkReseller}>{bulkBusy ? "Aplicando…" : "Aplicar"}</Button>
          <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelected([])}>Cancelar</button>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr className="text-left">
              {hasPerm("billing.manage") && (
                <th className="px-4 py-3 w-10"><input type="checkbox" data-testid="select-all-customers" checked={allSelected} onChange={toggleAll} /></th>
              )}
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">NIF/NIE</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Email</th>
              <th className="px-4 py-3 font-medium">Líneas</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {customers.map((c) => (
              <tr key={c.id} data-testid={`customer-row-${c.fiscalId}`}
                className="hover:bg-muted/40 transition-colors">
                {hasPerm("billing.manage") && (
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" data-testid={`select-customer-${c.fiscalId}`} checked={selected.includes(c.fiscalId)} onChange={() => toggleSel(c.fiscalId)} />
                  </td>
                )}
                <td className="px-4 py-3 font-medium cursor-pointer" onClick={() => navigate(`/app/customers/${c.fiscalId}`)}>{c.name} {c.firstSurname}</td>
                <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground cursor-pointer" onClick={() => navigate(`/app/customers/${c.fiscalId}`)}>{c.fiscalId}</td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground cursor-pointer" onClick={() => navigate(`/app/customers/${c.fiscalId}`)}>{c.email}</td>
                <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/app/customers/${c.fiscalId}`)}>{c.linesCount}</td>
                <td className="px-4 py-3 text-right cursor-pointer" onClick={() => navigate(`/app/customers/${c.fiscalId}`)}><ChevronRight size={16} className="text-muted-foreground" /></td>
              </tr>
            ))}
            {customers.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Sin clientes.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
