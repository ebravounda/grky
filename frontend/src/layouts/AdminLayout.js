import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard, Users, Signal, PackageSearch, ShoppingCart,
  ReceiptText, LifeBuoy, LogOut, RadioTower, Tag, Settings, Menu,
  Wrench, ArrowRightLeft, FolderDown, Bell, ClipboardCheck, Banknote, Truck, Megaphone, Wallet, ShieldCheck, Smartphone, Globe, PhoneCall,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/app", label: "Panel", icon: LayoutDashboard, end: true, id: "panel", perm: "dashboard.view" },
  { to: "/app/alerts", label: "Alertas", icon: Bell, id: "alertas", badge: true, perm: "alerts.view" },
  { to: "/app/solicitudes", label: "Solicitudes", icon: ClipboardCheck, id: "solicitudes", perm: "solicitudes.manage" },
  { to: "/app/callbacks", label: "Llamadas", icon: PhoneCall, id: "callbacks", perm: "solicitudes.manage" },
  { to: "/app/customers", label: "Clientes", icon: Users, id: "clientes", perm: "customers.view" },
  { to: "/app/app-users", label: "Usuarios de la app", icon: Smartphone, id: "app-users", perm: "customers.view" },
  { to: "/app/lines", label: "Líneas", icon: Signal, id: "lineas", perm: "lines.view" },
  { to: "/app/tariffs", label: "Tarifas", icon: Tag, id: "tarifas", perm: "tariffs.manage" },
  { to: "/app/catalog", label: "Catálogo & Cobertura", icon: PackageSearch, id: "catalogo", perm: "catalog.view" },
  { to: "/app/orders", label: "Contratación", icon: ShoppingCart, id: "contratacion", perm: "orders.manage" },
  { to: "/app/billing", label: "Cobros", icon: Banknote, id: "cobros", perm: "billing.manage" },
  { to: "/app/commissions", label: "Comisiones", icon: Wallet, id: "comisiones", perm: "commissions.view" },
  { to: "/app/installations", label: "Instalaciones", icon: Wrench, id: "instalaciones", perm: "installations.manage" },
  { to: "/app/portabilities", label: "Portabilidades", icon: ArrowRightLeft, id: "portabilidades", perm: "portabilities.manage" },
  { to: "/app/shipments", label: "Envíos de SIM", icon: Truck, id: "envios", perm: "shipments.manage" },
  { to: "/app/promotions", label: "Promociones", icon: Megaphone, id: "promociones", perm: "promotions.manage" },
  { to: "/app/invoices", label: "Facturas", icon: ReceiptText, id: "facturas", perm: "invoices.view" },
  { to: "/app/resources", label: "Recursos", icon: FolderDown, id: "recursos", perm: "resources.view" },
  { to: "/app/tickets", label: "Soporte", icon: LifeBuoy, id: "soporte", perm: "tickets.manage" },
  { to: "/app/users", label: "Usuarios y permisos", icon: ShieldCheck, id: "usuarios", perm: "users.manage" },
  { to: "/app/settings", label: "Configuración", icon: Settings, id: "configuracion", perm: "settings.manage" },
  { to: "/app/site-content", label: "Contenido web", icon: Globe, id: "contenido-web", perm: "settings.manage" },
];

const LOGO = "https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png";

function NavItems({ onNavigate, unread, hasPerm }) {
  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {nav.filter((n) => hasPerm(n.perm)).map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onNavigate}
          data-testid={`nav-${n.id}`}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-[hsl(var(--sidebar-muted))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-white"
            )
          }
        >
          <n.icon size={18} /> <span className="flex-1">{n.label}</span>
          {n.badge && unread > 0 && (
            <span data-testid="nav-alerts-badge" className="grid place-items-center min-w-5 h-5 px-1 rounded-full bg-accent text-accent-foreground text-[11px] font-bold">{unread}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="h-16 flex items-center gap-2.5 px-5 border-b border-[hsl(var(--sidebar-accent))]">
      <div className="bg-white rounded-md px-2.5 py-1.5 flex items-center">
        <img src={LOGO} alt="GoRoky" className="h-6 w-auto" />
      </div>
      <span className="text-[10px] text-[hsl(var(--sidebar-muted))] overline">Telecom CRM</span>
    </div>
  );
}

export default function AdminLayout() {
  const { user, logout, hasPerm } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const doLogout = () => logout().then(() => navigate("/login"));

  useEffect(() => {
    if (!hasPerm("alerts.view")) return;
    const fetchUnread = () => api.get("/events/unread-count").then((r) => setUnread(r.data.unreadCount)).catch(() => {});
    fetchUnread();
    const iv = setInterval(fetchUnread, 30000);
    window.addEventListener("focus", fetchUnread);
    window.addEventListener("events-updated", fetchUnread);
    return () => { clearInterval(iv); window.removeEventListener("focus", fetchUnread); window.removeEventListener("events-updated", fetchUnread); };
  }, [hasPerm]);

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))]">
        <Brand />
        <NavItems unread={unread} hasPerm={hasPerm} />
        <div className="p-3 border-t border-[hsl(var(--sidebar-accent))]">
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-semibold truncate text-white">{user?.name}</p>
            <p className="text-xs text-[hsl(var(--sidebar-muted))] truncate">{user?.email}</p>
          </div>
          <button data-testid="logout-btn" onClick={doLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-[hsl(var(--sidebar-muted))] hover:bg-destructive/20 hover:text-white transition-colors">
            <LogOut size={18} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden h-14 flex items-center justify-between px-4 border-b border-border glass sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button data-testid="mobile-menu-btn" aria-label="Menú" className="grid place-items-center h-9 w-9 rounded-md hover:bg-muted transition-colors">
                  <Menu size={20} />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72 flex flex-col bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] border-0" data-testid="mobile-menu-sheet">
                <Brand />
                <NavItems unread={unread} hasPerm={hasPerm} onNavigate={() => setOpen(false)} />
                <div className="p-3 border-t border-[hsl(var(--sidebar-accent))]">
                  <div className="px-3 py-2 mb-1">
                    <p className="text-sm font-semibold truncate text-white">{user?.name}</p>
                    <p className="text-xs text-[hsl(var(--sidebar-muted))] truncate">{user?.email}</p>
                  </div>
                  <button data-testid="mobile-logout-btn" onClick={() => { setOpen(false); doLogout(); }}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-[hsl(var(--sidebar-muted))] hover:bg-destructive/20 hover:text-white transition-colors">
                    <LogOut size={18} /> Cerrar sesión
                  </button>
                </div>
              </SheetContent>
            </Sheet>
            <img src={LOGO} alt="GoRoky" className="h-6 w-auto" />
          </div>
          <div className="grid place-items-center h-8 w-8 rounded-md bg-primary text-primary-foreground">
            <RadioTower size={16} />
          </div>
        </header>
        <main className="flex-1 p-5 sm:p-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
