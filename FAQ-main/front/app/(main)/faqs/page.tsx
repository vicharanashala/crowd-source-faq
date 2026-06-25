"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { faqsApi } from "@/lib/api";
import FAQRow from "@/components/FAQRow";
import ExpandedPanel from "@/components/ExpandedPanel";
import PillsFilter from "@/components/PillsFilter";
import Footer from "@/components/Footer";
import AskAdminModal from "@/components/AskAdminModal";
import { FAQItem } from "@/components/FAQCard";
import { useSearch } from "@/lib/SearchContext";

function FAQsContent() {
  const searchParams = useSearchParams();
  const { searchQ, onSearch } = useSearch();
  const [activeCat, setActiveCat] = useState("all");
  const [openFaq, setOpenFaq] = useState<FAQItem | null>(null);
  const [showAskAdmin, setShowAskAdmin] = useState(false);

  // Pick up ?q= from URL (from hero search)
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !searchQ) onSearch(q);
  }, [searchParams, onSearch, searchQ]);

  const { data: allFaqs = [], isLoading } = useQuery<FAQItem[]>({
    queryKey: ["faqs"],
    queryFn: () => faqsApi.getAll().then((r) => r.data),
  });

  const handleOpen = useCallback((faq: FAQItem) => setOpenFaq(faq), []);
  const handleClose = useCallback(() => setOpenFaq(null), []);
  const handleCatChange = useCallback((cat: string) => setActiveCat(cat), []);

  const catSet = new Set(allFaqs.map((f) => f.category));
  const cats = [
    { val: "all", label: "All" },
    ...Array.from(catSet).map((c) => ({
      val: c,
      label: c.charAt(0).toUpperCase() + c.slice(1).toLowerCase(),
    })),
  ];

  const filtered = allFaqs.filter((faq) => {
    const catMatch = activeCat === "all" || faq.category === activeCat;
    const searchMatch =
      !searchQ.trim() ||
      faq.question.toLowerCase().includes(searchQ.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQ.toLowerCase());
    return catMatch && searchMatch;
  });

  const grouped = filtered.reduce<Record<string, FAQItem[]>>((acc, faq) => {
    const cat = faq.category || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(faq);
    return acc;
  }, {});

  return (
    <>
      {/* Page header */}
      <div style={{ paddingTop: 100, textAlign: "center", marginBottom: 8, position: "relative", zIndex: 2 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(36px,5vw,64px)", fontWeight: 300, color: "var(--ink)", letterSpacing: "-0.02em", marginBottom: 10 }}>
          Frequently Asked Questions
        </h1>
        <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, color: "var(--ink-soft)", maxWidth: 420, margin: "0 auto" }}>
          Everything you need to know about IIT Ropar
        </p>

        {/* Search input — hero-search-wrap style */}
        <div className="hero-search-wrap" style={{ margin: "24px auto 0" }}>
          <span className="hero-search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search questions…"
            value={searchQ}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>

      <PillsFilter cats={cats} activeCat={activeCat} onCatChange={handleCatChange} />

      <div className="content-wrap">
        {isLoading ? (
          <div className="empty-state">
            <div className="empty-icon">◎</div>
            <div className="empty-text">Loading FAQs…</div>
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◎</div>
            <div className="empty-text">No FAQs match your search.</div>
            {searchQ.trim() && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, color: "var(--ink-soft)" }}>
                  Couldn&apos;t find what you&apos;re looking for?
                </p>
                <button
                  onClick={() => setShowAskAdmin(true)}
                  className="apply-btn"
                  style={{ fontSize: 12 }}
                >
                  Ask Admin Directly →
                </button>
              </div>
            )}
          </div>
        ) : (
          Object.keys(grouped).map((cat) => (
            <FAQRow
              key={cat}
              catLabel={cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase()}
              faqs={grouped[cat]}
              onOpen={handleOpen}
            />
          ))
        )}
      </div>

      <Footer />
      <ExpandedPanel faq={openFaq} onClose={handleClose} />
      {showAskAdmin && (
        <AskAdminModal
          defaultQuestion={searchQ}
          source="faq_search"
          originalQuery={searchQ}
          onClose={() => setShowAskAdmin(false)}
        />
      )}
    </>
  );
}

export default function FAQsPage() {
  return (
    <Suspense fallback={
      <div className="empty-state" style={{ paddingTop: 120 }}>
        <div className="empty-icon">◎</div>
        <div className="empty-text">Loading…</div>
      </div>
    }>
      <FAQsContent />
    </Suspense>
  );
}
