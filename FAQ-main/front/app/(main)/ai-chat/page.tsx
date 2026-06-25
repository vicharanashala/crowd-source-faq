"use client";
import { useState, useRef, useEffect } from "react";
import { aiApi } from "@/lib/api";
import { toast } from "sonner";
import Footer from "@/components/Footer";
import AskAdminModal from "@/components/AskAdminModal";

interface Msg {
  id: string;
  role: "user" | "ai";
  content: string;
  source?: string;
  isUnanswered?: boolean;
  originalQuery?: string;
}

export default function AIChatPage() {
  const [msgs, setMsgs] = useState<Msg[]>([{
    id: "welcome", role: "ai",
    content: "Hi! I'm the Vicharanashala AI, trained on the IIT Ropar knowledge base. Ask me anything about campus life, academics, hostels, research, or placements.",
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [askAdminQuery, setAskAdminQuery] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setMsgs((m) => [...m, { id: Date.now().toString(), role: "user", content: q }]);
    setInput(""); setLoading(true);
    try {
      const res = await aiApi.chat(q);
      const isUnanswered = res.data.is_unanswered === true;
      setMsgs((m) => [...m, {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: res.data.answer || res.data.response || "I couldn't find a specific answer. Try rephrasing.",
        source: res.data.route || res.data.source,
        isUnanswered,
        originalQuery: q,
      }]);
    } catch {
      toast.error("AI service unavailable");
      setMsgs((m) => [...m, {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: "AI service is currently unavailable. Please try again later.",
      }]);
    } finally { setLoading(false); }
  };

  return (
    <>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "100px 24px 0", display: "flex", flexDirection: "column", height: "calc(100vh - 0px)", position: "relative", zIndex: 2 }}>
        {/* Header */}
        <div style={{ marginBottom: 24, flexShrink: 0 }}>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(24px,3.5vw,42px)", fontWeight: 300, color: "var(--ink)", letterSpacing: "-0.02em", marginBottom: 6 }}>
            AI Knowledge Assistant
          </h1>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "var(--muted)" }}>
            POWERED BY LLAMA 3.3 · IIT ROPAR KNOWLEDGE BASE
          </p>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", background: "#fff", border: "1px solid rgba(74,144,196,0.15)", borderRadius: 14, padding: "20px 24px", marginBottom: 16 }}>
          {msgs.map((msg) => (
            <div key={msg.id}>
              <div style={{ display: "flex", gap: 12, marginBottom: msg.isUnanswered ? 10 : 20, flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
                {/* Avatar */}
                <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  background: msg.role === "user" ? "var(--sky)" : "var(--gold-pale)",
                  border: `1px solid ${msg.role === "user" ? "var(--sky-bright)" : "var(--gold)"}`,
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: msg.role === "user" ? "#fff" : "var(--gold)", fontWeight: 700 }}>
                  {msg.role === "user" ? "U" : "AI"}
                </div>

                {/* Bubble */}
                <div style={{ maxWidth: "78%", padding: "12px 16px", borderRadius: msg.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                  background: msg.role === "user" ? "linear-gradient(135deg,#2a5f9e,#4a90c4)" : "var(--page)",
                  color: msg.role === "user" ? "#fff" : "var(--ink-mid)",
                  fontFamily: "'Syne', sans-serif", fontSize: 13, lineHeight: 1.75,
                  border: msg.role === "ai" ? "1px solid rgba(74,144,196,0.1)" : "none" }}>
                  {msg.content}
                  {msg.source && (
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, letterSpacing: "0.08em", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                      via {msg.source}
                    </p>
                  )}
                </div>
              </div>

              {/* "Ask Admin" follow-up bubble — shown when AI wasn't confident */}
              {msg.isUnanswered && (
                <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "var(--gold-pale)", border: "1px solid var(--gold)",
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--gold)", fontWeight: 700 }}>
                    AI
                  </div>
                  <div style={{ maxWidth: "78%", padding: "10px 14px", borderRadius: "4px 16px 16px 16px",
                    background: "rgba(212,95,74,0.06)", border: "1px solid rgba(212,95,74,0.2)",
                    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "var(--ink-mid)", lineHeight: 1.5, margin: 0 }}>
                      I wasn&apos;t confident in that answer. Want to ask an admin instead?
                    </p>
                    <button
                      onClick={() => setAskAdminQuery(msg.originalQuery || "")}
                      className="apply-btn"
                      style={{ fontSize: 11, padding: "6px 14px", whiteSpace: "nowrap" }}
                    >
                      Ask Admin →
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--gold-pale)", border: "1px solid var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--gold)", fontWeight: 700 }}>AI</div>
              <div style={{ padding: "12px 16px", borderRadius: "4px 16px 16px 16px", background: "var(--page)", border: "1px solid rgba(74,144,196,0.1)", display: "flex", gap: 5, alignItems: "center" }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--sky)", display: "inline-block", animation: `statPulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div style={{ flexShrink: 0, display: "flex", gap: 10, background: "#fff", border: "1px solid rgba(74,144,196,0.15)", borderRadius: 14, padding: "12px 16px", marginBottom: 24 }}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask anything about IIT Ropar… (Enter to send)"
            rows={2} disabled={loading}
            style={{ flex: 1, resize: "none", fontFamily: "'Syne', sans-serif", fontSize: 13, color: "var(--ink)", outline: "none", background: "transparent", border: "none", lineHeight: 1.6 }} />
          <button onClick={send} disabled={!input.trim() || loading} className="apply-btn"
            style={{ alignSelf: "flex-end", padding: "8px 18px", fontSize: 12, opacity: (!input.trim() || loading) ? 0.5 : 1 }}>
            ▶
          </button>
        </div>
      </div>

      <Footer />

      {askAdminQuery !== null && (
        <AskAdminModal
          defaultQuestion={askAdminQuery}
          source="ai_chat"
          originalQuery={askAdminQuery}
          onClose={() => setAskAdminQuery(null)}
        />
      )}
    </>
  );
}
