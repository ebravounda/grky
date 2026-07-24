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
import Orders from "@/pages/admin/Orders";
import Alerts from "@/pages/admin/Alerts";
import Solicitudes from "@/pages/admin/Solicitudes";
import Billing from "@/pages/admin/Billing";
import Shipments from "@/pages/admin/Shipments";
import Promociones from "@/pages/admin/Promociones";
import Installations from "@/pages/admin/Installations";
import Portabilities from "@/pages/admin/Portabilities";
import Resources from "@/pages/admin/Resources";
import Invoices from "@/pages/admin/Invoices";
import Tickets from "@/pages/admin/Tickets";
import ClientDashboard from "@/pages/client/ClientDashboard";
import ClientLineDetail from "@/pages/client/ClientLineDetail";
import ClientInvoices from "@/pages/client/ClientInvoices";
import ClientTickets from "@/pages/client/ClientTickets";
import PaymentResult from "@/pages/PaymentResult";
import PublicCatalog from "@/pages/public/PublicCatalog";
import SignupWizard from "@/pages/public/SignupWizard";
import SignContract from "@/pages/public/SignContract";

function Loading() {
  return (
    <div className="min-h-screen grid place-items-center bg-background">
      <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

function RequireRole({ role, children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === "admin" ? "/app" : "/portal"} replace />;
  }
  return children;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading || user === null) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "admin" ? "/app" : "/portal"} replace />;
}

function App() {
  return (
    <AuthProvider>
      <Toaster richColors position="top-right" />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/payment/:result" element={<PaymentResult />} />
          <Route path="/contratar" element={<PublicCatalog />} />
          <Route path="/contratar/:productId" element={<SignupWizard />} />
          <Route path="/firmar/:token" element={<SignContract />} />

          <Route path="/app" element={<RequireRole role="admin"><AdminLayout /></RequireRole>}>
            <Route index element={<Dashboard />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="solicitudes" element={<Solicitudes />} />
            <Route path="customers" element={<Customers />} />
            <Route path="customers/:fiscalId" element={<CustomerDetail />} />
            <Route path="lines" element={<Lines />} />
            <Route path="lines/:lineNumber" element={<LineDetail />} />
            <Route path="catalog" element={<Catalog />} />
            <Route path="tariffs" element={<Tariffs />} />
            <Route path="settings" element={<Settings />} />
            <Route path="orders" element={<Orders />} />
            <Route path="billing" element={<Billing />} />
            <Route path="shipments" element={<Shipments />} />
            <Route path="promotions" element={<Promociones />} />
            <Route path="installations" element={<Installations />} />
            <Route path="portabilities" element={<Portabilities />} />
            <Route path="resources" element={<Resources />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="tickets" element={<Tickets />} />
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
