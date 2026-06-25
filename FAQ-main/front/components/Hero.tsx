"use client";
import { useQuery } from "@tanstack/react-query";
import { faqsApi, postsApi } from "@/lib/api";
import { useRouter } from "next/navigation";

interface HeroProps {
  searchQ: string;
  onSearch: (val: string) => void;
}

export default function Hero({ searchQ, onSearch }: HeroProps) {
  const router = useRouter();

  // Real stats from backend
  const { data: faqs = [] } = useQuery<unknown[]>({
    queryKey: ["faqs"],
    queryFn: () => faqsApi.getAll().then((r) => r.data),
  });
  const { data: posts = [] } = useQuery<unknown[]>({
    queryKey: ["posts", "all"],
    queryFn: () => postsApi.getAll().then((r) => r.data),
  });

  // Derive category count from FAQs
  const catCount = new Set((faqs as Array<{ category: string }>).map((f) => f.category)).size || "—";
  const faqCount = faqs.length || "—";
  const postCount = posts.length || "—";

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQ.trim()) router.push(`/faqs?q=${encodeURIComponent(searchQ.trim())}`);
  };

  return (
    <section className="hero">
      <div className="hero-bg" />
      <div className="hero-grid" />
      <div className="hero-aurora" />

      <div className="hero-content">
        {/* Badge with live pulsing dot */}
        <div className="hero-badge">
          <div className="badge-live" />
          Community Knowledge · IIT Ropar
        </div>

        {/* Serif headline — second line has shimmering italic */}
        <h1>
          Ask, Explore,<br />
          <em>Understand.</em>
        </h1>

        <p className="hero-sub">
          Everything you need to know about IIT Ropar — campus life, academics,
          hostels, research — answered by the community and powered by AI.
        </p>

        {/* CTAs — primary with shine sweep, secondary ghost */}
        <div className="hero-ctas">
          <button className="cta-primary" onClick={() => router.push("/faqs")}>
            <span>▶</span> Explore FAQs
          </button>
          <button className="cta-secondary" onClick={() => router.push("/ask")}>
            ✦ Ask a Question
          </button>
        </div>

        {/* Hero search — distinct style from navbar search */}
        <form className="hero-search-wrap" onSubmit={handleHeroSearch}>
          <span className="hero-search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search any question…"
            autoComplete="off"
            value={searchQ}
            onChange={(e) => onSearch(e.target.value)}
          />
        </form>

        {/* Four-stat meta row — real backend counts */}
        <div className="hero-meta">
          <div className="hero-meta-item">
            <span className="meta-val">{faqCount}</span>
            <span className="meta-label">FAQs</span>
          </div>
          <div className="hero-meta-item">
            <span className="meta-val">{postCount}</span>
            <span className="meta-label">Discussions</span>
          </div>
          <div className="hero-meta-item">
            <span className="meta-val">{catCount}</span>
            <span className="meta-label">Categories</span>
          </div>
          <div className="hero-meta-item">
            <span className="meta-val">AI</span>
            <span className="meta-label">Powered</span>
          </div>
        </div>
      </div>

      {/* Scroll hint */}
      <div className="scroll-hint">
        <span>SCROLL</span>
        <div className="scroll-line" />
      </div>
    </section>
  );
}
