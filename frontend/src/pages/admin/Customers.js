import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { UserPlus, Search, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const empty = {
  fiscalId: "", customerType: "Residential", name: "", firstSurname: "", lastSurname: "",
  email: "", contactPhone: "", street: "", streetNumber: "", postalCode: "", cityName: "",
  provinceName: "", createPortalAccess: false, portalPassword: "",
};

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const load = () => api.get("/customers", { params: q ? { q } : {} }).then((r) => setCustomers(r.data));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q]);

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
              <DialogHeader><DialogTitle>Crear cliente final</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
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

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">NIF/NIE</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Email</th>
              <th className="px-4 py-3 font-medium">Líneas</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {customers.map((c) => (
              <tr key={c.id} data-testid={`customer-row-${c.fiscalId}`} onClick={() => navigate(`/app/customers/${c.fiscalId}`)}
                className="cursor-pointer hover:bg-muted/40 transition-colors">
                <td className="px-4 py-3 font-medium">{c.name} {c.firstSurname}</td>
                <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{c.fiscalId}</td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{c.email}</td>
                <td className="px-4 py-3">{c.linesCount}</td>
                <td className="px-4 py-3 text-right"><ChevronRight size={16} className="text-muted-foreground" /></td>
              </tr>
            ))}
            {customers.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Sin clientes.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
