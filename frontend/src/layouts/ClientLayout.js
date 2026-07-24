import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Home, ReceiptText, Store, LifeBuoy, Bell, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const LOGO = "https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png";

const tabs = [
  { to: "/portal", label: "Inicio", icon: Home, end: true },
  { to: "/portal/invoices", label: "Facturas", icon: ReceiptText },
  { to: "/contratar", label: "Tienda", icon: Store, external: true },
  { to: "/portal/tickets", label: "Asistencia", icon: LifeBuoy },
];

export default function ClientLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    api.get("/me/summary").then((r) => setPending(r.data.pendingInvoices || 0)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="w-full max-w-[560px] mx-auto min-h-screen bg-slate-50 relative pb-24 md:my-6 md:rounded-[36px] md:shadow-2xl md:overflow-hidden">
        {/* Header */}
        <header className="flex justify-between items-center px-5 py-3.5 sticky top-0 z-40 backdrop-blur-xl bg-white/85 border-b border-slate-100">
          <img src={LOGO} alt="GoRoky" className="h-6 w-auto" />
          <div className="flex items-center gap-1">
            <Link to="/portal/invoices" data-testid="client-bell" aria-label="Notificaciones"
              className="relative p-2 rounded-full hover:bg-slate-100 text-slate-700 transition-colors">
              <Bell size={20} />
              {pending > 0 && <span className="absolute top-1.5 right-1.5 h-4 min-w-4 px-1 grid place-items-center bg-accent text-white text-[10px] font-bold rounded-full border-2 border-white">{pending}</span>}
            </Link>
            <button data-testid="client-logout-btn" onClick={() => logout().then(() => navigate("/login"))}
              aria-label="Cerrar sesión" className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors">
              <LogOut size={19} />
            </button>
          </div>
        </header>

        <main>
          <Outlet />
        </main>

        {/* Bottom tab bar */}
        <nav className="fixed bottom-0 w-full max-w-[560px] bg-white border-t border-slate-200 pb-safe z-40 shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.08)]">
          <div className="flex justify-around px-2 pt-2 pb-1.5">
            {tabs.map((t) => t.external ? (
              <a key={t.to} href={t.to} data-testid={`client-tab-${t.label.toLowerCase()}`}
                className="flex flex-col items-center p-2 min-w-[56px] text-slate-400 hover:text-primary transition-colors">
                <t.icon size={22} /><span className="text-[10px] font-medium mt-0.5">{t.label}</span>
              </a>
            ) : (
              <NavLink key={t.to} to={t.to} end={t.end} data-testid={`client-tab-${t.label.toLowerCase()}`}
                className={({ isActive }) => cn("flex flex-col items-center p-2 min-w-[56px] transition-colors",
                  isActive ? "text-primary" : "text-slate-400 hover:text-primary")}>
                <t.icon size={22} /><span className="text-[10px] font-medium mt-0.5">{t.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
