"use client";
import { useQuery } from "@tanstack/react-query";
import { postsApi } from "@/lib/api";
import PostCard from "@/components/PostCard";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";
import Footer from "@/components/Footer";

interface Post { _id: string; id: string; title: string; intro: string; description: string; category: string; author: { name: string; title: string; avatar: string }; timestamp: string; upvotes: number; commentsCount: number; views: string; voted?: "up" | "down" | null; bookmarked?: boolean; createdAt?: string; }

export default function BookmarksPage() {
  const user = useAuthStore((s) => s.user);
  const { data: posts = [], isLoading } = useQuery<Post[]>({
    queryKey: ["posts", "bookmarked"],
    queryFn: () => postsApi.getAll({ bookmarked: true }).then((r) => r.data),
    enabled: !!user,
  });

  if (!user) return (
    <>
      <div className="empty-state" style={{ paddingTop: 120 }}>
        <div className="empty-icon">♡</div>
        <div className="empty-text"><Link href="/login" style={{ color: "var(--sky)" }}>Sign in</Link> to view bookmarks.</div>
      </div>
      <Footer />
    </>
  );

  return (
    <>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "100px 80px 80px", position: "relative", zIndex: 2 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(28px,4vw,52px)", fontWeight: 300, color: "var(--ink)", letterSpacing: "-0.02em", marginBottom: 32 }}>
          Your Bookmarks
        </h1>

        {isLoading ? (
          <div className="empty-state" style={{ padding: "40px 0" }}><div className="empty-text">Loading…</div></div>
        ) : posts.length === 0 ? (
          <div className="empty-state" style={{ padding: "40px 0" }}>
            <div className="empty-icon">♡</div>
            <div className="empty-text">No bookmarks yet. <Link href="/posts" style={{ color: "var(--sky)" }}>Browse posts →</Link></div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {posts.map((p) => <PostCard key={p._id || p.id} post={p} queryKey={["posts","bookmarked"]} />)}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
