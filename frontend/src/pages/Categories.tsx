import { Link, useParams } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { QuestionCard } from "@/components/QuestionCard";
import { categories, questions, categoryBySlug } from "@/lib/mockData";
import { ArrowUpRight, MessageSquare, Eye } from "lucide-react";

export default function Categories() {
  const { slug } = useParams();
  const active = slug ? categoryBySlug(slug) : null;

  if (active) {
    const list = questions.filter((q) => q.category === active.slug);
    return (
      <PageShell>
        <section className="border-b border-brand-line">
          <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-12 md:py-16">
            <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-brand-body mb-6">
              <Link to="/categories" className="hover:text-brand-ink">Categories</Link>
              <span>/</span>
              <span className="text-brand-mute">{active.name}</span>
            </div>
            <p className="label-eyebrow mb-3">Category № {String(categories.indexOf(active) + 1).padStart(2, '0')}</p>
            <h1 className="font-serif text-6xl md:text-7xl text-brand-ink leading-none tracking-tight">{active.name}.</h1>
            <p className="text-brand-body text-lg max-w-2xl mt-5">{active.description}</p>
            <div className="flex gap-8 mt-8">
              <Stat label="Questions" value={active.count.toLocaleString()} />
              <Stat label="In feed" value={list.length} />
              <Stat label="Top tags" value={active.top.length} />
            </div>
          </div>
        </section>
        <section className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-10">
          <div className="border border-brand-line">
            {list.length > 0 ? list.map((q) => <QuestionCard key={q.id} q={q} />) : (
              <div className="p-12 text-center">
                <p className="font-serif text-2xl">No questions in this slice yet.</p>
                <Link to="/ask" className="inline-block mt-4 bg-brand-ink text-brand-paper px-5 py-2.5 text-sm">Ask the first</Link>
              </div>
            )}
          </div>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="border-b border-brand-line">
        <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-12 md:py-16">
          <p className="label-eyebrow mb-3">All categories — {categories.length} sections</p>
          <h1 className="font-serif text-5xl md:text-7xl text-brand-ink leading-none tracking-tight">Browse the<br /><em className="italic text-brand-vermilion">stacks</em>.</h1>
          <p className="text-brand-body text-lg max-w-2xl mt-5">Every question lives in a category curated by editors and contributors. Pick a section to wander.</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-10 md:py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-brand-line border border-brand-line" data-testid="categories-grid">
          {categories.map((c, i) => (
            <Link
              key={c.slug}
              to={`/categories/${c.slug}`}
              className="bg-white p-8 group hover:bg-[#F9F9F8] transition-colors relative"
              data-testid={`category-card-${c.slug}`}
            >
              <div className="flex items-start justify-between mb-6">
                <span className="font-sans font-medium text-xl text-brand-mute">{String(i + 1).padStart(2, '0')}</span>
                <ArrowUpRight size={18} className="text-brand-mute group-hover:text-brand-ink transition-colors" />
              </div>
              <h3 className="font-serif text-3xl md:text-4xl text-brand-ink leading-none mb-3 tracking-tight">{c.name}</h3>
              <p className="text-brand-body text-sm leading-relaxed mb-6">{c.description}</p>
              <div className="flex items-center gap-3 mb-5 text-xs">
                <span className="flex items-center gap-1.5 text-brand-body"><MessageSquare size={12} /> {c.count.toLocaleString()} questions</span>
                <span className="text-brand-mute">·</span>
                <span className="flex items-center gap-1.5 text-brand-body"><Eye size={12} /> {(c.count * 12).toLocaleString()} views</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-4 border-t border-brand-line">
                {c.top.map((t) => (
                  <span key={t} className="text-[10px] uppercase tracking-widest text-brand-body bg-brand-paper border border-brand-line px-2 py-1">#{t}</span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}

const Stat = ({ label, value }) => (
  <div>
    <p className="font-sans font-semibold text-4xl text-brand-ink leading-none">{value}</p>
    <p className="label-eyebrow mt-2">{label}</p>
  </div>
);
