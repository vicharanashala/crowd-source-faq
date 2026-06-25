"use client";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";
import Footer from "@/components/Footer";

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);

  if (!user || user.role !== "admin") {
    return (
      <>
        <div className="empty-state" style={{ paddingTop: 120 }}>
          <div className="empty-icon">⊘</div>
          <div className="empty-text">Admin access required.</div>
        </div>
        <Footer />
      </>
    );
  }

  const tiles = [
    { href: "/admin/faqs", icon: "◈", label: "Manage FAQs", desc: "Create and browse FAQ entries", color: "var(--sky)" },
    { href: "/admin/knowledge-base", icon: "⬆", label: "Knowledge Base", desc: "Upload CSVs and PDFs to AI vector store", color: "var(--gold)" },
    { href: "/admin/unanswered", icon: "◌", label: "Unanswered Queries", desc: "Review + draft answers for AI-unanswered questions", color: "var(--coral)" },
    { href: "/posts", icon: "≡", label: "All Posts", desc: "Moderate community discussions", color: "var(--muted)" },
    { href: "/admin/direct-questions", icon: "✉", label: "Direct Questions", desc: "Answer questions users sent straight to admins", color: "var(--coral)" },
    { href: "/admin/repetition-trends", icon: "⟲", label: "Repetition Trends", desc: "Questions repeated across discussions, ready to become FAQs", color: "var(--gold)" },
    { href: "/admin/users", icon: "⚙", label: "User Management", desc: "Search users, manage bans, view activity", color: "var(--muted)" },
    { href: "/admin/audit-log", icon: "▤", label: "Audit Log", desc: "History of admin actions across the platform", color: "var(--ink-soft)" },
  ];

  return (
    <>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "100px 80px 80px", position: "relative", zIndex: 2 }}>
        <div style={{ marginBottom: 40 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.12em", color: "var(--muted)" }}>ADMIN PANEL</span>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(28px,4vw,52px)", fontWeight: 300, color: "var(--ink)", letterSpacing: "-0.02em", marginTop: 4 }}>
            Dashboard
          </h1>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {tiles.map(({ href, icon, label, desc, color }) => (
            <Link key={href} href={href} style={{ textDecoration: "none", display: "block", padding: "24px 28px", borderRadius: 14, background: "#fff", border: "1px solid rgba(74,144,196,0.12)", transition: "transform 0.2s, box-shadow 0.2s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 40px rgba(15,28,46,0.1)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}>
              <span style={{ fontSize: 28, color, display: "block", marginBottom: 14, lineHeight: 1 }}>{icon}</span>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>{label}</h2>
              <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.6 }}>{desc}</p>
            </Link>
          ))}
        </div>
      </div>
      <Footer />
    </>
  );
}
