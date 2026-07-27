import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { apiErr } from "@/lib/api";
import { resizeImage } from "@/lib/img";
import CameraCapture from "@/components/CameraCapture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, IdCard, Upload, CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const LOGO = "https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png";

export default function ResubmitDocs() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ docFront: null, docBack: null, selfie: null, iban: "", contactPhone: "" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    api.get(`/public/applications/${token}`)
      .then((r) => { setApp(r.data); setF((s) => ({ ...s, iban: r.data.iban || "", contactPhone: r.data.contactPhone || "" })); })
      .catch(() => setNotFound(true));
  }, [token]);

  const uploadDoc = async (key, e) => {
    const file = e.target.files?.[0];
    if (file) set(key, await resizeImage(file));
  };

  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`/public/applications/${token}/resubmit`, {
        docFront: f.docFront, docBack: f.docBack, selfie: f.selfie,
        iban: f.iban, contactPhone: f.contactPhone,
      });
      setDone(true);
    } catch (e) { toast.error(apiErr(e)); } finally { setSaving(false); }
  };

  if (notFound) return <Center><p className="text-muted-foreground">Enlace no válido o caducado.</p></Center>;
  if (!app) return <Center><div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" /></Center>;

  const needsChanges = ["CHANGES_REQUESTED", "REJECTED"].includes(app.reviewStatus);

  return (
    <div className="min-h-screen bg-background" data-testid="resubmit-page">
      <header className="border-b border-border glass sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 sm:px-5 h-16 flex items-center">
          <img src={LOGO} alt="GoRoky" className="h-7 w-auto" />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-5 py-6 sm:py-8">
        {done ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm" data-testid="resubmit-done">
            <div className="mx-auto h-14 w-14 grid place-items-center rounded-full bg-success/15 text-success mb-4"><CheckCircle2 size={30} /></div>
            <h1 className="font-heading text-2xl font-700">¡Gracias! Documentación reenviada</h1>
            <p className="text-muted-foreground mt-2">Hemos recibido tus datos corregidos. Revisaremos tu solicitud lo antes posible y te avisaremos por email.</p>
            <Button className="rounded-full mt-6" onClick={() => navigate("/")} data-testid="resubmit-home">Volver al inicio</Button>
          </motion.div>
        ) : !needsChanges ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <h1 className="font-heading text-xl font-700">Tu solicitud está en revisión</h1>
            <p className="text-muted-foreground mt-2">No necesitas hacer nada más por ahora. Te avisaremos por email.</p>
            <Button variant="outline" className="rounded-full mt-6" onClick={() => navigate("/")}>Volver al inicio</Button>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4 mb-6 flex gap-3" data-testid="reject-reason-banner">
              <AlertTriangle className="text-orange-600 shrink-0 mt-0.5" size={20} />
              <div>
                <p className="font-semibold text-orange-700">Necesitamos que corrijas algunos datos</p>
                <p className="text-sm text-orange-700/90 mt-0.5">
                  Motivo: {app.rejectLabel || "Documentación incompleta"}{app.rejectReason ? ` · ${app.rejectReason}` : ""}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm space-y-5">
              <div>
                <h2 className="font-heading font-600 mb-1">Vuelve a subir tu documentación</h2>
                <p className="text-sm text-muted-foreground">Asegúrate de que las fotos se ven nítidas, con buena luz y sin reflejos.</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <DocSlot label="Documento (anverso)" value={f.docFront} onFile={(e) => uploadDoc("docFront", e)} onClear={() => set("docFront", null)} testid="re-doc-front" />
                <DocSlot label="Documento (reverso)" value={f.docBack} onFile={(e) => uploadDoc("docBack", e)} onClear={() => set("docBack", null)} testid="re-doc-back" />
              </div>
              <div>
                <Label className="mb-2 block">Selfie de verificación</Label>
                <CameraCapture value={f.selfie} onChange={(v) => set("selfie", v)} testid="re-selfie" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border/60 pt-5">
                <div className="space-y-1.5"><Label>Teléfono de contacto</Label><Input data-testid="re-phone" value={f.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>IBAN</Label><Input data-testid="re-iban" value={f.iban} onChange={(e) => set("iban", e.target.value)} placeholder="ES.." /></div>
              </div>

              <Button className="w-full rounded-full gap-1.5" onClick={submit} disabled={saving} data-testid="resubmit-submit">
                {saving ? "Enviando…" : "Reenviar mi solicitud"} <ArrowRight size={16} />
              </Button>
              <p className="text-xs text-muted-foreground text-center">Solo se actualizarán los campos y fotos que modifiques.</p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Center({ children }) {
  return <div className="min-h-screen grid place-items-center bg-background">{children}</div>;
}

function DocSlot({ label, value, onFile, onClear, testid }) {
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      {value ? (
        <div className="rounded-xl border border-border overflow-hidden">
          <img src={value} alt={label} className="w-full h-36 object-cover" data-testid={`${testid}-preview`} />
          <div className="p-2 bg-card flex justify-between items-center">
            <span className="text-xs text-success flex items-center gap-1"><CheckCircle2 size={13} /> Subido</span>
            <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={onClear}>Quitar</button>
          </div>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center h-36 rounded-xl border-2 border-dashed border-border cursor-pointer hover:bg-muted transition-colors">
          <IdCard size={26} className="text-muted-foreground mb-2" />
          <span className="text-xs text-muted-foreground flex items-center gap-1"><Upload size={12} /> Subir imagen</span>
          <input type="file" accept="image/*" className="hidden" onChange={onFile} data-testid={`${testid}-input`} />
        </label>
      )}
    </div>
  );
}
