import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Eye, EyeOff, Mail, Lock } from "lucide-react";
import { toast } from "sonner";

const LOGO = "https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[hsl(216_100%_52%)] via-[hsl(216_95%_44%)] to-[hsl(216_88%_28%)]"
      data-testid="login-page">
      {/* Marca / hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-14 pb-8 text-center text-white">
        <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}
          className="bg-white rounded-2xl px-4 py-3 shadow-lg mb-6">
          <img src={LOGO} alt="GoRoky" className="h-9 w-auto" />
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="font-heading text-3xl sm:text-4xl font-700 tracking-tight">
          Bienvenido de nuevo
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
          className="text-white/75 text-sm mt-2 max-w-xs">
          Gestiona tus líneas, tu consumo y tus facturas desde un solo lugar.
        </motion.p>
      </div>

      {/* Tarjeta del formulario */}
      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}
        className="bg-background rounded-t-[2rem] px-6 pt-9 pb-10 shadow-[0_-8px_40px_rgba(0,0,0,0.18)]">
        <div className="w-full max-w-sm mx-auto">
          <h2 className="font-heading text-xl font-700 tracking-tight text-foreground">Inicia sesión</h2>
          <p className="text-muted-foreground text-sm mt-1 mb-7">Introduce tus datos para acceder a tu cuenta.</p>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" data-testid="login-email" type="email" value={email} autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" required
                  className="h-12 rounded-xl pl-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input id="password" data-testid="login-password" type={show ? "text" : "password"} value={password}
                  autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required
                  className="h-12 rounded-xl pl-10 pr-11" />
                <button type="button" data-testid="toggle-password" onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button data-testid="login-submit" type="submit" disabled={loading}
              className="w-full rounded-xl h-12 gap-2 text-base font-600 shadow-[0_6px_20px_-4px_hsl(216_100%_52%/0.5)] active:scale-[0.98] transition-transform">
              {loading ? "Entrando…" : <>Entrar <ArrowRight size={17} /></>}
            </Button>
          </form>

          <div className="mt-7 pt-6 border-t border-border text-center">
            <p className="text-sm text-muted-foreground">
              ¿Aún no eres cliente?{" "}
              <a href="/contratar" data-testid="signup-link" className="font-600 text-primary hover:underline">Contrata aquí</a>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
