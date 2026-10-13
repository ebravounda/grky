import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Newspaper, PlugZap, Save, Unplug, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function BlogSettings() {
  const [cfg, setCfg] = useState(null);
  const [url, setUrl] = useState("");
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState("");
  const load = () => api.get("/admin/blog/settings").then((r) => setCfg(r.data)).catch((e) => toast.error(apiErr(e)));
  useEffect(() => { load(); }, []);

  const run = async (kind) => {
    setBusy(kind);
    try {
      if (kind === "test") { const { data } = await api.post("/admin/blog/test", { url }); setTest(data); }
      if (kind === "save") { const { data } = await api.post("/admin/blog/save", { url }); setTest(data); setUrl(""); toast.success("Blog conectado y guardado"); load(); }
      if (kind === "off") { if (!window.confirm("¿Desconectar el blog? Dejarán de mostrarse los artículos.")) return; await api.delete("/admin/blog/settings"); setTest(null); toast.success("Blog desconectado"); load(); }
    } catch (e) { setTest(null); toast.error(apiErr(e)); } finally { setBusy(""); }
  };

  return (
    <div className="max-w-3xl" data-testid="blog-settings-page">
      <h1 className="font-heading text-3xl font-bold flex items-center gap-2 mb-1"><Newspaper size={26} /> Blog SEO</h1>
      <p className="text-muted-foreground mb-8">Conecta el motor de contenidos SEO. Los artículos se publican en el motor y aparecen solos en <a href="/blog" target="_blank" rel="noreferrer" className="text-primary underline">/blog</a>.</p>

      {cfg?.enabled && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 mb-6 flex flex-wrap items-center gap-3" data-testid="blog-connected-card">
          <CheckCircle2 className="text-emerald-600" size={20} />
          <div className="text-sm">
            <p className="font-semibold text-emerald-800">Conectado{cfg.brand ? ` a ${cfg.brand}` : ""}</p>
            <p className="text-emerald-700">API: {cfg.api_base} · Clave: <span className="font-mono" data-testid="blog-key-masked">{cfg.keyMasked}</span></p>
          </div>
          <div className="ml-auto flex gap-2">
            <a href="/blog" target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="gap-1.5"><ExternalLink size={14} /> Ver blog</Button></a>
            <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/40" onClick={() => run("off")} disabled={!!busy} data-testid="blog-disconnect-btn"><Unplug size={14} /> Desconectar</Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="blog-url">Enlace de conexión</Label>
          <Input id="blog-url" data-testid="blog-connect-url" value={url} onChange={(e) => { setUrl(e.target.value); setTest(null); }}
            placeholder="https://…/api/public/{id}/connect?key={clave}" />
          <p className="text-xs text-muted-foreground">{cfg?.enabled ? "Pega un enlace nuevo para cambiar la conexión." : "Pega aquí el enlace que te da el motor de contenidos."}</p>
        </div>
        {test && <p className="text-sm font-semibold text-emerald-700 flex items-center gap-2" data-testid="blog-test-result"><CheckCircle2 size={16} /> Conectado a {test.brand} · {test.published} artículos publicados</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1.5" disabled={!url || !!busy} onClick={() => run("test")} data-testid="blog-test-btn"><PlugZap size={15} /> {busy === "test" ? "Probando…" : "Probar conexión"}</Button>
          <Button className="gap-1.5" disabled={!url || !!busy} onClick={() => run("save")} data-testid="blog-save-btn"><Save size={15} /> {busy === "save" ? "Guardando…" : "Guardar"}</Button>
        </div>
      </div>
    </div>
  );
}
