"use client";
import { useState, useEffect } from "react";
import { directQuestionsApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";

interface AskAdminModalProps {
  defaultQuestion?: string;
  source?: "faq_search" | "ai_chat" | "manual";
  originalQuery?: string;
  onClose: () => void;
}

export default function AskAdminModal({
  defaultQuestion = "",
  source = "manual",
  originalQuery = "",
  onClose,
}: AskAdminModalProps) {
  const user = useAuthStore((s) => s.user);
  const [question, setQuestion] = useState(defaultQuestion);
  const [context, setContext] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Scroll-lock while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleSubmit = async () => {
    if (!question.trim()) return;
    setSubmitting(true);
    try {
      await directQuestionsApi.create({
        question: question.trim(),
        context: context.trim(),
        source,
        originalQuery: originalQuery || defaultQuestion,
        askedBy: user
          ? undefined
          : { name: guestName.trim() || "Anonymous", email: guestEmail.trim() },
      });
      toast.success("Sent to admin — you'll get an answer soon!");
      onClose();
    } catch {
      toast.error("Failed to send question. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    fontFamily: "'Syne', sans-serif",
    fontSize: 13,
    padding: "10px 14px",
    borderRadius: 10,
    background: "rgba(74,144,196,0.05)",
    border: "1px solid rgba(74,144,196,0.2)",
    color: "var(--ink)",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    letterSpacing: "0.12em",
    color: "var(--muted)",
    textTransform: "uppercase",
    marginBottom: 6,
  };

  return (
    <div
      className="card-expanded-panel open"
      role="dialog"
      aria-modal="true"
      aria-label="Ask Admin Directly"
    >
      <div className="panel-backdrop" onClick={onClose} />

      <div className="panel-box" style={{ maxWidth: 520 }}>
        <button
          className="panel-close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        {/* Header */}
        <div className="panel-tag">
          <span className="panel-tag-line" />
          <span>ASK ADMIN DIRECTLY</span>
        </div>
        <div className="panel-q" style={{ fontSize: "clamp(18px,2.5vw,26px)", marginBottom: 6 }}>
          Send a question to the team
        </div>
        <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "var(--ink-soft)", marginBottom: 20, lineHeight: 1.6 }}>
          Couldn&apos;t find what you&apos;re looking for? We&apos;ll answer it directly.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Question */}
          <div>
            <label style={labelStyle}>Your question *</label>
            <textarea
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What would you like to know?"
              style={{ ...inputStyle, resize: "none" }}
            />
          </div>

          {/* Optional context */}
          <div>
            <label style={labelStyle}>More context (optional)</label>
            <textarea
              rows={2}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Any additional details that might help…"
              style={{ ...inputStyle, resize: "none" }}
            />
          </div>

          {/* Guest fields — only shown if not logged in */}
          {!user && (
            <>
              <div>
                <label style={labelStyle}>Your name (optional)</label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="So we know who to reply to"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Your email (optional)</label>
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="For follow-up if needed"
                  style={inputStyle}
                />
              </div>
            </>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button
              onClick={onClose}
              style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: 12,
                padding: "10px 18px",
                borderRadius: 10,
                border: "1px solid rgba(74,144,196,0.2)",
                background: "transparent",
                color: "var(--ink-soft)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!question.trim() || submitting}
              className="apply-btn"
              style={{
                fontSize: 12,
                flex: 1,
                justifyContent: "center",
                display: "flex",
                opacity: !question.trim() || submitting ? 0.6 : 1,
              }}
            >
              {submitting ? "Sending…" : "Send to Admin →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
