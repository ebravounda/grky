import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { RefreshCw, Radio, CheckCircle2, XCircle, PackageSearch } from "lucide-react";
import { toast } from "sonner";

export default function LikesCard() {
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const check = async () => {
    setChecking(true);
    try {
      const { data } = await api.get("/likes/status");
      setStatus(data);
    } catch (e) { toast.error(apiErr(e)); } finally { setChecking(false); }
  };
  useEffect(() => { check(); }, []);

  const syncCatalog = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/likes/sync-catalog");
      toast.success(`Catálogo sincronizado: ${data.synced} productos importados de Likes`);
    } catch (e) { toast.error(apiErr(e)); } finally { setSyncing(false); }
  };

  const live = status?.live;

  return (
    <div data-testid="likes-card" className="rounded-lg border border-border bg-card p-6 lg:col-span-2 space-y-4">
      <div className="flex items-center gap-2 text-primary">
        <Radio size={18} />
        <h3 className="font-heading font-600 text-foreground">Conexión con Likes Telecom</h3>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {live ? (
          <span data-testid="likes-status-live" className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-sm font-600">
            <CheckCircle2 size={15} /> Conectado (datos reales)
          </span>
        ) : (
          <span data-testid="likes-status-offline" className="inline-flex items-center gap-1.5 rounded-full bg-muted text-muted-foreground px-3 py-1 text-sm font-600">
            <XCircle size={15} /> No conectado (MOCK)
          </span>
        )}
        <Button variant="outline" size="sm" className="rounded-full gap-1.5" data-testid="likes-recheck-btn" onClick={check} disabled={checking}>
          <RefreshCw size={14} className={checking ? "animate-spin" : ""} /> Reintentar
        </Button>
      </div>

      {!live && status?.lastError && (
        <p className="text-xs text-muted-foreground">Último error: <code className="rounded bg-muted px-1 py-0.5">{status.lastError}</code></p>
      )}

      <p className="text-sm text-muted-foreground">
        En preview la IP es dinámica y Likes la rechaza (403); es normal. La conexión real funciona en tu servidor de producción (IP fija autorizada). Cuando esté conectado, las altas se sincronizan y el catálogo puede importarse desde Likes.
      </p>

      <div>
        <Button className="rounded-full gap-2" data-testid="likes-sync-catalog-btn" onClick={syncCatalog} disabled={syncing || !live}>
          <PackageSearch size={16} /> {syncing ? "Sincronizando…" : "Importar catálogo desde Likes"}
        </Button>
        {!live && <p className="text-xs text-muted-foreground mt-2">Disponible solo cuando Likes está conectado.</p>}
      </div>
    </div>
  );
}
