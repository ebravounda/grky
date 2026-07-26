import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Signal, Wifi, Tv, MapPin, CheckCircle2, XCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const famIcon = { Mobile: Signal, Fiber: Wifi, TV: Tv };

export default function Catalog() {
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState("");
  const [session, setSession] = useState(null);
  const [results, setResults] = useState([]);
  const [verticals, setVerticals] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get("/products").then((r) => setProducts(r.data)); }, []);

  const families = ["Mobile", "Fiber", "TV"];
  const byFamily = (f) => products.filter((p) => p.family === f && p.type === "Main");

  const searchAddr = async () => {
    if (!q.trim()) return;
    setLoading(true); setResults([]); setVerticals([]); setCoverage(null);
    try {
      const { data } = await api.get("/coverage/search", { params: { label: q.trim() } });
      setSession(data.sessionId || null);
      setResults(data.items || []);
      if (!(data.items || []).length) toast.info("Sin resultados para esa dirección");
    } catch (e) { toast.error(apiErr(e)); } finally { setLoading(false); }
  };

  const pickAddr = async (item) => {
    setLoading(true); setVerticals([]); setCoverage(null);
    try {
      const gescal = item.gescal || item.gescal37;
      const { data } = await api.get("/coverage/buildings", { params: { gescal, sessionId: session } });
      setSession(data.sessionId || session);
      const v = data.verticals || [];
      setVerticals(v);
      if (v.length === 1) await pickVertical(v[0], data.sessionId || session);
    } catch (e) { toast.error(apiErr(e)); } finally { setLoading(false); }
  };

  const pickVertical = async (v, sess) => {
    setLoading(true); setCoverage(null);
    try {
      const { data } = await api.post("/coverage/check", { gescal37: v.gescal37 || v.id || v.gescal, sessionId: sess || session });
      setCoverage(data);
    } catch (e) { toast.error(apiErr(e)); } finally { setLoading(false); }
  };

  const cov = coverage?.coverage || {};
  const available = coverage && (coverage.valid ?? true) && (coverage.products || []).length > 0;

  return (
    <div data-testid="catalog-page">
      <PageHeader overline="Venta" title="Catálogo & Cobertura" subtitle="Productos disponibles y consulta de cobertura de fibra (datos de Likes)." />

      <div className="rounded-lg border border-border bg-card p-6 mb-6">
        <div className="flex items-center gap-2 text-primary mb-3"><MapPin size={18} /><h3 className="font-heading font-600 text-foreground">Consultar cobertura de fibra</h3></div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input data-testid="coverage-address" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchAddr()} placeholder="Calle, número, ciudad…" className="pl-9" />
          </div>
          <Button data-testid="coverage-check-btn" onClick={searchAddr} disabled={loading} className="rounded-full">{loading ? "Buscando…" : "Buscar dirección"}</Button>
        </div>

        {results.length > 0 && !coverage && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">Selecciona tu dirección:</p>
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {results.map((it, i) => (
                <button key={i} data-testid={`coverage-addr-${i}`} onClick={() => pickAddr(it)}
                  className="w-full text-left text-sm rounded-md border border-border px-3 py-2 hover:border-primary hover:bg-primary/5 transition-colors">
                  {it.label || it.address || it.name || JSON.stringify(it)}
                </button>
              ))}
            </div>
          </div>
        )}

        {verticals.length > 1 && !coverage && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">Selecciona portal / vivienda:</p>
            <div className="flex flex-wrap gap-2">
              {verticals.map((v, i) => (
                <button key={i} data-testid={`coverage-vertical-${i}`} onClick={() => pickVertical(v)}
                  className="text-sm rounded-md border border-border px-3 py-1.5 hover:border-primary hover:bg-primary/5 transition-colors">
                  {v.label || v.id || v.gescal37 || `Portal ${i + 1}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {coverage && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            data-testid="coverage-result"
            className={`mt-4 rounded-md border p-4 ${available ? "border-success/30 bg-success/10" : "border-destructive/30 bg-destructive/10"}`}>
            <p className={`flex items-center gap-2 font-semibold text-sm ${available ? "text-success" : "text-destructive"}`}>
              {available ? <><CheckCircle2 size={16} /> Cobertura {cov.technology || "de fibra"} disponible</> : <><XCircle size={16} /> Sin cobertura en esta dirección</>}
            </p>
            {cov.label && <p className="text-sm text-muted-foreground mt-1">{cov.label}</p>}
            {available && (coverage.products || []).length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">Productos disponibles: <b className="text-foreground">{(coverage.products || []).map((p) => p.productName || p.productId).join(", ")}</b></p>
            )}
            <button onClick={() => { setCoverage(null); setResults([]); setVerticals([]); setQ(""); }}
              className="text-xs text-primary hover:underline mt-3">Nueva consulta</button>
          </motion.div>
        )}
      </div>

      <Tabs defaultValue="Mobile">
        <TabsList>
          {families.map((f) => <TabsTrigger key={f} value={f} data-testid={`catalog-tab-${f}`}>{f === "Mobile" ? "Móvil" : f === "Fiber" ? "Fibra" : "TV"}</TabsTrigger>)}
        </TabsList>
        {families.map((f) => (
          <TabsContent key={f} value={f} className="mt-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {byFamily(f).map((p, i) => {
                const Icon = famIcon[f];
                return (
                  <motion.div key={p.productId} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    data-testid={`product-${p.productId}`} className="rounded-lg border border-border bg-card p-6 card-hover">
                    <div className="flex items-center justify-between mb-4">
                      <span className="grid place-items-center h-10 w-10 rounded-md bg-primary/10 text-primary"><Icon size={20} /></span>
                      <span className="text-xs text-muted-foreground">#{p.productId}</span>
                    </div>
                    <h4 className="font-heading font-600 text-lg">{p.productName}</h4>
                    <div className="mt-2 mb-4">
                      <span className="font-heading text-3xl font-700">{p.price.toFixed(2)}</span>
                      <span className="text-muted-foreground text-sm"> €/mes</span>
                    </div>
                    <ul className="space-y-1.5">
                      {p.marketingText?.map((m, j) => (
                        <li key={j} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 size={14} className="text-success" /> {m.title}: <b className="text-foreground font-medium">{m.value}</b>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
