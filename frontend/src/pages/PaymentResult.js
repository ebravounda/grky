import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function PaymentResult() {
  const { result } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [state, setState] = useState(result === "success" ? "checking" : "cancel");
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (result !== "success") return;
    const sid = params.get("session_id");
    if (!sid) { setState("error"); return; }
    let tries = 0;
    const poll = async () => {
      try {
        const { data } = await api.get(`/payments/status/${sid}`);
        setInfo(data);
        if (data.payment_status === "paid") { setState("paid"); return; }
        if (["expired", "failed"].includes(data.payment_status)) { setState("error"); return; }
      } catch (e) {}
      if (tries++ < 8) setTimeout(poll, 1800);
      else setState("timeout");
    };
    poll();
  }, [result, params]);

  const home = user?.role === "admin" ? "/app/invoices" : "/portal/invoices";

  const content = {
    checking: { icon: <Loader2 className="animate-spin" size={48} />, c: "text-primary", t: "Confirmando pago…", s: "Un momento, estamos verificando tu pago." },
    paid: { icon: <CheckCircle2 size={48} />, c: "text-success", t: "¡Pago completado!", s: `La factura ${info?.invoice_number || ""} ha sido pagada correctamente.` },
    cancel: { icon: <XCircle size={48} />, c: "text-warning", t: "Pago cancelado", s: "Has cancelado el proceso de pago. Puedes intentarlo de nuevo." },
    error: { icon: <XCircle size={48} />, c: "text-destructive", t: "Error en el pago", s: "No se pudo completar el pago. Inténtalo de nuevo." },
    timeout: { icon: <Loader2 size={48} />, c: "text-muted-foreground", t: "Procesando…", s: "El pago está tardando. Revisa tus facturas en unos minutos." },
  }[state];

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        data-testid="payment-result" className="max-w-md w-full rounded-xl border border-border bg-card p-10 text-center">
        <div className={`mx-auto mb-5 grid place-items-center ${content.c}`}>{content.icon}</div>
        <h1 className="font-heading text-2xl font-700 tracking-tight">{content.t}</h1>
        <p className="text-muted-foreground mt-2">{content.s}</p>
        <Button data-testid="payment-back-btn" className="rounded-full mt-8" onClick={() => navigate(home)}>Volver a facturas</Button>
      </motion.div>
    </div>
  );
}
