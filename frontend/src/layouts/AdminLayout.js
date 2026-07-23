import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard, Users, Signal, PackageSearch, ShoppingCart,
  ReceiptText, LifeBuoy, LogOut, RadioTower, Tag, Settings, Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/app", label: "Panel", icon: LayoutDashboard, end: true, id: "panel" },
  { to: "/app/customers", label: "Clientes", icon: Users, id: "clientes" },
  { to: "/app/lines", label: "Líneas", icon: Signal, id: "lineas" },
  { to: "/app/tariffs", label: "Tarifas", icon: Tag, id: "tarifas" },
  { to: "/app/catalog", label: "Catálogo & Cobertura", icon: PackageSearch, id: "catalogo" },
  { to: "/app/orders", label: "Contratación", icon: ShoppingCart, id: "contratacion" },
  { to: "/app/invoices", label: "Facturas", icon: ReceiptText, id: "facturas" },
  { to: "/app/tickets", label: "Soporte", icon: LifeBuoy, id: "soporte" },
  { to: "/app/settings", label: "Configuración", icon: Settings, id: "configuracion" },
];

function NavItems({ onNavigate }) {
  return (
    <nav className="flex-1 p-3 space-y-1">
      {nav.map((n) => (
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
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )
          }
        >
          <n.icon size={18} /> {n.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="h-16 flex items-center gap-2.5 px-6 border-b border-border">
      <div className="grid place-items-center h-9 w-9 rounded-md bg-primary text-primary-foreground">
        <RadioTower size={20} />
      </div>
      <div className="leading-tight">
        <p className="font-heading font-700 tracking-tight">Goroky</p>
        <p className="text-[10px] text-muted-foreground overline">Telecom CRM</p>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const doLogout = () => logout().then(() => navigate("/login"));

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-border bg-card">
        <Brand />
        <NavItems />
        <div className="p-3 border-t border-border">
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-semibold truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <button data-testid="logout-btn" onClick={doLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
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
              <SheetContent side="left" className="p-0 w-72 flex flex-col" data-testid="mobile-menu-sheet">
                <Brand />
                <NavItems onNavigate={() => setOpen(false)} />
                <div className="p-3 border-t border-border">
                  <div className="px-3 py-2 mb-1">
                    <p className="text-sm font-semibold truncate">{user?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                  <button data-testid="mobile-logout-btn" onClick={() => { setOpen(false); doLogout(); }}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                    <LogOut size={18} /> Cerrar sesión
                  </button>
                </div>
              </SheetContent>
            </Sheet>
            <span className="font-heading font-700">Goroky CRM</span>
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
