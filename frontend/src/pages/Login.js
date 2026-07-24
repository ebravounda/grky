import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  const fill = (em, pw) => { setEmail(em); setPassword(pw); };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:block relative overflow-hidden">
        <img
          src="https://images.pexels.com/photos/8640331/pexels-photo-8640331.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
          alt="Fibra óptica" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[hsl(224_71%_6%)]/80" />
        <div className="relative h-full flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-2.5">
            <div className="bg-white rounded-md px-2.5 py-1.5"><img src="https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png" alt="GoRoky" className="h-6 w-auto" /></div>
          </div>
          <div>
            <h2 className="font-heading text-4xl font-700 tracking-tight leading-tight">
              Gestiona líneas, clientes y facturación<br />desde un único lugar.
            </h2>
            <p className="mt-4 text-white/70 max-w-md">
              CRM para el equipo y área de clientes self-service, conectado a la API de Likes Telecom.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <img src="https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png" alt="GoRoky" className="h-8 w-auto" />
          </div>
          <p className="overline text-primary mb-2">Acceso</p>
          <h1 className="font-heading text-3xl font-700 tracking-tight">Inicia sesión</h1>
          <p className="text-muted-foreground text-sm mt-1.5 mb-8">Introduce tus credenciales para continuar.</p>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" data-testid="login-email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" data-testid="login-password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <Button data-testid="login-submit" type="submit" disabled={loading}
              className="w-full rounded-full h-11 gap-2">
              {loading ? "Entrando..." : <>Entrar <ArrowRight size={16} /></>}
            </Button>
          </form>

          <div className="mt-8 rounded-lg border border-border bg-muted/40 p-4 text-xs space-y-2">
            <p className="font-semibold text-foreground">Cuentas de demostración</p>
            <button data-testid="demo-admin" onClick={() => fill("admin@goroky.com", "Goroky2026!")}
              className="block w-full text-left text-muted-foreground hover:text-primary transition-colors">
              → Administrador: admin@goroky.com
            </button>
            <button data-testid="demo-client" onClick={() => fill("cliente@goroky.com", "Cliente2026!")}
              className="block w-full text-left text-muted-foreground hover:text-primary transition-colors">
              → Cliente: cliente@goroky.com
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
