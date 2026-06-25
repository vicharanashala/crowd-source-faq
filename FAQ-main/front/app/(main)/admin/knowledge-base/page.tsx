"use client";
import { useRef, useState } from "react";
import { aiApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import Link from "next/link";
import Footer from "@/components/Footer";

type State = "idle" | "uploading" | "success" | "error";

function UploadCard({ accept, label, icon, desc, onUpload, color }: {
  accept: string; label: string; icon: string; desc: string;
  onUpload: (file: File) => Promise<void>; color: string;
}) {
  const [state, setState] = useState<State>("idle");
  const ref = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setState("uploading");
    try {
      await onUpload(file);
      setState("success");
      toast.success(`${label} uploaded!`);
    } catch {
      setState("error");
      toast.error(`Upload failed — is the AI service running?`);
    }
  };

  return (
    <div style={{ background: "#fff", border: "1px solid rgba(74,144,196,0.12)", borderRadius: 14, padding: "28px 32px" }}>
      <div style={{ fontSize: 32, color, marginBottom: 16 }}>{icon}</div>
      <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>{label}</h2>
      <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.65, marginBottom: 20 }}>{desc}</p>

      <input ref={ref} type="file" accept={accept} style={{ display: "none", position: "absolute" }}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

      <button onClick={() => ref.current?.click()} disabled={state === "uploading"}
        className="apply-btn"
        style={{ fontSize: 12, opacity: state === "uploading" ? 0.7 : 1, background: `linear-gradient(135deg, ${color}aa, ${color})` }}>
        {state === "uploading" ? "Uploading…" : `Upload ${label}`}
      </button>

      {state === "success" && (
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#5ab87a", marginTop: 10, letterSpacing: "0.08em" }}>
          ✓ UPLOADED SUCCESSFULLY
        </p>
      )}
      {state === "error" && (
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "var(--coral)", marginTop: 10, letterSpacing: "0.08em" }}>
          ✕ UPLOAD FAILED — CHECK AI SERVICE
        </p>
      )}
    </div>
  );
}

export default function KnowledgeBasePage() {
  const user = useAuthStore((s) => s.user);

  if (!user || user.role !== "admin") {
    return (<><div className="empty-state" style={{ paddingTop: 120 }}><div className="empty-text">Admin access required.</div></div><Footer /></>);
  }

  return (
    <>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "100px 80px 80px", position: "relative", zIndex: 2 }}>
        <Link href="/admin" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--sky)", letterSpacing: "0.08em", textDecoration: "none", display: "inline-block", marginBottom: 28 }}>← ADMIN</Link>

        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(24px,3.5vw,44px)", fontWeight: 300, color: "var(--ink)", letterSpacing: "-0.02em", marginBottom: 12 }}>
          Knowledge Base
        </h1>
        <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, color: "var(--ink-soft)", marginBottom: 36, maxWidth: 520 }}>
          Upload files to populate the AI vector store. CSVs need <code>question</code> and <code>answer</code> columns. PDFs are chunked and embedded automatically.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          <UploadCard accept=".csv" label="FAQ CSV" icon="≡" color="#4a90c4" desc="Upload a CSV with question/answer columns to add to the FAQ knowledge base."
            onUpload={async (file) => { await aiApi.uploadFAQ(file); }} />
          <UploadCard accept=".pdf" label="PDF Document" icon="◻" color="#c8922a" desc="Upload PDFs (brochures, handbooks, policies) to index for AI search."
            onUpload={async (file) => { await aiApi.uploadPDF(file); }} />
        </div>
      </div>
      <Footer />
    </>
  );
}
