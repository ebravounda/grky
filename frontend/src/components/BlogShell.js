import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const LOGO = "https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png";

const SEO_SEL = 'meta[name="description"],link[rel="canonical"],meta[property^="og:"],meta[name^="twitter:"]';

export const useOwnSeo = () => {
  useEffect(() => {
    const removed = [...document.head.querySelectorAll(SEO_SEL)].filter((el) => !el.hasAttribute("data-rh"));
    removed.forEach((el) => el.remove());
    return () => removed.forEach((el) => document.head.appendChild(el));
  }, []);
};

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "");

export const BlogShell = ({ children }) => (
  <div className="min-h-screen bg-[#F7F9FC] text-slate-900 font-body">
    <header className="fixed top-3 inset-x-3 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 rounded-full backdrop-blur-xl bg-white/80 ring-1 ring-black/5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] flex items-center justify-between">
        <Link to="/" data-testid="blog-header-home"><img src={LOGO} alt="GoRoky" className="h-8 w-auto" /></Link>
        <nav className="flex items-center gap-5 text-sm font-bold">
          <Link to="/blog" data-testid="blog-header-blog" className="text-slate-800 hover:text-[#015EEF] transition-colors">Blog</Link>
          <Link to="/" data-testid="blog-header-back" className="hidden sm:inline-flex items-center gap-1.5 text-slate-800 hover:text-[#015EEF] transition-colors"><ArrowLeft size={15} /> Tarifas</Link>
          <Link to="/login" data-testid="blog-header-login" className="rounded-full border-2 border-[#015EEF] text-[#015EEF] hover:bg-[#015EEF] hover:text-white px-5 py-2 transition-colors">Mi cuenta</Link>
        </nav>
      </div>
    </header>
    <main className="pt-28 pb-20">{children}</main>
    <footer className="bg-[#05070D] text-slate-400 text-sm">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-wrap items-center justify-between gap-4">
        <span>© {new Date().getFullYear()} GoRoky · RokyMovil</span>
        <div className="flex gap-6">
          <Link to="/" className="hover:text-white">Inicio</Link>
          <Link to="/blog" className="hover:text-white" data-testid="blog-footer-blog">Blog</Link>
          <Link to="/privacidad" className="hover:text-white">Privacidad</Link>
        </div>
      </div>
    </footer>
  </div>
);

export const ArticleCard = ({ a, i = 0 }) => (
  <Link to={`/blog/${a.slug}`} data-testid={`blog-card-${a.slug}`}
    className="group flex flex-col rounded-3xl bg-white ring-1 ring-black/5 overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(1,94,239,0.12)] transition-[transform,box-shadow] duration-300"
    style={{ animationDelay: `${i * 60}ms` }}>
    <div className="aspect-[16/9] bg-slate-100 overflow-hidden">
      {a.cover_url && <img src={a.cover_url} alt={a.title} loading="lazy" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />}
    </div>
    <div className="flex flex-col gap-2 p-6 flex-1">
      {a.cluster && <span className="text-[11px] font-bold uppercase tracking-wider text-[#FF7A00]">{a.cluster}</span>}
      <h3 className="font-heading text-lg font-bold leading-snug group-hover:text-[#015EEF] transition-colors">{a.title}</h3>
      {a.excerpt && <p className="text-sm text-slate-600 line-clamp-3">{a.excerpt}</p>}
      <span className="mt-auto pt-3 text-xs text-slate-400">{fmtDate(a.published_at)}</span>
    </div>
  </Link>
);
