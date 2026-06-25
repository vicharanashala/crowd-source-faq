"use client";
import { useQuery } from "@tanstack/react-query";
import { aiApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatTimeAgo } from "@/lib/utils";
import Link from "next/link";
import Footer from "@/components/Footer";

interface UnansweredQ {
  _id?: string;
  query: string;
  suggested_question?: string;
  suggested_answer?: string;
  timestamp?: string;
  createdAt?: string;
  attempts?: number;
}

export default function UnansweredPage() {
  const user = useAuthStore((s) => s.user);

  const { data, isLoading } = useQuery({
    queryKey: ["unanswered"],
    queryFn: () => aiApi.getUnanswered({ limit: 100 }).then((r) => r.data),
    enabled: !!user && user.role === "admin",
  });

  const items: UnansweredQ[] = data?.questions || data || [];

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

        <div style={{ marginBottom: 32 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.12em", color: "var(--coral)" }}>PENDING REVIEW</span>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(24px,3.5vw,44px)", fontWeight: 300, color: "var(--ink)", letterSpacing: "-0.02em", marginTop: 4 }}>
            Unanswered Queries
          </h1>
          <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, color: "var(--ink-soft)", marginTop: 8, maxWidth: 540 }}>
            Questions the AI couldn&apos;t answer confidently. The AI has drafted a suggested answer for each — click <strong>Draft Answer</strong> to review and publish it as a FAQ.
          </p>
        </div>

        {isLoading ? (
          <div className="empty-state" style={{ padding: "40px 0" }}><div className="empty-text">Loading…</div></div>
        ) : items.length === 0 ? (
          <div className="empty-state" style={{ padding: "60px 0" }}>
            <div className="empty-icon">✓</div>
            <div className="empty-text">No unanswered queries — great coverage!</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {items.map((item, i) => (
              <div key={item._id || i}
                style={{ background: "#fff", border: "1px solid rgba(74,144,196,0.12)", borderRadius: 14, padding: "20px 24px" }}>
                {/* Raw query */}
                <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
                  {item.query}
                </p>

                {/* AI-drafted suggested question/answer */}
                {item.suggested_question && (
                  <div style={{ background: "rgba(74,144,196,0.05)", borderRadius: 10, padding: "12px 14px", marginBottom: 12, border: "1px solid rgba(74,144,196,0.12)" }}>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.1em", color: "var(--sky)", marginBottom: 6 }}>
                      AI DRAFT — SUGGESTED Q&A
                    </p>
                    <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 600, color: "var(--ink-mid)", marginBottom: 4 }}>
                      {item.suggested_question}
                    </p>
                    {item.suggested_answer && (
                      <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.65 }}>
                        {item.suggested_answer}
                      </p>
                    )}
                  </div>
                )}

                {/* Meta + action */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  {(item.createdAt || item.timestamp) && (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "var(--muted)", letterSpacing: "0.06em" }}>
                      {formatTimeAgo(item.createdAt || item.timestamp || "")}
                      {item.attempts ? ` · ${item.attempts} attempts` : ""}
                    </span>
                  )}

                  {/* §4 hand-off: pre-fills /admin/faqs create form with AI draft */}
                  <Link
                    href={`/admin/faqs?prefillQuestion=${encodeURIComponent(item.suggested_question || item.query)}&prefillAnswer=${encodeURIComponent(item.suggested_answer || "")}`}
                    className="apply-btn"
                    style={{ textDecoration: "none", fontSize: 11, padding: "7px 16px" }}
                  >
                    Draft Answer →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
