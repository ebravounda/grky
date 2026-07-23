import { useEffect, useState } from "react";
import api, { API } from "@/lib/api";
import { PageHeader } from "@/components/shared";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { FolderDown, FileSpreadsheet, Download } from "lucide-react";

export default function Resources() {
  const [groups, setGroups] = useState([]);

  useEffect(() => { api.get("/resources").then((r) => setGroups(r.data)); }, []);

  const download = async (path, name) => {
    const res = await api.get("/resources/download", { params: { path, name }, responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  return (
    <div data-testid="resources-page">
      <PageHeader overline="Distribuidor" title="Recursos" subtitle="Facturación mayorista, comisiones, CDRs, albaranes y stock." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {groups.map((g) => (
          <div key={g.title} data-testid={`resource-group-${g.title}`} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-primary mb-3"><FolderDown size={18} /><h3 className="font-heading font-600 text-foreground">{g.title}</h3></div>
            <Accordion type="single" collapsible>
              {g.folders.map((f, i) => (
                <AccordionItem key={i} value={`${g.title}-${i}`}>
                  <AccordionTrigger className="text-sm">{f.title}</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {f.documents.map((doc, j) => (
                        <button key={j} data-testid={`download-${doc}`} onClick={() => download(f.path, doc)}
                          className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted transition-colors">
                          <span className="flex items-center gap-2 text-left truncate"><FileSpreadsheet size={15} className="text-muted-foreground shrink-0" /> <span className="truncate">{doc}</span></span>
                          <Download size={15} className="text-primary shrink-0" />
                        </button>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </div>
    </div>
  );
}
