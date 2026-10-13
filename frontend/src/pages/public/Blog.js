import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import api from "@/lib/api";
import { BlogShell, ArticleCard } from "@/components/BlogShell";

export default function Blog() {
  const [items, setItems] = useState(null);
  useEffect(() => { api.get("/blog/articles").then((r) => setItems(Array.isArray(r.data) ? r.data : [])).catch(() => setItems([])); }, []);

  return (
    <BlogShell>
      <Helmet>
        <title>Blog de Goroky</title>
        <meta name="description" content="Consejos, guías y novedades sobre móvil, fibra y ahorro en telecomunicaciones." />
        <link rel="canonical" href="https://goroky.com/blog" />
      </Helmet>
      <section className="max-w-6xl mx-auto px-6" data-testid="blog-page">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF7A00] mb-3">Blog</p>
        <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-12">Blog de <span className="text-[#015EEF]">Goroky</span></h1>
        {items === null && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-80 rounded-3xl bg-white ring-1 ring-black/5 animate-pulse" />)}</div>
        )}
        {items && items.length === 0 && (
          <div className="rounded-3xl bg-white ring-1 ring-black/5 p-12 text-center text-slate-500" data-testid="blog-empty">Pronto publicaremos artículos</div>
        )}
        {items && items.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="blog-grid">
            {items.map((a, i) => <ArticleCard key={a.id || a.slug} a={a} i={i} />)}
          </div>
        )}
      </section>
    </BlogShell>
  );
}
