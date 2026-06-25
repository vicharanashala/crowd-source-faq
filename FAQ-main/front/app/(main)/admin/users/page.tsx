"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatTimeAgo } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import Footer from "@/components/Footer";

interface UserRecord {
  _id: string;
  name: string;
  email: string;
  role: "student" | "staff" | "admin";
  avatar?: string;
  title?: string;
  isBanned?: boolean;
  banReason?: string;
  bannedAt?: string;
  createdAt: string;
}

const ROLE_PILLS = [
  { val: "", label: "All" },
  { val: "student", label: "Students" },
  { val: "staff", label: "Staff" },
  { val: "admin", label: "Admins" },
  { val: "banned", label: "Banned" },
];

const ROLE_COLORS: Record<string, string> = {
  student: "var(--sky)",
  staff: "var(--gold)",
  admin: "var(--coral)",
};

// Simple debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function UsersPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [searchInput, setSearchInput] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [banReasonMap, setBanReasonMap] = useState<Record<string, string>>({});
  const [expandedBanId, setExpandedBanId] = useState<string | null>(null);

  const searchQ = useDebounce(searchInput, 350);

  const queryParams = {
    search: searchQ || undefined,
    role: activeFilter && activeFilter !== "banned" ? activeFilter : undefined,
    banned: activeFilter === "banned" ? true : undefined,
  };

  const { data: users = [], isLoading } = useQuery<UserRecord[]>({
    queryKey: ["admin-users", searchQ, activeFilter],
    queryFn: () => usersApi.getAll(queryParams).then((r) => r.data),
    enabled: !!user && user.role === "admin",
  });

  const banMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      usersApi.ban(id, reason),
    onSuccess: (_, vars) => {
      toast.success("User banned");
      setExpandedBanId(null);
      setBanReasonMap((m) => ({ ...m, [vars.id]: "" }));
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to ban user";
      toast.error(msg);
    },
  });

  const unbanMut = useMutation({
    mutationFn: (id: string) => usersApi.unban(id),
    onSuccess: () => {
      toast.success("User unbanned");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => toast.error("Failed to unban user"),
  });

  const pillBase: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    letterSpacing: "0.1em",
    padding: "5px 14px",
    borderRadius: 20,
    cursor: "pointer",
    border: "1px solid rgba(74,144,196,0.2)",
    background: "transparent",
    color: "var(--ink-soft)",
    textTransform: "uppercase" as const,
    transition: "all 0.15s",
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: "'Syne', sans-serif",
    fontSize: 13,
    padding: "10px 14px",
    borderRadius: 10,
    background: "rgba(74,144,196,0.05)",
    border: "1px solid rgba(74,144,196,0.2)",
    color: "var(--ink)",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
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

        <div style={{ marginBottom: 24 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.12em", color: "var(--muted)" }}>
            USER MANAGEMENT
          </span>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(24px,3.5vw,44px)", fontWeight: 300, color: "var(--ink)", letterSpacing: "-0.02em", marginTop: 4 }}>
            Users
          </h1>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or email…"
            style={inputStyle}
          />
        </div>

        {/* Role filter pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {ROLE_PILLS.map(({ val, label }) => (
            <button
              key={val}
              onClick={() => setActiveFilter(val)}
              style={{
                ...pillBase,
                background: activeFilter === val ? "var(--sky)" : "transparent",
                color: activeFilter === val ? "#fff" : "var(--ink-soft)",
                borderColor: activeFilter === val ? "var(--sky)" : "rgba(74,144,196,0.2)",
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
        ) : users.length === 0 ? (
          <div className="empty-state" style={{ padding: "60px 0" }}>
            <div className="empty-icon">◎</div>
            <div className="empty-text">No users found.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {users.map((u) => (
              <div
                key={u._id}
                style={{
                  background: "#fff",
                  border: u.isBanned ? "1px solid rgba(212,95,74,0.25)" : "1px solid rgba(74,144,196,0.12)",
                  borderRadius: 14,
                  padding: "16px 20px",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                  {/* Avatar */}
                  {u.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.avatar} alt={u.name} style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: "var(--sky)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: "#fff" }}>
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                      <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                        {u.name}
                      </span>

                      {/* Role badge */}
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.1em", padding: "2px 8px", borderRadius: 20, background: `${ROLE_COLORS[u.role]}18`, color: ROLE_COLORS[u.role], border: `1px solid ${ROLE_COLORS[u.role]}40` }}>
                        {u.role}
                      </span>

                      {/* Banned badge */}
                      {u.isBanned && (
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.1em", padding: "2px 8px", borderRadius: 20, background: "rgba(212,95,74,0.1)", color: "var(--coral)", border: "1px solid rgba(212,95,74,0.3)" }}>
                          SUSPENDED
                        </span>
                      )}
                    </div>
                    <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, color: "var(--ink-soft)", marginBottom: 2 }}>
                      {u.email}
                    </p>
                    {u.isBanned && u.banReason && (
                      <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, color: "var(--coral)", marginBottom: 2 }}>
                        Reason: {u.banReason}
                      </p>
                    )}
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "var(--muted)", letterSpacing: "0.06em" }}>
                      Joined {formatTimeAgo(u.createdAt)}
                      {u.bannedAt ? ` · Banned ${formatTimeAgo(u.bannedAt)}` : ""}
                    </p>
                  </div>

                  {/* Actions */}
                  <div style={{ flexShrink: 0, display: "flex", gap: 8, alignItems: "flex-start" }}>
                    {u.role === "admin" ? (
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", padding: "5px 12px", borderRadius: 20, background: "rgba(212,95,74,0.08)", color: "var(--coral)", border: "1px solid rgba(212,95,74,0.2)" }}>
                        Admin
                      </span>
                    ) : u.isBanned ? (
                      <button
                        onClick={() => unbanMut.mutate(u._id)}
                        disabled={unbanMut.isPending}
                        className="apply-btn"
                        style={{ fontSize: 11, padding: "6px 14px", background: "rgba(90,184,122,0.1)", borderColor: "rgba(90,184,122,0.4)", color: "var(--ink-mid)" }}
                      >
                        Unban
                      </button>
                    ) : (
                      <button
                        onClick={() => setExpandedBanId(expandedBanId === u._id ? null : u._id)}
                        style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, padding: "6px 14px", borderRadius: 10, border: "1px solid rgba(212,95,74,0.3)", background: "transparent", color: "var(--coral)", cursor: "pointer" }}
                      >
                        {expandedBanId === u._id ? "Cancel" : "Ban"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline ban reason form */}
                {expandedBanId === u._id && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(74,144,196,0.1)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <textarea
                      rows={2}
                      value={banReasonMap[u._id] || ""}
                      onChange={(e) => setBanReasonMap((m) => ({ ...m, [u._id]: e.target.value }))}
                      placeholder="Reason for suspension (shown to user)…"
                      style={{ flex: 1, fontFamily: "'Syne', sans-serif", fontSize: 12, padding: "8px 12px", borderRadius: 10, background: "rgba(212,95,74,0.04)", border: "1px solid rgba(212,95,74,0.2)", color: "var(--ink)", outline: "none", resize: "none", minWidth: 200 }}
                    />
                    <button
                      onClick={() => banMut.mutate({ id: u._id, reason: banReasonMap[u._id] || "" })}
                      disabled={banMut.isPending}
                      className="apply-btn"
                      style={{ fontSize: 11, padding: "8px 16px", background: "rgba(212,95,74,0.1)", borderColor: "rgba(212,95,74,0.4)", color: "var(--coral)", alignSelf: "flex-start" }}
                    >
                      Confirm Ban
                    </button>
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
