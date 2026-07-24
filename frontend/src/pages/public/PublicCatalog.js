import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Signal, Wifi, Satellite, Tv, CheckCircle2, ArrowRight, Tv2 } from "lucide-react";
import { motion } from "framer-motion";

const TABS = [
  { key: "Mobile", label: "Móvil", icon: Signal },
  { key: "Fiber", label: "Fibra", icon: Wifi },
  { key: "Satellite", label: "Satélite", icon: Satellite },
  { key: "TV", label: "TV", icon: Tv },
];

export default function PublicCatalog() {
  const [catalog, setCatalog] = useState({});
  const navigate = useNavigate();

  useEffect(() => { api.get("/public/catalog").then((r) => setCatalog(r.data)); }, []);

  return (
    <div className="min-h-screen bg-background" data-testid="public-catalog">
      <header className="border-b border-border glass sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-2.5">
          <img src="https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png" alt="GoRoky" className="h-7 w-auto" />
          <div className="leading-tight"><p className="text-[10px] text-muted-foreground overline mt-0.5">Contrata online</p></div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-5 pt-12 pb-6 text-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <p className="overline text-primary mb-3">Tarifas Goroky</p>
          <h1 className="font-heading text-4xl sm:text-5xl font-700 tracking-tight">Elige tu tarifa y contrata en minutos</h1>
          <p className="text-muted-foreground mt-4 max-w-xl mx-auto">Móvil, fibra, satélite y TV. Sin permanencia. Alta 100% online con firma digital.</p>
        </motion.div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-20">
        <Tabs defaultValue="Mobile">
          <TabsList className="flex flex-wrap h-auto">
            {TABS.map((t) => <TabsTrigger key={t.key} value={t.key} data-testid={`public-tab-${t.key}`} className="gap-1.5"><t.icon size={15} /> {t.label}</TabsTrigger>)}
          </TabsList>
          {TABS.map((t) => (
            <TabsContent key={t.key} value={t.key} className="mt-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {(catalog[t.key] || []).map((p, i) => (
                  <motion.div key={p.productId} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    data-testid={`public-product-${p.productId}`} className="rounded-xl border border-border bg-card p-6 card-hover flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <span className="grid place-items-center h-11 w-11 rounded-md bg-primary/10 text-primary"><t.icon size={22} /></span>
                    </div>
                    <h3 className="font-heading font-600 text-lg">{p.productName}</h3>
                    <div className="mt-2 mb-4"><span className="font-heading text-4xl font-700">{p.price.toFixed(2)}</span><span className="text-muted-foreground"> €/mes</span></div>
                    <ul className="space-y-1.5 mb-5 flex-1">
                      {(p.marketingText || []).map((m, j) => (
                        <li key={j} className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 size={15} className="text-success shrink-0" /> {m.title}: <b className="text-foreground font-medium">{m.value}</b></li>
                      ))}
                    </ul>
                    {p.channels?.length > 0 && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" className="w-full rounded-full gap-1.5 mb-2" data-testid={`channels-${p.productId}`}><Tv2 size={15} /> Ver {p.channels.length} canales</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader><DialogTitle>Canales · {p.productName}</DialogTitle></DialogHeader>
                          <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                            {p.channels.map((ch, k) => <span key={k} className="flex items-center gap-1.5 text-sm py-1"><Tv size={13} className="text-primary shrink-0" /> {ch}</span>)}
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                    <Button className="w-full rounded-full gap-2" data-testid={`contract-${p.productId}`} onClick={() => navigate(`/contratar/${p.productId}`)}>Contratar <ArrowRight size={16} /></Button>
                  </motion.div>
                ))}
                {(catalog[t.key] || []).length === 0 && <p className="text-muted-foreground col-span-full text-center py-10">No hay tarifas disponibles en esta categoría.</p>}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </section>
    </div>
  );
}
