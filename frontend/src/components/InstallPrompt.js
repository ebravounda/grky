import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Share } from "lucide-react";

const ICON = "https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/l5gkxg0b_ChatGPT%20Image%2027%20jul%202026%2C%2000_04_13.png";
const DISMISS_KEY = "goroky_install_dismissed_until";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (until && Date.now() < until) return;

    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS no dispara beforeinstallprompt → mostrar instrucciones
    let t;
    if (isIOS()) t = setTimeout(() => setVisible(true), 1500);

    const onInstalled = () => { setVisible(false); setDeferred(null); };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (t) clearTimeout(t);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000)); // 7 días
    setVisible(false);
    setIosHelp(false);
  };

  const install = async () => {
    if (isIOS()) { setIosHelp((v) => !v); return; }
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setVisible(false);
    setDeferred(null);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 90, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          data-testid="install-banner"
          className="fixed bottom-[92px] left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-[520px] z-50">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-[0_10px_40px_-8px_rgba(0,0,0,0.25)] p-3.5">
            <div className="flex items-center gap-3">
              <img src={ICON} alt="GoRoky" className="h-11 w-11 rounded-xl shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-slate-900 leading-tight">Instala la app de GoRoky</p>
                <p className="text-xs text-slate-500 leading-snug">Acceso rápido a tus líneas y facturas desde tu pantalla de inicio.</p>
              </div>
              <button data-testid="install-dismiss" onClick={dismiss} aria-label="Cerrar"
                className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0">
                <X size={18} />
              </button>
            </div>

            {iosHelp ? (
              <div data-testid="install-ios-help" className="mt-3 rounded-xl bg-primary/5 border border-primary/15 p-3 text-xs text-slate-600 leading-relaxed">
                Para instalarla en tu iPhone: pulsa <Share size={13} className="inline -mt-0.5 text-primary" /> <b>Compartir</b> en la barra de Safari y luego <b>«Añadir a pantalla de inicio»</b>.
              </div>
            ) : (
              <button data-testid="install-accept" onClick={install}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-[0_4px_16px_-2px_hsl(216_100%_52%/0.5)] active:scale-[0.98] transition-transform">
                <Download size={17} /> {isIOS() ? "Cómo instalar" : "Instalar app"}
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
