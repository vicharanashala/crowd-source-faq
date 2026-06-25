"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

const TITLES = ["Undergraduate Scholar","Postgraduate Scholar","PhD Researcher","Faculty Member","Staff Member","Alumni"];

export default function SignupPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ name: "", email: "", password: "", title: "Undergraduate Scholar" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setError(""); setLoading(true);
    try {
      const res = await authApi.register(form);
      setAuth(res.data.user, res.data.token);
      toast.success(`Welcome, ${res.data.user.name}!`);
      router.push("/");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string; message?: string } } })
        ?.response?.data?.error || "Registration failed";
      setError(msg);
    } finally { setLoading(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", fontFamily: "'Syne', sans-serif", fontSize: 13,
    padding: "10px 14px", borderRadius: 10,
    background: "rgba(74,144,196,0.05)",
    border: "1px solid rgba(74,144,196,0.2)",
    color: "var(--ink)", outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9, letterSpacing: "0.12em", color: "var(--muted)",
    textTransform: "uppercase", marginBottom: 6,
  };

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 42, fontWeight: 300, color: "var(--ink)", letterSpacing: "-0.02em" }}>
          Vicharanashala
        </h1>
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: "var(--muted)", marginTop: 6 }}>
          IIT ROPAR · KNOWLEDGE HUB
        </p>
      </div>

      <div className="panel-box" style={{ position: "relative", transform: "none", transition: "none" }}>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 24 }}>
          Create your account
        </h2>

        <form onSubmit={handleSubmit}>
          {error && (
            <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "var(--coral)", marginBottom: 16,
              background: "rgba(212,95,74,0.08)", padding: "8px 12px", borderRadius: 8 }}>
              {error}
            </p>
          )}

          {[
            { label: "Full Name", key: "name", type: "text", placeholder: "Arjun Sharma" },
            { label: "Email", key: "email", type: "email", placeholder: "you@iitrpr.ac.in" },
            { label: "Password", key: "password", type: "password", placeholder: "Min. 6 characters" },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <label style={labelStyle}>{label}</label>
              <input type={type} required value={form[key as keyof typeof form]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder} style={inputStyle} />
            </div>
          ))}

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Role / Title</label>
            <select value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              style={{ ...inputStyle }}>
              {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <button type="submit" disabled={loading} className="apply-btn"
            style={{ width: "100%", marginTop: 8, padding: "12px 20px",
              justifyContent: "center", display: "flex", fontSize: 13, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Creating…" : "Create Account →"}
          </button>
        </form>

        <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "var(--muted)", marginTop: 20, textAlign: "center" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--sky)", textDecoration: "none", fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
