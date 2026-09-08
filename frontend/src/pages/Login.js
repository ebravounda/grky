import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowRight, Eye, EyeOff, Mail, Lock, Zap, ShieldCheck, Smartphone,
  CheckCircle2, KeyRound, Loader2,
} from "lucide-react";
import { toast } from "sonner";

const LOGO = "https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png";
const FIBER = "https://images.unsplash.com/photo-1653549893012-b8b4fbe97630?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njl8MHwxfHNlYXJjaHwzfHxhYnN0cmFjdCUyMGJsdWUlMjBmaWJlciUyMG9wdGljJTIwbmV0d29yayUyMGRhcmt8ZW58MHx8fGJsdWV8MTc4ODg5MTU5M3ww&ixlib=rb-4.1.0&q=85";

const FEATURES = [
  { icon: Zap, title: "Fibra ultra-rápida", desc: "Hasta 1 Gbps simétrico sin cortes" },
  { icon: ShieldCheck, title: "Control de facturación", desc: "Tu consumo y tus facturas en tiempo real" },
  { icon: Smartphone, title: "Gestión multilínea 5G", desc: "Gigas extra y eSIM al instante" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("login"); // "login" | "forgot"
  const [fpEmail, setFpEmail] = useState("");
  const [fpLoading, setFpLoading] = useState(false);
  const [fpSent, setFpSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(email, password);
      toast.success(`Bienvenido, ${u.name}`);
      navigate(u.role === "admin" ? "/app" : "/portal");
    } catch (err) {
      toast.error(apiErr(err, "No se pudo iniciar sesión"));
    } finally {
      setLoading(false);
    }
  };

  const submitForgot = async (e) => {
    e.preventDefault();
    setFpLoading(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { email: fpEmail });
      setFpSent(true);
      toast.success(data?.message || "Si el email es de un cliente, recibirás tu nueva contraseña por correo.");
    } catch (err) {
      toast.error(apiErr(err, "No se pudo procesar la solicitud"));
    } finally {
      setFpLoading(false);
    }
  };

  return (
    <div data-testid="login-page"
      className="min-h-screen w-full flex flex-col lg:flex-row bg-slate-950 text-slate-900 overflow-hidden">

      {/* ---------- Panel de marca (desktop) ---------- */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col justify-between p-14 xl:p-16 text-white overflow-hidden
        bg-gradient-to-br from-[hsl(222,47%,8%)] via-[hsl(216,95%,16%)] to-[hsl(216,100%,42%)]">
        <img src={FIBER} alt="" aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-screen pointer-events-none select-none" />
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-[hsl(216,100%,52%)]/40 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-cyan-400/20 blur-[110px]" />

        <div className="relative z-10">
          <div className="inline-flex bg-white rounded-2xl px-4 py-2.5 shadow-lg">
            <img src={LOGO} alt="GoRoky" className="h-8 w-auto" />
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="relative z-10 max-w-lg">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-3.5 py-1.5 text-xs font-semibold backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Plataforma de clientes GoRoky
          </span>
          <h1 className="font-heading text-4xl xl:text-5xl font-bold tracking-tight leading-[1.08] mt-6">
            Contrata tu línea hoy
          </h1>
          <p className="text-white/70 text-base leading-relaxed mt-4 max-w-md">
            Gestiona tus líneas, consumo, facturas y pagos, así de Roky, así de simple.
          </p>

          <div className="mt-9 space-y-3">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.1 }}
                className="flex items-center gap-4 rounded-2xl bg-white/[0.07] border border-white/10 backdrop-blur-md px-4 py-3.5">
                <span className="grid place-items-center h-11 w-11 rounded-xl bg-[hsl(216,100%,52%)] shadow-[0_8px_24px_-6px_rgba(0,51,255,0.7)] shrink-0">
                  <f.icon size={20} className="text-white" />
                </span>
                <div>
                  <p className="font-semibold text-[15px] leading-tight">{f.title}</p>
                  <p className="text-white/60 text-[13px] leading-tight mt-0.5">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <div className="relative z-10 flex items-center gap-3 text-white/50 text-xs">
          <ShieldCheck size={15} /> Conexión cifrada · Datos protegidos · © {new Date().getFullYear()} GoRoky
        </div>
      </div>

      {/* ---------- Panel del formulario ---------- */}
      <div className="w-full lg:w-[48%] flex flex-col bg-slate-50 relative">
        {/* franja de marca (solo móvil) */}
        <div className="lg:hidden relative overflow-hidden px-6 pt-12 pb-10 text-center text-white
          bg-gradient-to-br from-[hsl(222,47%,10%)] via-[hsl(216,95%,20%)] to-[hsl(216,100%,48%)]">
          <img src={FIBER} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-25 mix-blend-screen" />
          <div className="relative z-10 flex flex-col items-center">
            <div className="bg-white rounded-2xl px-4 py-2.5 shadow-lg mb-5"><img src={LOGO} alt="GoRoky" className="h-8 w-auto" /></div>
            <h1 className="font-heading text-2xl font-bold tracking-tight">Bienvenido de nuevo</h1>
            <p className="text-white/70 text-sm mt-1.5 max-w-xs">Gestiona tus líneas, consumo y facturas en un solo lugar.</p>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 sm:px-10 lg:px-16 py-10 -mt-6 lg:mt-0">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-full max-w-md bg-white rounded-3xl border border-slate-100 shadow-[0_24px_60px_-20px_rgba(0,51,255,0.18)] p-8 sm:p-10">

            <AnimatePresence mode="wait">
              {mode === "login" ? (
                <motion.div key="login" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.2 }}>
                  <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
                    <Lock size={12} /> Acceso seguro
                  </span>
                  <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900">Inicia sesión</h2>
                  <p className="text-slate-500 text-sm mt-1 mb-7">Introduce tus datos para acceder a tu cuenta.</p>

                  <form onSubmit={submit} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Email</Label>
                      <div className="relative">
                        <Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input id="email" data-testid="login-email" type="email" value={email} autoComplete="email"
                          onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" required
                          className="h-12 rounded-xl pl-10 bg-white border-slate-200 focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:border-primary" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Contraseña</Label>
                        <button type="button" data-testid="forgot-password-link"
                          onClick={() => { setFpEmail(email); setFpSent(false); setMode("forgot"); }}
                          className="text-xs font-semibold text-primary hover:underline">¿Has olvidado tu contraseña?</button>
                      </div>
                      <div className="relative">
                        <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input id="password" data-testid="login-password" type={show ? "text" : "password"} value={password}
                          autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required
                          className="h-12 rounded-xl pl-10 pr-11 bg-white border-slate-200 focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:border-primary" />
                        <button type="button" data-testid="toggle-password" onClick={() => setShow((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors">
                          {show ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <Button data-testid="login-submit" type="submit" disabled={loading}
                      className="w-full rounded-xl h-12 gap-2 text-base font-semibold shadow-[0_8px_25px_-4px_rgba(0,51,255,0.45)] hover:shadow-[0_12px_30px_-4px_rgba(0,51,255,0.6)] active:scale-[0.98] transition-[transform,box-shadow]">
                      {loading ? <><Loader2 size={17} className="animate-spin" /> Entrando…</> : <>Entrar <ArrowRight size={17} /></>}
                    </Button>
                  </form>

                  <div className="mt-7 pt-6 border-t border-slate-100 text-center">
                    <p className="text-sm text-slate-500">
                      ¿Aún no eres cliente?{" "}
                      <a href="/contratar" data-testid="signup-link" className="font-semibold text-primary hover:underline">Contrata aquí</a>
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="forgot" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
                  <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
                    <KeyRound size={12} /> Recuperación
                  </span>
                  <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900">Recuperar contraseña</h2>
                  <p className="text-slate-500 text-sm mt-1 mb-7">Introduce el email de tu cuenta de cliente y te enviaremos una contraseña nueva por correo.</p>

                  {fpSent ? (
                    <div data-testid="forgot-sent" className="rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm p-4 leading-relaxed flex gap-3">
                      <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
                      <span>Si el email corresponde a una cuenta de cliente, recibirás tu <b>nueva contraseña</b> en unos minutos. Revisa también la carpeta de spam.</span>
                    </div>
                  ) : (
                    <form onSubmit={submitForgot} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="fp-email" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Email</Label>
                        <div className="relative">
                          <Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <Input id="fp-email" data-testid="forgot-email" type="email" value={fpEmail} autoComplete="email"
                            onChange={(e) => setFpEmail(e.target.value)} placeholder="tu@email.com" required
                            className="h-12 rounded-xl pl-10 bg-white border-slate-200 focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:border-primary" />
                        </div>
                      </div>
                      <Button data-testid="forgot-submit" type="submit" disabled={fpLoading}
                        className="w-full rounded-xl h-12 gap-2 text-base font-semibold shadow-[0_8px_25px_-4px_rgba(0,51,255,0.45)] active:scale-[0.98] transition-[transform,box-shadow]">
                        {fpLoading ? <><Loader2 size={17} className="animate-spin" /> Enviando…</> : <>Enviar nueva contraseña <ArrowRight size={17} /></>}
                      </Button>
                    </form>
                  )}

                  <div className="mt-7 pt-6 border-t border-slate-100 text-center">
                    <button type="button" data-testid="back-to-login" onClick={() => setMode("login")}
                      className="text-sm font-semibold text-primary hover:underline">← Volver a iniciar sesión</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
