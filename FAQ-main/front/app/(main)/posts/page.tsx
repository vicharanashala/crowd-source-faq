"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { postsApi } from "@/lib/api";
import PostCard from "@/components/PostCard";
import Footer from "@/components/Footer";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import { CATEGORIES } from "@/lib/utils";

interface Post {
  _id: string; id: string; title: string; intro: string; description: string;
  category: string; author: { name: string; title: string; avatar: string };
  timestamp: string; upvotes: number; commentsCount: number; views: string;
  voted?: "up" | "down" | null; bookmarked?: boolean; createdAt?: string;
}

const SORTS = [
  { key: "hot", label: "Hot" },
  { key: "new", label: "New" },
  { key: "views", label: "Top Viewed" },
];

export default function PostsPage() {
  const user = useAuthStore((s) => s.user);
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("hot");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [myQ, setMyQ] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  const qk = ["posts", category, sort, debounced, myQ, bookmarked];
  const { data: posts = [], isLoading } = useQuery<Post[]>({
    queryKey: qk,
    queryFn: () =>
      postsApi.getAll({
        category: category !== "All" ? category : undefined,
        sort, search: debounced || undefined,
        myQuestions: myQ || undefined,
        bookmarked: bookmarked || undefined,
      }).then((r) => r.data),
  });

  const handleSearchChange = (v: string) => {
    setSearch(v);
    clearTimeout((window as { _st?: ReturnType<typeof setTimeout> })._st);
    (window as { _st?: ReturnType<typeof setTimeout> })._st = setTimeout(() => setDebounced(v), 300);
  };

  const cats = ["All", ...CATEGORIES.filter((c) => c !== "All")];

  return (
    <>
      <div style={{ paddingTop: 100, position: "relative", zIndex: 2 }}>
        {/* Header */}
        <div className="row-header" style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(28px,4vw,48px)", fontWeight: 300, color: "var(--ink)", letterSpacing: "-0.02em" }}>
            Community Discussions
          </h1>
          <Link href="/ask" className="apply-btn" style={{ textDecoration: "none" }}>
            + Ask →
          </Link>
        </div>

        {/* Search */}
        <div style={{ padding: "0 80px", marginBottom: 16 }}>
          <div className="nav-search-wrap" style={{ maxWidth: 360 }}>
            <span className="nav-search-icon">⌕</span>
            <input
              type="text" value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search discussions…"
            />
          </div>
        </div>

        {/* Category pills */}
        <div className="pills-section" style={{ paddingTop: 0 }}>
          <div className="pills-row">
            {cats.map((c) => (
              <button key={c} className={`pill${category === c ? " active" : ""}`}
                onClick={() => setCategory(c)}>
                {c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {/* Sort + personal filters */}
          <div className="pills-row" style={{ marginTop: 10 }}>
            {SORTS.map((s) => (
              <button key={s.key} className={`pill${sort === s.key ? " active" : ""}`}
                onClick={() => setSort(s.key)} style={{ fontSize: 11 }}>
                {s.label}
              </button>
            ))}
            {user && (
              <>
                <button className={`pill${myQ ? " active" : ""}`}
                  onClick={() => setMyQ((v) => !v)} style={{ fontSize: 11 }}>
                  My Questions
                </button>
                <button className={`pill${bookmarked ? " active" : ""}`}
                  onClick={() => setBookmarked((v) => !v)} style={{ fontSize: 11 }}>
                  Bookmarked
                </button>
              </>
            )}
          </div>
        </div>

        {/* Posts grid */}
        <div style={{ padding: "8px 80px 80px" }}>
          {isLoading ? (
            <div className="empty-state">
              <div className="empty-text">Loading…</div>
            </div>
          ) : posts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">◎</div>
              <div className="empty-text">
                No posts found.{" "}
                <Link href="/ask" style={{ color: "var(--sky)" }}>
                  Be the first to ask!
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {posts.map((post) => (
                <PostCard key={post._id || post.id} post={post} queryKey={qk} />
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}
