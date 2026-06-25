"use client";
import { useState, useEffect, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { faqsApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import Link from "next/link";
import Footer from "@/components/Footer";
import { FAQItem } from "@/components/FAQCard";

function AdminFAQsContent() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({
    question: searchParams.get("prefillQuestion") || "",
    answer: searchParams.get("prefillAnswer") || "",
    category: "General",
    tags: "",
    source: "IIT Ropar FAQ",
  });
  const [showForm, setShowForm] = useState(
    !!(searchParams.get("prefillQuestion") || searchParams.get("prefillAnswer"))
  );

  useEffect(() => {
    const pq = searchParams.get("prefillQuestion");
    const pa = searchParams.get("prefillAnswer");
    if (pq || pa) {
      setForm((f) => ({ ...f, question: pq || f.question, answer: pa || f.answer }));
      setShowForm(true);
    }
  }, [searchParams]);

  const { data: faqs = [], isLoading } = useQuery<FAQItem[]>({
    queryKey: ["faqs"],
    queryFn: () => faqsApi.getAll().then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: () =>
      faqsApi.create({
        question: form.question, answer: form.answer, category: form.category,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        source: form.source,
      }),
    onSuccess: () => {
      toast.success("FAQ created!");
      qc.invalidateQueries({ queryKey: ["faqs"] });
      setForm({ question: "", answer: "", category: "General", tags: "", source: "IIT Ropar FAQ" });
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create FAQ"),
  });

  const inputStyle: React.CSSProperties = {
    width: "100%", fontFamily: "'Syne', sans-serif", fontSize: 13,
    padding: "10px 14px", borderRadius: 10,
    background: "rgba(74,144,196,0.05)", border: "1px solid rgba(74,144,196,0.2)",
    color: "var(--ink)", outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
    letterSpacing: "0.12em", color: "var(--muted)", textTransform: "uppercase", marginBottom: 6,
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

  const isPrefilled = !!(searchParams.get("prefillQuestion"));

  return (
    <>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "100px 80px 80px", position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 12 }}>
          <div>
            <Link href="/admin" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--sky)", letterSpacing: "0.08em", textDecoration: "none", display: "inline-block", marginBottom: 8 }}>← ADMIN</Link>
            <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(24px,3.5vw,44px)", fontWeight: 300, color: "var(--ink)", letterSpacing: "-0.02em" }}>
              Manage FAQs
            </h1>
          </div>
          <button onClick={() => setShowForm((v) => !v)} className="apply-btn" style={{ fontSize: 12 }}>
            {showForm ? "✕ Cancel" : "+ New FAQ"}
          </button>
        </div>

        {/* Create / prefill form */}
        {showForm && (
          <div className="panel-box" style={{ position: "relative", transform: "none", transition: "none", marginBottom: 32 }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 20 }}>
              {isPrefilled ? "Review & Publish AI Draft" : "Create FAQ"}
            </h2>

            {isPrefilled && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(74,144,196,0.06)", border: "1px solid rgba(74,144,196,0.2)", marginBottom: 16 }}>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "var(--sky)" }}>
                  ✦ PRE-FILLED FROM AI DRAFT — review and edit before publishing
                </p>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { key: "question", label: "Question", placeholder: "What is the hostel check-in process?" },
                { key: "category", label: "Category", placeholder: "Hostel" },
                { key: "source", label: "Source", placeholder: "IIT Ropar FAQ" },
                { key: "tags", label: "Tags (comma-separated)", placeholder: "hostel, accommodation" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label style={labelStyle}>{label}</label>
                  <input type="text" value={form[key as keyof typeof form]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder} style={inputStyle} />
                </div>
              ))}

              <div>
                <label style={labelStyle}>Answer</label>
                <textarea rows={5} value={form.answer}
                  onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
                  placeholder="Detailed answer…" style={{ ...inputStyle, resize: "none" }} />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setShowForm(false); setForm({ question: "", answer: "", category: "General", tags: "", source: "IIT Ropar FAQ" }); }}
                  style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, padding: "10px 18px", borderRadius: 10, border: "1px solid rgba(74,144,196,0.2)", background: "transparent", color: "var(--ink-soft)", cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={() => form.question && form.answer && createMut.mutate()}
                  disabled={!form.question || !form.answer || createMut.isPending}
                  className="apply-btn" style={{ fontSize: 12, flex: 1, justifyContent: "center", display: "flex" }}>
                  {createMut.isPending ? "Creating…" : "Publish FAQ →"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FAQ list */}
        {isLoading ? (
          <div className="empty-state" style={{ padding: "40px 0" }}><div className="empty-text">Loading…</div></div>
        ) : faqs.length === 0 ? (
          <div className="empty-state" style={{ padding: "40px 0" }}>
            <div className="empty-icon">◈</div>
            <div className="empty-text">No FAQs yet. Create the first one above.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {faqs.map((faq) => (
              <div key={faq._id} style={{ background: "#fff", border: "1px solid rgba(74,144,196,0.12)", borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.1em", padding: "2px 8px", borderRadius: 20, background: "rgba(74,144,196,0.08)", color: "var(--sky)", border: "1px solid rgba(74,144,196,0.2)" }}>
                    {faq.category}
                  </span>
                </div>
                <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>{faq.question}</p>
                <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {faq.answer}
                </p>
                {faq.tags?.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {faq.tags.map((t) => (
                      <span key={t} className="card-meta-tag" style={{ background: "rgba(74,144,196,0.08)", color: "var(--sky)" }}>{t}</span>
                    ))}
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

export default function AdminFAQsPage() {
  return (
    <Suspense fallback={
      <div className="empty-state" style={{ paddingTop: 120 }}>
        <div className="empty-text">Loading…</div>
      </div>
    }>
      <AdminFAQsContent />
    </Suspense>
  );
}
