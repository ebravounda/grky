import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { ArrowLeft } from "lucide-react";

const LOGO = "https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png";

export default function LegalPage({ type }) {
  const [content, setContent] = useState(null);
  useEffect(() => {
    api.get("/public/site-content").then((r) => setContent(r.data)).catch(() => setContent({}));
  }, []);

  const legal = (content && content.legal) || {};
  const text = type === "terms" ? legal.terms : legal.privacy;
  const title = type === "terms" ? "Términos y condiciones" : "Política de privacidad";
  const lines = (text || "").split("\n");
  const heading = lines[0] || title;
  const body = lines.slice(1).join("\n").trim();

  return (
    <div className="min-h-screen bg-white text-[#0A0A0A] font-body" data-testid="legal-page">
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-white/70 border-b border-black/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center" data-testid="legal-logo"><img src={LOGO} alt="GoRoky" className="h-9 w-auto" /></Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-700 hover:text-[#015EEF] transition-colors" data-testid="legal-back">
            <ArrowLeft size={16} /> Volver
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-32 pb-24">
        <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tight mb-8" data-testid="legal-title">{heading}</h1>
        {content === null ? (
          <div className="h-8 w-8 rounded-full border-2 border-[#015EEF] border-t-transparent animate-spin" />
        ) : (
          <div className="whitespace-pre-line text-slate-700 leading-relaxed text-[15px]" data-testid="legal-body">
            {body || "Contenido no disponible."}
          </div>
        )}
      </main>

      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-500">
        GoRoky · RokyMovil · Tramilex
      </footer>
    </div>
  );
}
