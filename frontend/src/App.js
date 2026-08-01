import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AdminLayout from "@/layouts/AdminLayout";
import ClientLayout from "@/layouts/ClientLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/admin/Dashboard";
import Customers from "@/pages/admin/Customers";
import CustomerDetail from "@/pages/admin/CustomerDetail";
import Lines from "@/pages/admin/Lines";
import LineDetail from "@/pages/admin/LineDetail";
import Catalog from "@/pages/admin/Catalog";
import Tariffs from "@/pages/admin/Tariffs";
import Settings from "@/pages/admin/Settings";
import SiteContent from "@/pages/admin/SiteContent";
import Orders from "@/pages/admin/Orders";
import Alerts from "@/pages/admin/Alerts";
import Solicitudes from "@/pages/admin/Solicitudes";
import Callbacks from "@/pages/admin/Callbacks";
import Billing from "@/pages/admin/Billing";
import Shipments from "@/pages/admin/Shipments";
import Promociones from "@/pages/admin/Promociones";
import Installations from "@/pages/admin/Installations";
import Portabilities from "@/pages/admin/Portabilities";
import Resources from "@/pages/admin/Resources";
import Invoices from "@/pages/admin/Invoices";
import Tickets from "@/pages/admin/Tickets";
import Users from "@/pages/admin/Users";
import AppUsers from "@/pages/admin/AppUsers";
import Commissions from "@/pages/admin/Commissions";
import ClientDashboard from "@/pages/client/ClientDashboard";
import ClientLineDetail from "@/pages/client/ClientLineDetail";
import ClientInvoices from "@/pages/client/ClientInvoices";
import ClientTickets from "@/pages/client/ClientTickets";
import PaymentResult from "@/pages/PaymentResult";
import PublicCatalog from "@/pages/public/PublicCatalog";
import SignupWizard from "@/pages/public/SignupWizard";
import SignContract from "@/pages/public/SignContract";
import ContractSign from "@/pages/public/ContractSign";
import ResubmitDocs from "@/pages/public/ResubmitDocs";
import LegalPage from "@/pages/public/LegalPage";

function Loading() {
  return (
    <div className="min-h-screen grid place-items-center bg-background">
      <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

const STAFF = ["admin", "agent", "reseller"];

function PermGuard({ perm, children }) {
  const { hasPerm } = useAuth();
  if (!hasPerm(perm)) return <Navigate to="/app" replace />;
  return children;
}

function RequireRole({ role, children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (role === "staff") {
    if (!STAFF.includes(user.role)) return <Navigate to="/portal" replace />;
    return children;
  }
  if (role && user.role !== role) {
    return <Navigate to={STAFF.includes(user.role) ? "/app" : "/portal"} replace />;
  }
  return children;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading || user === null) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={STAFF.includes(user.role) ? "/app" : "/portal"} replace />;
}

function App() {
  return (
    <AuthProvider>
      <Toaster richColors position="top-right" />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PublicCatalog />} />
          <Route path="/login" element={<Login />} />
          <Route path="/payment/:result" element={<PaymentResult />} />
          <Route path="/contratar" element={<PublicCatalog />} />
          <Route path="/contratar/:productId" element={<SignupWizard />} />
          <Route path="/firmar/:token" element={<SignContract />} />
          <Route path="/firmar-contrato/:token" element={<ContractSign />} />
          <Route path="/corregir/:token" element={<ResubmitDocs />} />
          <Route path="/privacidad" element={<LegalPage type="privacy" />} />
          <Route path="/terminos" element={<LegalPage type="terms" />} />

          <Route path="/app" element={<RequireRole role="staff"><AdminLayout /></RequireRole>}>
            <Route index element={<Dashboard />} />
            <Route path="alerts" element={<PermGuard perm="alerts.view"><Alerts /></PermGuard>} />
            <Route path="solicitudes" element={<PermGuard perm="solicitudes.manage"><Solicitudes /></PermGuard>} />
            <Route path="callbacks" element={<PermGuard perm="solicitudes.manage"><Callbacks /></PermGuard>} />
            <Route path="customers" element={<PermGuard perm="customers.view"><Customers /></PermGuard>} />
            <Route path="customers/:fiscalId" element={<PermGuard perm="customers.view"><CustomerDetail /></PermGuard>} />
            <Route path="lines" element={<PermGuard perm="lines.view"><Lines /></PermGuard>} />
            <Route path="lines/:lineNumber" element={<PermGuard perm="lines.view"><LineDetail /></PermGuard>} />
            <Route path="catalog" element={<PermGuard perm="catalog.view"><Catalog /></PermGuard>} />
            <Route path="tariffs" element={<PermGuard perm="tariffs.manage"><Tariffs /></PermGuard>} />
            <Route path="settings" element={<PermGuard perm="settings.manage"><Settings /></PermGuard>} />
            <Route path="site-content" element={<PermGuard perm="settings.manage"><SiteContent /></PermGuard>} />
            <Route path="orders" element={<PermGuard perm="orders.manage"><Orders /></PermGuard>} />
            <Route path="billing" element={<PermGuard perm="billing.manage"><Billing /></PermGuard>} />
            <Route path="shipments" element={<PermGuard perm="shipments.manage"><Shipments /></PermGuard>} />
            <Route path="promotions" element={<PermGuard perm="promotions.manage"><Promociones /></PermGuard>} />
            <Route path="installations" element={<PermGuard perm="installations.manage"><Installations /></PermGuard>} />
            <Route path="portabilities" element={<PermGuard perm="portabilities.manage"><Portabilities /></PermGuard>} />
            <Route path="resources" element={<PermGuard perm="resources.view"><Resources /></PermGuard>} />
            <Route path="invoices" element={<PermGuard perm="invoices.view"><Invoices /></PermGuard>} />
            <Route path="tickets" element={<PermGuard perm="tickets.manage"><Tickets /></PermGuard>} />
            <Route path="users" element={<PermGuard perm="users.manage"><Users /></PermGuard>} />
            <Route path="app-users" element={<PermGuard perm="customers.view"><AppUsers /></PermGuard>} />
            <Route path="commissions" element={<PermGuard perm="commissions.view"><Commissions /></PermGuard>} />
          </Route>

          <Route path="/portal" element={<RequireRole role="client"><ClientLayout /></RequireRole>}>
            <Route index element={<ClientDashboard />} />
            <Route path="lines/:lineNumber" element={<ClientLineDetail />} />
            <Route path="invoices" element={<ClientInvoices />} />
            <Route path="tickets" element={<ClientTickets />} />
          </Route>

          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
