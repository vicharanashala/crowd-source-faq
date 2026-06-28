import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { QuestionCard } from "@/components/QuestionCard";
import { categories, users } from "@/lib/mockData";
import { Flame, ArrowRight, Sparkles, TrendingUp, ShieldCheck, Loader2 } from "lucide-react";
import api from "@/lib/api";

const filters = [
  { key: "latest", label: "Latest" },
  { key: "trending", label: "Trending" },
  { key: "verified", label: "Verified" },
  { key: "unanswered", label: "Open" },
];

export default function Home() {
  const [active, setActive] = useState("latest");
  const [questionsList, setQuestionsList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQuestions = async () => {
      setLoading(true);
      try {
        const params: any = {};
        if (active === "latest") {
          params.sort = "latest";
        } else if (active === "trending") {
          params.sort = "popular";
        } else if (active === "verified") {
          params.status = "verified";
        } else if (active === "unanswered") {
          params.sort = "unanswered";
        }

        const res = await api.get("/questions", { params });
        if (res.data.success && res.data.data.questions) {
          setQuestionsList(res.data.data.questions);
        }
      } catch (err) {
        console.error("Failed to fetch questions:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchQuestions();
  }, [active]);

  return (
    <PageShell>
      <section className="border-b border-brand-line bg-brand-paper" data-testid="home-hero">
        <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-12 md:py-20">
          <div className="grid lg:grid-cols-12 gap-10 items-end">
            <div className="lg:col-span-8">
              <p className="label-eyebrow mb-6 flex items-center gap-2"><Sparkles size={11} /> Vol. 01 — The Curious Edition</p>
              <h1 className="font-serif text-5xl md:text-7xl lg:text-[88px] text-brand-ink leading-[0.95] tracking-tight">
                A library of <em className="italic text-brand-vermilion">verified</em><br />
                answers, written by<br />
                the people who know.
              </h1>
              <p className="text-brand-body text-base md:text-lg max-w-xl mt-8 leading-relaxed">
                CrowdSource FAQ is a community knowledge base where repetitive questions go to die. Ask once, answer once, find it forever.
              </p>
              <div className="flex flex-wrap gap-3 mt-8">
                <Link to="/ask" className="bg-brand-ink text-brand-paper px-6 py-3.5 text-sm tracking-wide hover:bg-brand-blue transition-colors inline-flex items-center gap-2" data-testid="hero-ask-btn">
                  Ask a question <ArrowRight size={14} />
                </Link>
                <Link to="/categories" className="border border-brand-line text-brand-ink px-6 py-3.5 text-sm tracking-wide hover:border-brand-ink transition-colors" data-testid="hero-browse-btn">
                  Browse 9 categories
                </Link>
              </div>
            </div>
            <div className="lg:col-span-4 grid grid-cols-3 lg:grid-cols-1 gap-px bg-brand-line border border-brand-line">
              {[
                { k: "Questions", v: "4,126" },
                { k: "Verified", v: "2,019" },
                { k: "Contributors", v: "2,310" },
              ].map((s) => (
                <div key={s.k} className="bg-white px-6 py-5">
                  <p className="font-sans font-semibold text-3xl md:text-4xl text-brand-ink leading-none">{s.v}</p>
                  <p className="label-eyebrow mt-2">{s.k}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-10 lg:py-14 grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-brand-line pb-4 mb-2">
            <div>
              <p className="label-eyebrow mb-2 flex items-center gap-2"><Flame size={11} /> Feed</p>
              <h2 className="font-serif text-3xl md:text-4xl text-brand-ink tracking-tight">{active === 'latest' ? 'Latest questions' : `${filters.find(f=>f.key===active).label} questions`}</h2>
            </div>
            <div className="flex gap-1" data-testid="feed-filters">
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setActive(f.key)}
                  className={`px-3 py-2 text-xs uppercase tracking-widest transition-colors ${active === f.key ? 'bg-brand-ink text-brand-paper' : 'text-brand-body hover:text-brand-ink'}`}
                  data-testid={`filter-${f.key}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-x border-b border-brand-line min-h-[200px] relative">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-brand-mute gap-3">
                <Loader2 className="animate-spin" size={24} />
                <p className="text-sm font-semibold uppercase tracking-wider">Loading live feed...</p>
              </div>
            ) : (
              <>
                {questionsList.map((q) => <QuestionCard key={q._id || q.id} q={q} />)}
                {questionsList.length === 0 && (
                  <div className="p-12 text-center" data-testid="feed-empty">
                    <p className="font-serif text-2xl text-brand-ink mb-2">Nothing here yet.</p>
                    <p className="text-brand-body text-sm">Be the first to ask a question in this slice.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <aside className="lg:col-span-4 space-y-10">
          <div className="border border-brand-line bg-white p-6">
            <p className="label-eyebrow mb-4 flex items-center gap-2"><TrendingUp size={11} /> Trending topics</p>
            <ul className="divide-y divide-brand-line">
              {categories.slice(0, 6).map((c, i) => (
                <li key={c.slug}>
                  <Link to={`/categories/${c.slug}`} className="flex items-center justify-between py-3 hover:text-brand-blue transition-colors" data-testid={`trending-${c.slug}`}>
                    <span className="flex items-center gap-3">
                      <span className="font-sans font-medium text-brand-mute text-sm w-5">{String(i + 1).padStart(2, '0')}</span>
                      <span className="text-sm text-brand-ink">{c.name}</span>
                    </span>
                    <span className="text-xs text-brand-mute tabular-nums">{c.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="border border-brand-line bg-white p-6">
            <p className="label-eyebrow mb-4 flex items-center gap-2"><ShieldCheck size={11} /> Top contributors</p>
            <ul className="space-y-4">
              {users.slice(0, 4).map((u, i) => (
                <li key={u.id} className="flex items-center gap-3">
                  <span className="font-sans font-medium text-brand-mute text-sm w-5">{String(i + 1).padStart(2, '0')}</span>
                  <img src={u.avatar} alt={u.name} className="w-9 h-9 object-cover rounded-full" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-brand-ink truncate">{u.name}</p>
                    <p className="text-[10px] uppercase tracking-widest text-brand-mute">{u.title}</p>
                  </div>
                  <span className="font-sans font-semibold text-base text-brand-ink tabular-nums">{(u.reputation/1000).toFixed(1)}k</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border border-brand-ink bg-brand-ink text-brand-paper p-6">
            <p className="label-eyebrow mb-4 text-brand-paper/60">Curators Note</p>
            <p className="font-serif text-2xl leading-tight mb-4 italic">
              "The best answer is the one written before the second person had to ask."
            </p>
            <p className="text-xs uppercase tracking-widest text-brand-paper/60">— Editorial Board</p>
          </div>
        </aside>
      </section>
    </PageShell>
  );
}
