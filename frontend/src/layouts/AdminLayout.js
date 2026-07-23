import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, Users, Signal, PackageSearch, ShoppingCart,
  ReceiptText, LifeBuoy, LogOut, RadioTower,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/app", label: "Panel", icon: LayoutDashboard, end: true },
  { to: "/app/customers", label: "Clientes", icon: Users },
  { to: "/app/lines", label: "Líneas", icon: Signal },
  { to: "/app/catalog", label: "Catálogo & Cobertura", icon: PackageSearch },
  { to: "/app/orders", label: "Contratación", icon: ShoppingCart },
  { to: "/app/invoices", label: "Facturas", icon: ReceiptText },
  { to: "/app/tickets", label: "Soporte", icon: LifeBuoy },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-border bg-card">
        <div className="h-16 flex items-center gap-2.5 px-6 border-b border-border">
          <div className="grid place-items-center h-9 w-9 rounded-md bg-primary text-primary-foreground">
            <RadioTower size={20} />
          </div>
          <div className="leading-tight">
            <p className="font-heading font-700 tracking-tight">Goroky</p>
            <p className="text-[10px] text-muted-foreground overline">Telecom CRM</p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={`nav-${n.label.toLowerCase().replace(/[^a-z]/g, "")}`}
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
        <div className="p-3 border-t border-border">
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-semibold truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <button
            data-testid="logout-btn"
            onClick={() => logout().then(() => navigate("/login"))}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut size={18} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden h-14 flex items-center justify-between px-4 border-b border-border glass sticky top-0 z-30">
          <span className="font-heading font-700">Goroky CRM</span>
          <button data-testid="logout-btn-mobile" onClick={() => logout().then(() => navigate("/login"))}>
            <LogOut size={18} />
          </button>
        </header>
        <main className="flex-1 p-5 sm:p-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
