import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiErr } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, ArrowRight, Search, CreditCard, ReceiptText, CheckCircle2, ShieldCheck, Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const LOGO = "https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png";

export default function PayBill() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);

  const lookup = async (e) => {
    e && e.preventDefault();
    if (!query.trim()) { toast.error("Introduce tu DNI/CIF o número de línea"); return; }
    setBusy(true); setAccount(null);
    try {
      const { data } = await api.post("/public/account/lookup", { query: query.trim() });
      setAccount(data);
    } catch (err) { toast.error(apiErr(err)); } finally { setBusy(false); }
  };

  const pay = async () => {
    setPaying(true);
    try {
      const { data } = await api.post("/public/account/checkout", {
        query: query.trim(), origin_url: window.location.origin,
      });
      window.location.href = data.checkout_url;
    } catch (err) { toast.error(apiErr(err)); setPaying(false); }
  };

  return (
    <div className="min-h-screen bg-white text-[#0A0A0A] font-body selection:bg-[#FF7A00] selection:text-white" data-testid="paybill-page">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-white/70 border-b border-black/5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center" data-testid="paybill-logo">
            <img src={LOGO} alt="GoRoky" className="h-9 w-auto" />
          </button>
          <button onClick={() => navigate("/")} data-testid="paybill-back"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-[#015EEF] transition-colors">
            <ArrowLeft size={16} /> Volver
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-32 pb-20">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-2 text-xs tracking-[0.2em] font-bold uppercase text-[#FF7A00] bg-[#FF7A00]/10 rounded-full px-4 py-2 mb-5">
            <CreditCard size={14} /> Pago rápido
          </span>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter leading-[0.95]">
            Paga tu cuenta <span className="text-[#015EEF]">en segundos</span>
          </h1>
          <p className="text-slate-600 mt-4 text-lg">
            Sin registrarte. Introduce tu DNI/CIF, pasaporte o número de línea y paga tus facturas pendientes.
          </p>
        </div>

        <form onSubmit={lookup} className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input data-testid="paybill-query" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="DNI / CIF / Pasaporte o nº de línea"
              className="h-14 pl-11 rounded-full border-2 border-slate-200 focus-visible:ring-[#015EEF] text-base" />
          </div>
          <button type="submit" data-testid="paybill-lookup" disabled={busy}
            className="h-14 rounded-full bg-[#015EEF] hover:bg-[#004cc7] text-white font-bold px-8 inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
            {busy ? "Buscando…" : "Consultar"}
          </button>
        </form>

        <AnimatePresence mode="wait">
          {account && (
            <motion.div key="result" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              data-testid="paybill-result" className="rounded-3xl border-2 border-slate-100 shadow-[0_20px_60px_rgba(1,94,239,0.08)] p-6 sm:p-8">
              <p className="text-slate-500 text-sm">Hola{account.name ? `, ${account.name}` : ""}</p>

              {account.count === 0 ? (
                <div className="text-center py-8" data-testid="paybill-uptodate">
                  <div className="mx-auto mb-4 grid place-items-center h-16 w-16 rounded-full bg-green-100 text-green-600">
                    <CheckCircle2 size={34} />
                  </div>
                  <h2 className="font-heading text-2xl font-black">¡Estás al día!</h2>
                  <p className="text-slate-600 mt-2">No tienes facturas pendientes de pago.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-end justify-between mt-1 mb-5">
                    <div>
                      <p className="text-sm text-slate-500">Importe pendiente</p>
                      <p className="font-heading text-4xl font-black text-[#015EEF]" data-testid="paybill-total">
                        {account.pendingTotal.toFixed(2)} €
                      </p>
                    </div>
                    <span className="text-sm text-slate-500">{account.count} factura(s)</span>
                  </div>

                  <div className="rounded-2xl bg-slate-50 divide-y divide-slate-100 mb-6">
                    {account.invoices.map((inv, i) => (
                      <div key={i} data-testid={`paybill-inv-${i}`} className="flex items-center justify-between px-4 py-3">
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                          <ReceiptText size={16} className="text-slate-400" />
                          {inv.invoiceNumber || "Factura"}
                          {inv.date && <span className="text-slate-400 font-normal">· {inv.date}</span>}
                        </span>
                        <span className="font-semibold text-slate-800">{inv.total.toFixed(2)} €</span>
                      </div>
                    ))}
                  </div>

                  <button onClick={pay} disabled={paying} data-testid="paybill-pay"
                    className="w-full h-14 rounded-full bg-[#FF7A00] hover:bg-[#e66d00] text-white font-bold inline-flex items-center justify-center gap-2 transition-colors shadow-[0_10px_30px_rgba(255,122,0,0.3)] disabled:opacity-60">
                    {paying ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
                    {paying ? "Redirigiendo a pago seguro…" : `Pagar ${account.pendingTotal.toFixed(2)} €`}
                  </button>
                  <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400 mt-3">
                    <ShieldCheck size={13} /> Pago seguro procesado por Stripe
                  </p>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
