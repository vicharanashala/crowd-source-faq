"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { auditLogsApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatTimeAgo } from "@/lib/utils";
import Link from "next/link";
import Footer from "@/components/Footer";

interface AuditLog {
  _id: string;
  action: string;
  actorId: string;
  actorName?: string;
  targetType?: string;
  targetId?: string;
  details?: string;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  BAN_USER: "Banned a user",
  UNBAN_USER: "Unbanned a user",
  ANSWER_DIRECT_QUESTION: "Answered a direct question",
  DISMISS_DIRECT_QUESTION: "Dismissed a direct question",
  CONVERT_TO_FAQ: "Converted to FAQ",
  PROMOTE_REPETITION_CLUSTER: "Promoted repetition cluster",
  DISMISS_REPETITION_CLUSTER: "Dismissed repetition cluster",
  DELETE_POST: "Deleted a post",
  CREATE_FAQ: "Created a FAQ",
};

const ACTION_OPTIONS = [
  { val: "", label: "All Actions" },
  { val: "BAN_USER", label: "Ban" },
  { val: "UNBAN_USER", label: "Unban" },
  { val: "ANSWER_DIRECT_QUESTION", label: "Answers" },
  { val: "CONVERT_TO_FAQ", label: "FAQ Converts" },
  { val: "PROMOTE_REPETITION_CLUSTER", label: "Promotions" },
  { val: "DELETE_POST", label: "Post Deletes" },
];

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const user = useAuthStore((s) => s.user);
  const [activeAction, setActiveAction] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", activeAction, page],
    queryFn: () =>
      auditLogsApi.getAll({
        limit: PAGE_SIZE,
        skip: page * PAGE_SIZE,
        action: activeAction || undefined,
      }).then((r) => r.data),
    enabled: !!user && user.role === "admin",
  });

  const logs: AuditLog[] = data?.logs || [];
  const total: number = data?.total || 0;

  const pillBase: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    letterSpacing: "0.1em",
    padding: "5px 12px",
    borderRadius: 20,
    cursor: "pointer",
    border: "1px solid rgba(74,144,196,0.2)",
    background: "transparent",
    color: "var(--ink-soft)",
    textTransform: "uppercase" as const,
    transition: "all 0.15s",
    whiteSpace: "nowrap" as const,
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
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.12em", color: "var(--muted)" }}>
            AUDIT LOG
          </span>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(24px,3.5vw,44px)", fontWeight: 300, color: "var(--ink)", letterSpacing: "-0.02em", marginTop: 4 }}>
            Admin Action History
          </h1>
          <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, color: "var(--ink-soft)", marginTop: 8, maxWidth: 500 }}>
            A full record of all admin actions across the platform.
          </p>
        </div>

        {/* Action filter pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {ACTION_OPTIONS.map(({ val, label }) => (
            <button
              key={val}
              onClick={() => { setActiveAction(val); setPage(0); }}
              style={{
                ...pillBase,
                background: activeAction === val ? "var(--sky)" : "transparent",
                color: activeAction === val ? "#fff" : "var(--ink-soft)",
                borderColor: activeAction === val ? "var(--sky)" : "rgba(74,144,196,0.2)",
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
        ) : logs.length === 0 ? (
          <div className="empty-state" style={{ padding: "60px 0" }}>
            <div className="empty-icon">▤</div>
            <div className="empty-text">No audit log entries yet.</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {logs.map((log) => (
                <div
                  key={log._id}
                  style={{ background: "#fff", border: "1px solid rgba(74,144,196,0.1)", borderRadius: 12, padding: "14px 18px", display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}
                >
                  {/* Timestamp */}
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "var(--muted)", letterSpacing: "0.06em", flexShrink: 0, paddingTop: 2, minWidth: 70 }}>
                    {formatTimeAgo(log.createdAt)}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Action label */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.1em", padding: "2px 7px", borderRadius: 20, background: "rgba(74,144,196,0.08)", color: "var(--sky)", border: "1px solid rgba(74,144,196,0.15)" }}>
                        {log.action}
                      </span>
                    </div>

                    {/* Actor */}
                    {log.actorName && (
                      <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, color: "var(--ink-soft)", marginBottom: 2 }}>
                        by <strong>{log.actorName}</strong>
                        {log.targetType ? ` · target: ${log.targetType}` : ""}
                      </p>
                    )}

                    {/* Details */}
                    {log.details && (
                      <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
                        {log.details}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "center" }}>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{ ...pillBase, opacity: page === 0 ? 0.4 : 1 }}
                >
                  ← Prev
                </button>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "var(--muted)", letterSpacing: "0.08em", alignSelf: "center" }}>
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(page + 1) * PAGE_SIZE >= total}
                  style={{ ...pillBase, opacity: (page + 1) * PAGE_SIZE >= total ? 0.4 : 1 }}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <Footer />
    </>
  );
}
