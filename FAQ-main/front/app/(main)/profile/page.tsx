"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import Link from "next/link";

const TITLES = ["Undergraduate Scholar","Postgraduate Scholar","PhD Researcher","Faculty Member","Staff Member","Alumni"];

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();
  const [form, setForm] = useState({ name: user?.name || "", title: user?.title || "Undergraduate Scholar", bio: user?.bio || "", avatar: user?.avatar || "" });

  const mut = useMutation({
    mutationFn: () => authApi.updateProfile(form),
    onSuccess: (res) => { updateUser(res.data.user); toast.success("Profile updated!"); },
    onError: () => toast.error("Update failed"),
  });

  const inputStyle: React.CSSProperties = { width: "100%", fontFamily: "'Syne', sans-serif", fontSize: 13, padding: "10px 14px", borderRadius: 10, background: "rgba(74,144,196,0.05)", border: "1px solid rgba(74,144,196,0.2)", color: "var(--ink)", outline: "none" };
  const labelStyle: React.CSSProperties = { display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.12em", color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 };

  if (!user) return (
    <div className="empty-state" style={{ paddingTop: 120 }}>
      <div className="empty-text"><Link href="/login" style={{ color: "var(--sky)" }}>Sign in</Link> to view your profile.</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "100px 24px 80px", position: "relative", zIndex: 2 }}>
      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(28px,4vw,48px)", fontWeight: 300, color: "var(--ink)", letterSpacing: "-0.02em", marginBottom: 32 }}>
        Your Profile
      </h1>

      <div className="panel-box" style={{ position: "relative", transform: "none", transition: "none" }}>
        {/* Avatar + name preview */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid rgba(74,144,196,0.1)" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--sky)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
            {user.name[0].toUpperCase()}
          </div>
          <div>
            <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{user.name}</p>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "var(--muted)" }}>{user.email}</p>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, letterSpacing: "0.1em", padding: "2px 8px", borderRadius: 20, background: "rgba(74,144,196,0.1)", color: "var(--sky)", border: "1px solid rgba(74,144,196,0.25)", marginTop: 4, display: "inline-block" }}>
              {user.role.toUpperCase()}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Display Name</label>
          <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Role / Title</label>
          <select value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={inputStyle}>
            {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Avatar URL</label>
          <input type="url" value={form.avatar} onChange={(e) => setForm((f) => ({ ...f, avatar: e.target.value }))} placeholder="https://…" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Bio</label>
          <textarea rows={3} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} placeholder="A short bio…" style={{ ...inputStyle, resize: "none" }} />
        </div>

        <button onClick={() => mut.mutate()} disabled={mut.isPending} className="apply-btn"
          style={{ width: "100%", justifyContent: "center", display: "flex", fontSize: 13, opacity: mut.isPending ? 0.7 : 1 }}>
          {mut.isPending ? "Saving…" : "Save Changes →"}
        </button>
      </div>
    </div>
  );
}
