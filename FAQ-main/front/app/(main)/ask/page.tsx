"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { postsApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { CATEGORIES } from "@/lib/utils";
import Link from "next/link";

export default function AskPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState({ title: "", category: "GENERAL", intro: "" });

  const createMut = useMutation({
    mutationFn: () => postsApi.create(form),
    onSuccess: (res) => {
      toast.success("Question posted!");
      router.push(`/posts/${res.data.id || res.data._id}`);
    },
    onError: () => toast.error("Failed to post. Are you signed in?"),
  });

  const inputStyle: React.CSSProperties = {
    width: "100%", fontFamily: "'Syne', sans-serif", fontSize: 13,
    padding: "12px 16px", borderRadius: 10,
    background: "rgba(74,144,196,0.05)", border: "1px solid rgba(74,144,196,0.2)",
    color: "var(--ink)", outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
    letterSpacing: "0.12em", color: "var(--muted)", textTransform: "uppercase", marginBottom: 8,
  };

  if (!user) {
    return (
      <div className="empty-state" style={{ paddingTop: 120 }}>
        <div className="empty-icon">✦</div>
        <div className="empty-text">
          <Link href="/login" style={{ color: "var(--sky)" }}>Sign in</Link> to ask a question.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "100px 24px 80px", position: "relative", zIndex: 2 }}>
      <Link href="/posts" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--sky)", letterSpacing: "0.08em", textDecoration: "none", display: "inline-block", marginBottom: 28 }}>
        ← BACK
      </Link>

      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(28px,4vw,48px)", fontWeight: 300, color: "var(--ink)", letterSpacing: "-0.02em", marginBottom: 32 }}>
        Ask a Question
      </h1>

      <div className="panel-box" style={{ position: "relative", transform: "none", transition: "none" }}>
        <form onSubmit={(e) => { e.preventDefault(); if (!form.title.trim()) { toast.error("Title required"); return; } createMut.mutate(); }}>
          {/* Title */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Question Title *</label>
            <input type="text" required value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="What is the process for hostel allotment?"
              style={inputStyle} />
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "var(--muted)", marginTop: 6, letterSpacing: "0.06em" }}>
              Be specific — imagine asking a knowledgeable friend.
            </p>
          </div>

          {/* Category pills */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Category *</label>
            <div className="pills-row">
              {CATEGORIES.filter((c) => c !== "All").map((cat) => (
                <button key={cat} type="button"
                  className={`pill${form.category === cat ? " active" : ""}`}
                  onClick={() => setForm((f) => ({ ...f, category: cat }))}>
                  {cat.charAt(0) + cat.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Details */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Details (optional)</label>
            <textarea rows={5} value={form.intro}
              onChange={(e) => setForm((f) => ({ ...f, intro: e.target.value }))}
              placeholder="Provide more context about your question…"
              style={{ ...inputStyle, resize: "none" }} />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button type="button" onClick={() => router.back()}
              style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, padding: "11px 20px", borderRadius: 10, border: "1px solid rgba(74,144,196,0.2)", background: "transparent", color: "var(--ink-soft)", cursor: "pointer" }}>
              Cancel
            </button>
            <button type="submit" disabled={createMut.isPending} className="apply-btn"
              style={{ flex: 1, justifyContent: "center", display: "flex", fontSize: 13, opacity: createMut.isPending ? 0.7 : 1 }}>
              {createMut.isPending ? "Posting…" : "Post Question →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
