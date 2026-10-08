import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, X } from "lucide-react";

export const CustomerPicker = ({ selected, onChange }) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);

  useEffect(() => {
    const t = setTimeout(() => {
      api.get("/customers", { params: q.trim() ? { q: q.trim() } : {} }).then((r) => setResults(r.data.slice(0, 50))).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const isSel = (fid) => selected.some((c) => c.fiscalId === fid);
  const toggle = (c) => onChange(isSel(c.fiscalId) ? selected.filter((x) => x.fiscalId !== c.fiscalId) : [...selected, { fiscalId: c.fiscalId, name: c.name, email: c.email }]);

  return (
    <div className="space-y-2" data-testid="customer-picker">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <span key={c.fiscalId} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2.5 py-1" data-testid={`picked-${c.fiscalId}`}>
              {c.name || c.fiscalId}
              <button type="button" onClick={() => toggle(c)} aria-label="Quitar" data-testid={`unpick-${c.fiscalId}`}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input data-testid="customer-picker-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente por nombre, NIF o email…" className="pl-9" />
      </div>
      <div className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border">
        {results.map((c) => (
          <label key={c.fiscalId} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50" data-testid={`pick-row-${c.fiscalId}`}>
            <Checkbox checked={isSel(c.fiscalId)} onCheckedChange={() => toggle(c)} disabled={!c.email} />
            <span className="font-medium">{c.name}</span>
            <span className="text-xs text-muted-foreground">{c.fiscalId}</span>
            <span className="ml-auto text-xs text-muted-foreground truncate max-w-[220px]">{c.email || "sin email"}</span>
          </label>
        ))}
        {results.length === 0 && <p className="px-3 py-4 text-center text-sm text-muted-foreground">Sin resultados</p>}
      </div>
    </div>
  );
};

export const parseEmails = (txt) => Array.from(new Set((txt || "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)));
export const isEmail = (e) => /^[^@\s,;]+@[^@\s,;]+\.[a-z]{2,}$/i.test(e);
