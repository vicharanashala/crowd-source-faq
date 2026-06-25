"use client";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postsApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { truncate, formatTimeAgo } from "@/lib/utils";

interface Post {
  _id: string; id: string; title: string; intro: string; description: string;
  category: string; author: { name: string; title: string; avatar: string };
  timestamp: string; upvotes: number; commentsCount: number; views: string;
  voted?: "up" | "down" | null; bookmarked?: boolean; createdAt?: string;
}

export default function PostCard({ post, queryKey }: { post: Post; queryKey?: unknown[] }) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const postId = post.id || post._id;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["posts"] });
    if (queryKey) qc.invalidateQueries({ queryKey: queryKey as string[] });
  };

  const voteMutation = useMutation({
    mutationFn: (dir: "up" | "down" | null) => postsApi.vote(postId, dir),
    onSuccess: invalidate,
    onError: () => toast.error("Login required to vote"),
  });

  const bookmarkMutation = useMutation({
    mutationFn: () => postsApi.bookmark(postId),
    onSuccess: (res) => {
      toast.success(res.data.bookmarked ? "Bookmarked!" : "Removed bookmark");
      invalidate();
    },
    onError: () => toast.error("Login required"),
  });

  const catLabel = post.category?.charAt(0).toUpperCase() + post.category?.slice(1).toLowerCase();

  return (
    <div className="post-card-wrap">
      <Link href={`/posts/${postId}`} style={{ textDecoration: "none", display: "block", padding: "18px 20px" }}>
        {/* Category chip */}
        <div style={{ marginBottom: 10 }}>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5,
              letterSpacing: "0.1em", padding: "3px 8px", borderRadius: 20,
              background: "rgba(74,144,196,0.1)", color: "var(--sky)",
              border: "1px solid rgba(74,144,196,0.25)",
            }}
          >
            {catLabel}
          </span>
        </div>

        {/* Title */}
        <h3
          style={{
            fontFamily: "'Cormorant Garamond', serif", fontSize: 17,
            fontWeight: 600, lineHeight: 1.3, color: "var(--ink)", marginBottom: 8,
          }}
        >
          {truncate(post.title, 80)}
        </h3>

        {/* Intro */}
        <p
          style={{
            fontFamily: "'Syne', sans-serif", fontSize: 12.5, lineHeight: 1.7,
            color: "var(--ink-soft)", marginBottom: 14,
            display: "-webkit-box", WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical", overflow: "hidden",
          }}
        >
          {post.intro || post.description}
        </p>

        {/* Author + timestamp */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div
            style={{
              width: 22, height: 22, borderRadius: "50%",
              background: "var(--sky)", display: "flex",
              alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0,
            }}
          >
            {post.author?.name?.[0]?.toUpperCase() || "?"}
          </div>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, color: "var(--ink-soft)" }}>
            {post.author?.name}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "var(--muted)", marginLeft: "auto" }}>
            {post.createdAt ? formatTimeAgo(post.createdAt) : post.timestamp}
          </span>
        </div>
      </Link>

      {/* Footer actions */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "10px 20px", borderTop: "1px solid rgba(74,144,196,0.08)",
        }}
      >
        <button
          onClick={() => {
            if (!user) { toast.error("Sign in to vote"); return; }
            voteMutation.mutate(post.voted === "up" ? null : "up");
          }}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: post.voted === "up" ? "var(--sky)" : "var(--muted)",
            background: "none", border: "none", cursor: "pointer",
          }}
        >
          ▲ {post.upvotes}
        </button>

        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--muted)" }}>
          ◎ {post.commentsCount}
        </span>

        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--muted)" }}>
          ◷ {post.views}
        </span>

        <button
          onClick={() => {
            if (!user) { toast.error("Sign in to bookmark"); return; }
            bookmarkMutation.mutate();
          }}
          style={{
            marginLeft: "auto", background: "none", border: "none", cursor: "pointer",
            color: post.bookmarked ? "var(--gold)" : "var(--muted)",
            fontSize: 14, lineHeight: 1,
          }}
          title={post.bookmarked ? "Remove bookmark" : "Bookmark"}
        >
          {post.bookmarked ? "♥" : "♡"}
        </button>
      </div>
    </div>
  );
}
