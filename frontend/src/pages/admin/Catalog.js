import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Signal, Wifi, Tv, MapPin, CheckCircle2, Search } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const famIcon = { Mobile: Signal, Fiber: Wifi, TV: Tv };

export default function Catalog() {
  const [products, setProducts] = useState([]);
  const [address, setAddress] = useState("");
  const [coverage, setCoverage] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => { api.get("/products").then((r) => setProducts(r.data)); }, []);

  const families = ["Mobile", "Fiber", "TV"];
  const byFamily = (f) => products.filter((p) => p.family === f && p.type === "Main");

  const check = async () => {
    if (!address) return;
    setChecking(true);
    try {
      const { data } = await api.post("/coverage", { address });
      setCoverage(data);
      toast.success("Cobertura consultada");
    } catch (e) { toast.error(apiErr(e)); } finally { setChecking(false); }
  };

  return (
    <div data-testid="catalog-page">
      <PageHeader overline="Venta" title="Catálogo & Cobertura" subtitle="Productos disponibles y consulta de cobertura de fibra." />

      <div className="rounded-lg border border-border bg-card p-6 mb-6">
        <div className="flex items-center gap-2 text-primary mb-3"><MapPin size={18} /><h3 className="font-heading font-600 text-foreground">Consultar cobertura</h3></div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input data-testid="coverage-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, número, ciudad…" className="pl-9" />
          </div>
          <Button data-testid="coverage-check-btn" onClick={check} disabled={checking} className="rounded-full">{checking ? "Consultando…" : "Consultar"}</Button>
        </div>
        {coverage && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-md border border-success/30 bg-success/10 p-4">
            <p className="flex items-center gap-2 text-success font-semibold text-sm"><CheckCircle2 size={16} /> Cobertura {coverage.coverage.technology} disponible</p>
            <p className="text-sm text-muted-foreground mt-1">{coverage.coverage.label}</p>
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
