import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { ArticleCard } from "@/components/BlogShell";
import { ArrowUpRight } from "lucide-react";

export default function LatestArticles() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/blog/articles").then((r) => setItems(Array.isArray(r.data) ? r.data.slice(0, 3) : [])).catch(() => setItems([])); }, []);
  if (!items.length) return null;
  return (
    <section className="py-20 bg-[#F7F9FC]" data-testid="home-latest-articles">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF7A00] mb-2">Blog</p>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">Últimos artículos</h2>
          </div>
          <Link to="/blog" className="inline-flex items-center gap-1.5 font-bold text-[#015EEF] hover:underline" data-testid="home-blog-all-link">Ver todo el blog <ArrowUpRight size={16} /></Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{items.map((a, i) => <ArticleCard key={a.id || a.slug} a={a} i={i} />)}</div>
      </div>
    </section>
  );
}
