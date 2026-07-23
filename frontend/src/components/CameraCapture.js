import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, Upload, Check } from "lucide-react";
import { resizeImage } from "@/lib/img";

export default function CameraCapture({ value, onChange, testid = "selfie" }) {
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const [err, setErr] = useState(false);

  const startCam = async () => {
    setErr(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setActive(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); } }, 100);
    } catch (e) { setErr(true); }
  };
  const stopCam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null; setActive(false);
  };
  const capture = async () => {
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const data = await resizeImage(canvas.toDataURL("image/jpeg", 0.9), 900, 0.75);
    onChange(data); stopCam();
  };
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (f) onChange(await resizeImage(f, 900, 0.75));
  };

  if (value) {
    return (
      <div className="rounded-lg border border-border overflow-hidden bg-muted">
        <img src={value} alt="Selfie" className="w-full h-52 object-cover" data-testid={`${testid}-preview`} />
        <div className="p-2 flex items-center justify-between bg-card">
          <span className="flex items-center gap-1.5 text-sm text-success"><Check size={15} /> Capturada</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} data-testid={`${testid}-retake`}>Repetir</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-muted">
      {active ? (
        <>
          <video ref={videoRef} className="w-full h-52 object-cover bg-black" muted playsInline />
          <div className="p-2 flex gap-2 bg-card">
            <Button type="button" className="flex-1 gap-1.5 rounded-full" onClick={capture} data-testid={`${testid}-capture-btn`}><Camera size={15} /> Capturar</Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={stopCam}>Cancelar</Button>
          </div>
        </>
      ) : (
        <div className="p-6 text-center">
          <Camera size={32} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-4">Hazte una selfie para verificar tu identidad.</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button type="button" className="rounded-full gap-1.5" onClick={startCam} data-testid={`${testid}-start-btn`}><Camera size={15} /> Abrir cámara</Button>
            <Button type="button" variant="outline" className="rounded-full gap-1.5" onClick={() => fileRef.current?.click()} data-testid={`${testid}-upload-btn`}><Upload size={15} /> Subir foto</Button>
          </div>
          {err && <p className="text-xs text-warning mt-3">No se pudo acceder a la cámara. Sube una foto en su lugar.</p>}
          <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFile} data-testid={`${testid}-file-input`} />
        </div>
      )}
    </div>
  );
}
