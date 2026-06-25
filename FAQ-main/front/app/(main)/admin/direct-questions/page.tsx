"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { directQuestionsApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatTimeAgo } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import Footer from "@/components/Footer";

interface DirectQuestion {
  _id: string;
  question: string;
  context?: string;
  askedBy?: { id?: string; name?: string; email?: string };
  source?: "faq_search" | "ai_chat" | "manual";
  originalQuery?: string;
  status: "pending" | "answered" | "dismissed";
  answer?: string;
  answeredBy?: string;
  answeredAt?: string;
  createdAt: string;
}

const SOURCE_LABELS: Record<string, string> = {
  faq_search: "FAQ Search",
  ai_chat: "AI Chat",
  manual: "Manual",
};

const STATUS_PILLS = [
  { val: "pending", label: "Pending" },
  { val: "answered", label: "Answered" },
  { val: "dismissed", label: "Dismissed" },
];

export default function DirectQuestionsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [activeStatus, setActiveStatus] = useState("pending");
  const [answerMap, setAnswerMap] = useState<Record<string, string>>({});

  const { data: items = [], isLoading } = useQuery<DirectQuestion[]>({
    queryKey: ["direct-questions", activeStatus],
    queryFn: () => directQuestionsApi.getAll(activeStatus).then((r) => r.data),
    enabled: !!user && user.role === "admin",
  });

  const answerMut = useMutation({
    mutationFn: ({ id, answer }: { id: string; answer: string }) =>
      directQuestionsApi.answer(id, answer),
    onSuccess: () => {
      toast.success("Answer sent!");
      qc.invalidateQueries({ queryKey: ["direct-questions"] });
    },
    onError: () => toast.error("Failed to send answer"),
  });

  const dismissMut = useMutation({
    mutationFn: (id: string) => directQuestionsApi.dismiss(id),
    onSuccess: () => {
      toast.success("Question dismissed");
      qc.invalidateQueries({ queryKey: ["direct-questions"] });
    },
    onError: () => toast.error("Failed to dismiss"),
  });

  const pillBase: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    letterSpacing: "0.1em",
    padding: "5px 14px",
    borderRadius: 20,
    cursor: "pointer",
    border: "1px solid rgba(74,144,196,0.2)",
    background: "transparent",
    color: "var(--ink-soft)",
    textTransform: "uppercase" as const,
    transition: "all 0.15s",
  };

  if (!user || user.role !== "admin") {
    return (
      <>
        <div className="empty-state" style={{ paddingTop: 120 }}>
          <div className="empty-text">Admin access required.</div>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "100px 80px 80px", position: "relative", zIndex: 2 }}>
        <Link href="/admin" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--sky)", letterSpacing: "0.08em", textDecoration: "none", display: "inline-block", marginBottom: 28 }}>
          ← ADMIN
        </Link>

        <div style={{ marginBottom: 28 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.12em", color: "var(--coral)" }}>
            DIRECT QUESTIONS
          </span>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(24px,3.5vw,44px)", fontWeight: 300, color: "var(--ink)", letterSpacing: "-0.02em", marginTop: 4 }}>
            Ask Admin Directly
          </h1>
          <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, color: "var(--ink-soft)", marginTop: 8, maxWidth: 540 }}>
            Questions sent directly to admins when the FAQ or AI couldn&apos;t help.
          </p>
        </div>

        {/* Status filter pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {STATUS_PILLS.map(({ val, label }) => (
            <button
              key={val}
              onClick={() => setActiveStatus(val)}
              style={{
                ...pillBase,
                background: activeStatus === val ? "var(--sky)" : "transparent",
                color: activeStatus === val ? "#fff" : "var(--ink-soft)",
                borderColor: activeStatus === val ? "var(--sky)" : "rgba(74,144,196,0.2)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="empty-state" style={{ padding: "40px 0" }}>
            <div className="empty-text">Loading…</div>
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state" style={{ padding: "60px 0" }}>
            <div className="empty-icon">✓</div>
            <div className="empty-text">No {activeStatus} questions.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {items.map((item) => (
              <div
                key={item._id}
                style={{ background: "#fff", border: "1px solid rgba(74,144,196,0.12)", borderRadius: 14, padding: "20px 24px" }}
              >
                {/* Badges row */}
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
                  {item.source && (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.1em", padding: "2px 8px", borderRadius: 20, background: "rgba(74,144,196,0.08)", color: "var(--sky)", border: "1px solid rgba(74,144,196,0.2)" }}>
                      {SOURCE_LABELS[item.source] || item.source}
                    </span>
                  )}
                  {item.askedBy?.name && item.askedBy.name !== "Anonymous" && (
                    <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, color: "var(--ink-soft)" }}>
                      from <strong>{item.askedBy.name}</strong>
                      {item.askedBy.email ? ` · ${item.askedBy.email}` : ""}
                    </span>
                  )}
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "var(--muted)", letterSpacing: "0.06em", marginLeft: "auto" }}>
                    {formatTimeAgo(item.createdAt)}
                  </span>
                </div>

                {/* Question */}
                <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
                  {item.question}
                </p>

                {/* Context */}
                {item.context && (
                  <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "var(--ink-soft)", marginBottom: 8, lineHeight: 1.6 }}>
                    {item.context}
                  </p>
                )}

                {/* Original query if different */}
                {item.originalQuery && item.originalQuery !== item.question && (
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "var(--muted)", letterSpacing: "0.06em", marginBottom: 10 }}>
                    Original search: &ldquo;{item.originalQuery}&rdquo;
                  </p>
                )}

                {/* Existing answer (answered items) */}
                {item.status === "answered" && item.answer && (
                  <div style={{ background: "rgba(74,144,196,0.05)", borderRadius: 10, padding: "10px 14px", marginBottom: 10, border: "1px solid rgba(74,144,196,0.12)" }}>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.1em", color: "var(--sky)", marginBottom: 4 }}>ADMIN ANSWER</p>
                    <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "var(--ink-mid)", lineHeight: 1.65 }}>{item.answer}</p>
                  </div>
                )}

                {/* Actions — only for pending items */}
                {item.status === "pending" && (
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                    <textarea
                      rows={3}
                      value={answerMap[item._id] || ""}
                      onChange={(e) => setAnswerMap((m) => ({ ...m, [item._id]: e.target.value }))}
                      placeholder="Write your answer…"
                      style={{ width: "100%", fontFamily: "'Syne', sans-serif", fontSize: 13, padding: "10px 14px", borderRadius: 10, background: "rgba(74,144,196,0.05)", border: "1px solid rgba(74,144,196,0.2)", color: "var(--ink)", outline: "none", resize: "none", boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        onClick={() => {
                          const ans = answerMap[item._id]?.trim();
                          if (!ans) { toast.error("Write an answer first"); return; }
                          answerMut.mutate({ id: item._id, answer: ans });
                        }}
                        disabled={answerMut.isPending}
                        className="apply-btn"
                        style={{ fontSize: 11, padding: "7px 16px" }}
                      >
                        Send Answer →
                      </button>

                      <Link
                        href={`/admin/faqs?prefillQuestion=${encodeURIComponent(item.question)}&prefillAnswer=${encodeURIComponent(answerMap[item._id] || item.answer || "")}`}
                        className="apply-btn"
                        style={{ textDecoration: "none", fontSize: 11, padding: "7px 16px", background: "rgba(200,146,42,0.1)", borderColor: "rgba(200,146,42,0.3)", color: "var(--gold)" }}
                      >
                        Convert to FAQ →
                      </Link>

                      <button
                        onClick={() => dismissMut.mutate(item._id)}
                        disabled={dismissMut.isPending}
                        style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, padding: "7px 16px", borderRadius: 10, border: "1px solid rgba(74,144,196,0.2)", background: "transparent", color: "var(--ink-soft)", cursor: "pointer" }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
