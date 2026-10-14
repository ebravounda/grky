import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import api, { API, apiErr } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useOwnSeo, BlogShell, fmtDate } from "@/components/BlogShell";
import { ArrowLeft, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const track = (type, article_id) => api.post("/blog/track", { type, article_id }).catch(() => {});

const LeadForm = ({ articleId }) => {
  const [f, setF] = useState({ name: "", email: "", message: "" });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    try { await api.post("/blog/lead", { ...f, article_id: articleId }); setDone(true); }
    catch (err) { toast.error(apiErr(err)); } finally { setSending(false); }
  };
  if (done) return <p className="flex items-center gap-2 text-emerald-700 font-semibold" data-testid="blog-lead-success"><CheckCircle2 size={18} /> ¡Gracias! Te contactaremos pronto</p>;
  return (
    <form onSubmit={submit} className="grid gap-3" data-testid="blog-lead-form">
      <div className="grid sm:grid-cols-2 gap-3">
        <Input required placeholder="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="blog-lead-name" />
        <Input required type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="blog-lead-email" />
      </div>
      <Textarea required rows={4} placeholder="¿En qué podemos ayudarte?" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} data-testid="blog-lead-message" />
      <Button type="submit" disabled={sending} className="justify-self-start rounded-full bg-[#015EEF] hover:bg-[#014fcc] gap-2 px-6" data-testid="blog-lead-submit">
        <Send size={15} /> {sending ? "Enviando…" : "Enviar"}
      </Button>
    </form>
  );
};

export default function BlogArticle() {
  const { slug } = useParams();
  const [a, setA] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const bodyRef = useRef(null);
  useOwnSeo();

  useEffect(() => {
    setA(null); setNotFound(false);
    api.get(`/blog/articles/${encodeURIComponent(slug)}`).then((r) => { setA(r.data); track("view", r.data.id); })
      .catch(() => setNotFound(true));
  }, [slug]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !a) return;
    const onClick = (e) => { const t = e.target.closest("[data-track]"); if (t) track(t.getAttribute("data-track"), a.id); };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [a]);

  if (notFound) return (
    <BlogShell>
      <div className="max-w-3xl mx-auto px-6 text-center py-20" data-testid="blog-not-found">
        <h1 className="font-heading text-4xl font-bold mb-4">Artículo no encontrado</h1>
        <Link to="/blog" className="inline-flex items-center gap-2 text-[#015EEF] font-semibold hover:underline" data-testid="blog-not-found-back"><ArrowLeft size={16} /> Volver al blog</Link>
      </div>
    </BlogShell>
  );
  if (!a) return <BlogShell><div className="max-w-3xl mx-auto px-6"><div className="h-96 rounded-3xl bg-white animate-pulse" /></div></BlogShell>;

  const author = a.author || {};
  const desc = a.meta_description || a.excerpt || "";
  return (
    <BlogShell>
      <Helmet>
        <title>{a.meta_title || a.title}</title>
        <meta name="description" content={desc} />
        <link rel="canonical" href={`https://goroky.com/blog/${a.slug || slug}`} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={a.meta_title || a.title} />
        <meta property="og:description" content={desc} />
        {a.cover_url && <meta property="og:image" content={a.cover_url} />}
        <link rel="stylesheet" href={`${API}/blog/styles.css`} />
        {a.jsonld && <script type="application/ld+json">{JSON.stringify(a.jsonld)}</script>}
      </Helmet>
      <article className="max-w-3xl mx-auto px-6" data-testid="blog-article">
        <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#015EEF] mb-6" data-testid="blog-article-back"><ArrowLeft size={14} /> Blog</Link>
        <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight leading-tight" data-testid="blog-article-title">{a.title}</h1>
        <div className="mt-5 flex items-center gap-3 text-sm text-slate-500" data-testid="blog-article-meta">
          {author.photo_url && <img src={author.photo_url} alt={author.name} className="h-9 w-9 rounded-full object-cover" />}
          <span className="font-semibold text-slate-700">{author.name}</span>
          {author.name && <span>·</span>}
          <time dateTime={a.published_at}>{fmtDate(a.published_at)}</time>
        </div>
        {a.cover_url && <img src={a.cover_url} alt={a.title} className="mt-8 w-full rounded-3xl object-cover aspect-[16/9]" data-testid="blog-article-cover" />}
        <div ref={bodyRef} className="mseo-root mt-10" data-testid="blog-article-body" dangerouslySetInnerHTML={{ __html: a.html || "" }} />

        {(author.name || author.bio) && (
          <aside className="mt-14 rounded-3xl bg-white ring-1 ring-black/5 p-6 flex gap-5" data-testid="blog-author-box">
            {author.photo_url && <img src={author.photo_url} alt={author.name} className="h-16 w-16 rounded-full object-cover shrink-0" />}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#FF7A00]">Sobre el autor</p>
              <p className="font-heading font-bold text-lg mt-1">{author.name}</p>
              {author.credentials && <p className="text-sm text-slate-500">{author.credentials}</p>}
              {author.bio && <p className="text-sm text-slate-600 mt-2">{author.bio}</p>}
            </div>
          </aside>
        )}

        <section className="mt-10 rounded-3xl bg-[#05070D] text-white p-8">
          <h2 className="font-heading text-2xl font-bold mb-1">¿Hablamos?</h2>
          <p className="text-slate-400 text-sm mb-6">Déjanos tus datos y te asesoramos sin compromiso.</p>
          <div className="[&_input]:bg-white [&_input]:text-slate-900 [&_textarea]:bg-white [&_textarea]:text-slate-900"><LeadForm articleId={a.id} /></div>
        </section>
      </article>
    </BlogShell>
  );
}
