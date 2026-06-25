"use client";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import Hero from "@/components/Hero";
import PillsFilter from "@/components/PillsFilter";
import FAQRow from "@/components/FAQRow";
import ExpandedPanel from "@/components/ExpandedPanel";
import Footer from "@/components/Footer";
import { faqsApi, postsApi } from "@/lib/api";
import { FAQItem } from "@/components/FAQCard";
import { useSearch } from "@/lib/SearchContext";
import PostCard from "@/components/PostCard";
import Link from "next/link";

interface Post {
  _id: string; id: string; title: string; intro: string; description: string;
  category: string; author: { name: string; title: string; avatar: string };
  timestamp: string; upvotes: number; commentsCount: number; views: string;
  voted?: "up" | "down" | null; bookmarked?: boolean; createdAt?: string;
}

export default function HomePage() {
  const { searchQ, onSearch } = useSearch();
  const [activeCat, setActiveCat] = useState("all");
  const [openFaq, setOpenFaq] = useState<FAQItem | null>(null);

  const handleOpen = useCallback((faq: FAQItem) => setOpenFaq(faq), []);
  const handleClose = useCallback(() => setOpenFaq(null), []);
  const handleCatChange = useCallback((cat: string) => setActiveCat(cat), []);

  const { data: allFaqs = [] } = useQuery<FAQItem[]>({
    queryKey: ["faqs"],
    queryFn: () => faqsApi.getAll().then((r) => r.data),
  });

  const { data: posts = [] } = useQuery<Post[]>({
    queryKey: ["posts", "home"],
    queryFn: () => postsApi.getAll({ sort: "hot" }).then((r) => r.data.slice(0, 6)),
  });

  // Build category list for PillsFilter
  const catSet = new Set(allFaqs.map((f) => f.category));
  const cats = [
    { val: "all", label: "All" },
    ...Array.from(catSet).map((c) => ({ val: c, label: c.charAt(0).toUpperCase() + c.slice(1).toLowerCase() })),
  ];

  // Filter + search FAQs
  const filtered = allFaqs.filter((faq) => {
    const catMatch = activeCat === "all" || faq.category === activeCat;
    const searchMatch = !searchQ.trim() ||
      faq.question.toLowerCase().includes(searchQ.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQ.toLowerCase());
    return catMatch && searchMatch;
  });

  // Group by category for rows
  const grouped = filtered.reduce<Record<string, FAQItem[]>>((acc, faq) => {
    const cat = faq.category || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(faq);
    return acc;
  }, {});

  const rowCategories = Object.keys(grouped);

  return (
    <>
      <Hero searchQ={searchQ} onSearch={onSearch} />

      <PillsFilter cats={cats} activeCat={activeCat} onCatChange={handleCatChange} />

      {/* FAQ rows — one per category */}
      <div className="content-wrap">
        {rowCategories.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◎</div>
            <div className="empty-text">No FAQs match your search.</div>
          </div>
        ) : (
          rowCategories.map((cat) => (
            <FAQRow
              key={cat}
              catLabel={cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase()}
              faqs={grouped[cat]}
              onOpen={handleOpen}
            />
          ))
        )}

        {/* Community posts section */}
        {posts.length > 0 && (
          <div style={{ padding: "0 80px 0", marginBottom: 56 }}>
            <div className="row-header" style={{ padding: 0, marginBottom: 20 }}>
              <span className="row-title">Community Discussions</span>
              <Link
                href="/posts"
                style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: "var(--sky)", letterSpacing: "0.08em", textDecoration: "none",
                }}
              >
                View all →
              </Link>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: 16,
              }}
            >
              {posts.map((post) => (
                <PostCard key={post._id || post.id} post={post} />
              ))}
            </div>
          </div>
        )}
      </div>

      <Footer />

      {/* Expanded panel — same as reference ExpandedPanel */}
      <ExpandedPanel faq={openFaq} onClose={handleClose} />
    </>
  );
}
