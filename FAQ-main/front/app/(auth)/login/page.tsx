"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    searchParams.get("banned") === "1"
      ? "Your account has been suspended. Contact an admin for help."
      : ""
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await authApi.login(form);
      setAuth(res.data.user, res.data.token);
      toast.success(`Welcome back, ${res.data.user.name}!`);
      router.push("/");
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: { error?: string; message?: string; reason?: string } } })?.response?.data;
      if (errData?.message === "Your account has been suspended.") {
        setError(`Your account has been suspended.${errData.reason ? ` Reason: ${errData.reason}` : ""}`);
      } else {
        setError(errData?.error || errData?.message || "Login failed");
      }
    } finally { setLoading(false); }
  };

  return (
    <div>
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 42, fontWeight: 300, color: "var(--ink)", letterSpacing: "-0.02em" }}>
          Vicharanashala
        </h1>
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: "var(--muted)", marginTop: 6 }}>
          IIT ROPAR · KNOWLEDGE HUB
        </p>
      </div>

      {/* Card — panel-box style from the reference */}
      <div className="panel-box" style={{ position: "relative", transform: "none", transition: "none" }}>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 24 }}>
          Sign in to your account
        </h2>

        <form onSubmit={handleSubmit}>
          {error && (
            <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "var(--coral)", marginBottom: 16,
              background: "rgba(212,95,74,0.08)", padding: "8px 12px", borderRadius: 8 }}>
              {error}
            </p>
          )}

          {[
            { label: "Email", key: "email", type: "email", placeholder: "you@iitrpr.ac.in" },
            { label: "Password", key: "password", type: "password", placeholder: "••••••••" },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9, letterSpacing: "0.12em", color: "var(--muted)",
                textTransform: "uppercase", marginBottom: 6 }}>
                {label}
              </label>
              <input
                type={type} required
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                style={{ width: "100%", fontFamily: "'Syne', sans-serif", fontSize: 13,
                  padding: "10px 14px", borderRadius: 10,
                  background: "rgba(74,144,196,0.05)",
                  border: "1px solid rgba(74,144,196,0.2)",
                  color: "var(--ink)", outline: "none" }}
              />
            </div>
          ))}

          <button
            type="submit" disabled={loading}
            className="apply-btn"
            style={{ width: "100%", marginTop: 8, padding: "12px 20px", justifyContent: "center",
              display: "flex", fontSize: 13, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Signing in…" : "Sign In →"}
          </button>
        </form>

        <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "var(--muted)", marginTop: 20, textAlign: "center" }}>
          New here?{" "}
          <Link href="/signup" style={{ color: "var(--sky)", textDecoration: "none", fontWeight: 600 }}>
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ textAlign: "center", paddingTop: 80 }}>
        <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, color: "var(--muted)" }}>Loading…</p>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
