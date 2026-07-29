import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api, { apiErr } from "@/lib/api";
import SignaturePad from "@/components/SignaturePad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, CheckCircle2, PenLine, Download } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function ContractSign() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [sigImage, setSigImage] = useState(null);
  const [typedName, setTypedName] = useState("");
  const [mode, setMode] = useState("draw");
  const [done, setDone] = useState(false);
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/public/contract-sign/${token}`).then((r) => {
      setInfo(r.data);
      if (r.data.signed) { setDone(true); setCode(r.data.contractCode); }
    }).catch(() => setInfo(false));
  }, [token]);

  const viewContract = async () => {
    const res = await api.get(`/public/contract-sign/${token}/contract.pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const sign = async () => {
    if (mode === "draw" && !sigImage) return toast.error("Firma en el recuadro");
    if (mode === "text" && !typedName.trim()) return toast.error("Escribe tu nombre completo");
    setSaving(true);
    try {
      const { data } = await api.post(`/public/contract-sign/${token}`, {
        signatureType: mode, signerName: mode === "text" ? typedName : (info.customerName || ""),
        signatureImage: mode === "draw" ? sigImage : null,
      });
      setCode(data.contractCode);
      setDone(true);
      toast.success("¡Contrato firmado correctamente!");
    } catch (e) { toast.error(apiErr(e)); } finally { setSaving(false); }
  };

  if (info === false) return <Centered>Enlace no válido o expirado.</Centered>;
  if (!info) return <Centered><div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" /></Centered>;

  if (done) {
    return (
      <Shell>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="rounded-xl border border-border bg-card p-10 text-center" data-testid="contract-sign-success">
          <CheckCircle2 size={52} className="mx-auto text-success mb-4" />
          <h1 className="font-heading text-2xl font-700">¡Contrato firmado!</h1>
          <p className="text-muted-foreground mt-2">Hemos recibido tu firma. Recibirás una copia en tu email.</p>
          <p className="mt-4 text-sm">Código de contrato: <b className="font-mono">{code}</b></p>
          <Button className="rounded-full mt-6 gap-2" onClick={viewContract} data-testid="contract-sign-download"><Download size={16} /> Descargar contrato</Button>
        </motion.div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8" data-testid="contract-sign">
        <p className="overline text-primary mb-2">Contrato {info.contractCode}</p>
        <h1 className="font-heading text-2xl font-700">Firma tu contrato</h1>
        <p className="text-muted-foreground text-sm mt-1">{info.productName} · {info.price?.toFixed(2)} €/mes · {info.customerName}</p>

        <button onClick={viewContract} data-testid="contract-sign-view-btn" className="mt-5 flex items-center gap-2 text-sm text-primary hover:underline">
          <FileText size={16} /> Ver el contrato completo (PDF)
        </button>

        <div className="mt-6">
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList>
              <TabsTrigger value="draw" data-testid="contract-sign-mode-draw">Firmar con el dedo</TabsTrigger>
              <TabsTrigger value="text" data-testid="contract-sign-mode-text">Escribir mi nombre</TabsTrigger>
            </TabsList>
            <TabsContent value="draw" className="mt-4"><SignaturePad onChange={setSigImage} /></TabsContent>
            <TabsContent value="text" className="mt-4">
              <Label>Nombre y apellidos</Label>
              <Input data-testid="contract-sign-typed-name" value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="Tu nombre completo" className="mt-1.5" />
              {typedName && <p className="mt-3 font-heading text-2xl italic" style={{ fontFamily: "cursive" }}>{typedName}</p>}
            </TabsContent>
          </Tabs>
        </div>

        <Button className="w-full rounded-full mt-6 gap-2 h-11" disabled={saving} onClick={sign} data-testid="contract-sign-btn">
          <PenLine size={16} /> {saving ? "Firmando…" : "Firmar contrato"}
        </Button>
        <p className="text-xs text-muted-foreground text-center mt-3">Al firmar aceptas el contrato de prestación de servicios de Goroky Telecom.</p>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border glass">
        <div className="max-w-2xl mx-auto px-5 h-16 flex items-center gap-2.5">
          <img src="https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png" alt="GoRoky" className="h-7 w-auto" />
        </div>
      </header>
      <div className="max-w-2xl mx-auto px-5 py-10">{children}</div>
    </div>
  );
}

function Centered({ children }) {
  return <div className="min-h-screen grid place-items-center bg-background text-muted-foreground px-6 text-center">{children}</div>;
}
