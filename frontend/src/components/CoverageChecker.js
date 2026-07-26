import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import { MapPin, Search, CheckCircle2, XCircle, Loader2 } from "lucide-react";

/**
 * Comprobador de cobertura de fibra (flujo real de Likes, endpoints públicos).
 * props: onResult(available, coverage), dark (estilo sobre fondo azul), compact
 */
export default function CoverageChecker({ onResult, dark = false, compact = false }) {
  const [q, setQ] = useState("");
  const [session, setSession] = useState(null);
  const [results, setResults] = useState([]);
  const [verticals, setVerticals] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [loading, setLoading] = useState(false);

  const reset = () => { setResults([]); setVerticals([]); setCoverage(null); };

  const searchAddr = async () => {
    if (!q.trim()) return;
    setLoading(true); reset();
    try {
      const { data } = await api.get("/public/coverage/search", { params: { label: q.trim() } });
      setSession(data.sessionId || null);
      setResults(data.items || []);
    } catch { /* noop */ } finally { setLoading(false); }
  };

  const pickAddr = async (item) => {
    setLoading(true); setVerticals([]); setCoverage(null);
    try {
      const gescal = item.gescal || item.gescal37;
      const { data } = await api.get("/public/coverage/buildings", { params: { gescal, sessionId: session } });
      setSession(data.sessionId || session);
      const v = data.verticals || [];
      setVerticals(v);
      if (v.length === 1) await pickVertical(v[0], data.sessionId || session);
    } catch { /* noop */ } finally { setLoading(false); }
  };

  const pickVertical = async (v, sess) => {
    setLoading(true); setCoverage(null);
    try {
      const { data } = await api.post("/public/coverage/check", { gescal37: v.gescal37 || v.id || v.gescal, sessionId: sess || session });
      setCoverage(data);
      onResult && onResult(!!data.valid, data);
    } catch { /* noop */ } finally { setLoading(false); }
  };

  const cov = coverage?.coverage || {};
  const available = coverage && coverage.valid;
  const inputCls = dark
    ? "w-full h-12 rounded-xl bg-white/95 text-slate-900 placeholder:text-slate-400 pl-11 pr-4 outline-none ring-offset-2 focus:ring-2 focus:ring-white"
    : "w-full h-12 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary ring-offset-2";

  return (
    <div className="w-full" data-testid="coverage-checker">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MapPin size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input data-testid="coverage-input" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchAddr()}
            placeholder="Tu dirección: calle, número y ciudad" className={inputCls} />
        </div>
        <button data-testid="coverage-check-btn" onClick={searchAddr} disabled={loading}
          className={`h-12 px-6 rounded-xl font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60 ${dark ? "bg-[#FF7A00] text-white" : "bg-primary text-white"}`}>
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />} Comprobar
        </button>
      </div>

      <AnimatePresence>
        {results.length > 0 && !coverage && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0 }} className="overflow-hidden">
            <div className={`mt-3 rounded-xl p-2 max-h-56 overflow-y-auto ${dark ? "bg-white/95" : "bg-white border border-slate-200"}`}>
              <p className="text-xs text-slate-500 px-2 py-1">Selecciona tu dirección:</p>
              {results.map((it, i) => (
                <button key={i} data-testid={`coverage-addr-${i}`} onClick={() => pickAddr(it)}
                  className="w-full text-left text-sm rounded-lg px-3 py-2 text-slate-700 hover:bg-primary/5 transition-colors">
                  {it.address || it.label || it.name}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {verticals.length > 1 && !coverage && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`mt-3 rounded-xl p-3 ${dark ? "bg-white/95" : "bg-white border border-slate-200"}`}>
            <p className="text-xs text-slate-500 mb-2">Selecciona portal / vivienda:</p>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
              {verticals.map((v, i) => (
                <button key={i} data-testid={`coverage-vertical-${i}`} onClick={() => pickVertical(v)}
                  className="text-sm rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 hover:border-primary hover:bg-primary/5 transition-colors">
                  {v.label || v.id || `Portal ${i + 1}`}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {coverage && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} data-testid="coverage-result"
            className={`mt-3 rounded-xl p-4 ${available ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
            <p className={`flex items-center gap-2 font-bold text-sm ${available ? "text-emerald-700" : "text-red-700"}`}>
              {available ? <><CheckCircle2 size={18} /> ¡Enhorabuena! Tienes cobertura {cov.technology || "de fibra"}</> : <><XCircle size={18} /> Aún no tenemos cobertura en esta dirección</>}
            </p>
            {cov.label && <p className="text-sm text-slate-600 mt-1">{cov.label}</p>}
            <button onClick={() => { reset(); setQ(""); onResult && onResult(null, null); }}
              className="text-xs text-primary font-semibold hover:underline mt-2">Comprobar otra dirección</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
