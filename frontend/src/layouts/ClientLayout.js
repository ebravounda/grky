import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LayoutGrid, ReceiptText, LifeBuoy, LogOut, RadioTower } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/portal", label: "Mi cuenta", icon: LayoutGrid, end: true },
  { to: "/portal/invoices", label: "Facturas", icon: ReceiptText },
  { to: "/portal/tickets", label: "Soporte", icon: LifeBuoy },
];

export default function ClientLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 glass sticky top-0 z-30 border-b border-border">
        <div className="max-w-[1100px] mx-auto h-full px-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="grid place-items-center h-9 w-9 rounded-md bg-primary text-primary-foreground">
              <RadioTower size={20} />
            </div>
            <div className="leading-tight">
              <p className="font-heading font-700 tracking-tight">Goroky</p>
              <p className="text-[10px] text-muted-foreground overline">Área de clientes</p>
            </div>
          </div>
          <nav className="hidden sm:flex items-center gap-1">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                data-testid={`client-nav-${n.label.toLowerCase().replace(/[^a-z]/g, "")}`}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  )
                }
              >
                <n.icon size={16} /> {n.label}
              </NavLink>
            ))}
          </nav>
          <button
            data-testid="client-logout-btn"
            onClick={() => logout().then(() => navigate("/login"))}
            className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            <LogOut size={16} /> <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>
      <main className="max-w-[1100px] mx-auto px-5 py-8">
        <Outlet />
      </main>
      <nav className="sm:hidden fixed bottom-0 inset-x-0 glass border-t border-border flex z-30">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => cn("flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs", isActive ? "text-primary" : "text-muted-foreground")}>
            <n.icon size={18} /> {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
