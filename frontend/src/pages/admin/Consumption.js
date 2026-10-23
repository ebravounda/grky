import { useEffect, useState } from "react";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ConsumptionPanel, UsageBar } from "@/components/ConsumptionPanel";
import { Search } from "lucide-react";
import { toast } from "sonner";

export default function Consumption() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.get("/consumption", { params: q.trim() ? { q: q.trim() } : {} }).then((r) => setRows(r.data)).catch((e) => { toast.error(apiErr(e)); setRows([]); });
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div data-testid="consumption-page">
      <PageHeader title="Consumo" subtitle="GB, minutos y SMS de cada línea · solo lectura" />
      <div className="relative max-w-md mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input data-testid="consumption-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por línea, cliente o NIF…" className="pl-9" />
      </div>
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-3 text-left">Línea</th><th className="px-4 py-3 text-left">Cliente</th><th className="px-4 py-3 text-left w-56">Datos</th><th className="px-4 py-3 text-right">Minutos</th><th className="px-4 py-3 text-right">Llamadas</th><th className="px-4 py-3 text-right">SMS</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows?.map((l) => (
              <tr key={l.lineNumber} onClick={() => setSel(l)} className="cursor-pointer hover:bg-muted/40" data-testid={`consumption-row-${l.lineNumber}`}>
                <td className="px-4 py-3"><p className="font-semibold">{l.lineNumber}</p><p className="text-xs text-muted-foreground">{l.productName}</p></td>
                <td className="px-4 py-3"><p>{l.customerName || "—"}</p><p className="text-xs text-muted-foreground">{l.fiscalId}</p></td>
                <td className="px-4 py-3"><UsageBar used={l.usedGB} total={l.totalGB} /></td>
                <td className="px-4 py-3 text-right">{l.nationalMinutes}</td>
                <td className="px-4 py-3 text-right">{l.callsCount}</td>
                <td className="px-4 py-3 text-right">{l.sms}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows === null && <p className="p-6 text-center text-muted-foreground">Cargando…</p>}
        {rows?.length === 0 && <p className="p-6 text-center text-muted-foreground" data-testid="consumption-no-results">Sin líneas</p>}
      </div>
      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="consumption-dialog">
          <DialogHeader><DialogTitle>{sel?.customerName || sel?.fiscalId}</DialogTitle><DialogDescription>Consumo de todas sus líneas</DialogDescription></DialogHeader>
          {sel && <ConsumptionPanel fiscalId={sel.fiscalId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
