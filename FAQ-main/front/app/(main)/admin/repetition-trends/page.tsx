"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { aiApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatTimeAgo } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import Footer from "@/components/Footer";

interface RepetitionCluster {
  _id: string;
  representative_question: string;
  post_ids: string[];
  post_titles: string[];
  occurrence_count: number;
  status: "pending" | "promoted" | "dismissed";
  suggested_question?: string;
  suggested_answer?: string;
  created_at: string;
  updated_at: string;
}

export default function RepetitionTrendsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["repetition-clusters"],
    queryFn: () => aiApi.getRepetitionClusters().then((r) => r.data),
    enabled: !!user && user.role === "admin",
  });

  const clusters: RepetitionCluster[] = data?.clusters || [];

  const promoteMut = useMutation({
    mutationFn: (id: string) => aiApi.promoteRepetitionCluster(id),
    onSuccess: () => {
      toast.success("Cluster marked as promoted");
      qc.invalidateQueries({ queryKey: ["repetition-clusters"] });
    },
    onError: () => toast.error("Failed to promote cluster"),
  });

  const dismissMut = useMutation({
    mutationFn: (id: string) => aiApi.dismissRepetitionCluster(id),
    onSuccess: () => {
      toast.success("Cluster dismissed");
      qc.invalidateQueries({ queryKey: ["repetition-clusters"] });
    },
    onError: () => toast.error("Failed to dismiss cluster"),
  });

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
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.12em", color: "var(--gold)" }}>
            REPETITION TRENDS
          </span>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(24px,3.5vw,44px)", fontWeight: 300, color: "var(--ink)", letterSpacing: "-0.02em", marginTop: 4 }}>
            Recurring Discussion Questions
          </h1>
          <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, color: "var(--ink-soft)", marginTop: 8, maxWidth: 560 }}>
            Questions that keep appearing in community discussions — strong signals for new FAQs.
            The AI has drafted a suggested entry for each cluster that&apos;s been asked enough times.
          </p>
        </div>

        {isLoading ? (
          <div className="empty-state" style={{ padding: "40px 0" }}>
            <div className="empty-text">Loading…</div>
          </div>
        ) : clusters.length === 0 ? (
          <div className="empty-state" style={{ padding: "60px 0" }}>
            <div className="empty-icon">⟲</div>
            <div className="empty-text">No recurring questions detected yet.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {clusters.map((cluster) => (
              <div
                key={cluster._id}
                style={{ background: "#fff", border: "1px solid rgba(74,144,196,0.12)", borderRadius: 14, padding: "20px 24px" }}
              >
                {/* Occurrence badge + time */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", padding: "3px 10px", borderRadius: 20, background: "rgba(212,95,74,0.1)", color: "var(--coral)", border: "1px solid rgba(212,95,74,0.2)", fontWeight: 700 }}>
                    Asked {cluster.occurrence_count}× across discussions
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "var(--muted)", letterSpacing: "0.06em", marginLeft: "auto" }}>
                    {formatTimeAgo(cluster.updated_at || cluster.created_at)}
                  </span>
                </div>

                {/* Representative question */}
                <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 10 }}>
                  {cluster.representative_question}
                </p>

                {/* AI-drafted FAQ suggestion */}
                {cluster.suggested_question && (
                  <div style={{ background: "rgba(74,144,196,0.05)", borderRadius: 10, padding: "12px 14px", marginBottom: 12, border: "1px solid rgba(74,144,196,0.12)" }}>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.1em", color: "var(--sky)", marginBottom: 6 }}>
                      AI DRAFT — SUGGESTED Q&amp;A
                    </p>
                    <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 600, color: "var(--ink-mid)", marginBottom: 4 }}>
                      {cluster.suggested_question}
                    </p>
                    {cluster.suggested_answer && (
                      <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.65 }}>
                        {cluster.suggested_answer}
                      </p>
                    )}
                  </div>
                )}

                {/* Linked post titles */}
                {cluster.post_titles?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 }}>
                      TRIGGERED BY {cluster.post_titles.length} DISCUSSION{cluster.post_titles.length !== 1 ? "S" : ""}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {cluster.post_titles.map((title, i) => {
                        const postId = cluster.post_ids?.[i];
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "var(--muted)", fontSize: 10 }}>·</span>
                            {postId ? (
                              <Link
                                href={`/posts/${postId}`}
                                style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "var(--sky)", textDecoration: "none" }}
                              >
                                {title}
                              </Link>
                            ) : (
                              <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "var(--ink-soft)" }}>
                                {title}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link
                    href={`/admin/faqs?prefillQuestion=${encodeURIComponent(cluster.suggested_question || cluster.representative_question)}&prefillAnswer=${encodeURIComponent(cluster.suggested_answer || "")}`}
                    onClick={() => promoteMut.mutate(cluster._id)}
                    className="apply-btn"
                    style={{ textDecoration: "none", fontSize: 11, padding: "7px 16px" }}
                  >
                    Promote to FAQ →
                  </Link>

                  <button
                    onClick={() => dismissMut.mutate(cluster._id)}
                    disabled={dismissMut.isPending}
                    style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, padding: "7px 16px", borderRadius: 10, border: "1px solid rgba(74,144,196,0.2)", background: "transparent", color: "var(--ink-soft)", cursor: "pointer" }}
                  >
                    Dismiss
                  </button>
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
