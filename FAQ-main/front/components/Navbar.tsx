"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

interface NavbarProps {
  searchQ: string;
  onSearch: (val: string) => void;
}

export default function Navbar({ searchQ, onSearch }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const handleLogout = () => {
    logout();
    setProfileOpen(false);
    router.push("/login");
  };

  return (
    <nav className={`navbar${scrolled ? " scrolled" : ""}`}>
      {/* Logo */}
      <Link className="nav-logo" href="/">
        <div className="logo-mark">V</div>
        <span className="logo-text">Vicharanashala</span>
        <span className="logo-chip">IIT Ropar</span>
      </Link>

      {/* Center search */}
      <div className="nav-center">
        <div className="nav-search-wrap">
          <span className="nav-search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search FAQs…"
            autoComplete="off"
            value={searchQ}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Right side */}
      <div className="nav-right">
        <div className="nav-stat">
          <div className="stat-dot" />
          <span>Live</span>
        </div>

        {user ? (
          <div style={{ position: "relative" }}>
            <button
              className="apply-btn"
              style={{ display: "flex", alignItems: "center", gap: 6 }}
              onClick={() => setProfileOpen((v) => !v)}
            >
              {user.name.split(" ")[0]}
              <ChevronDown size={12} />
            </button>

            <AnimatePresence>
              {profileOpen && (
                <>
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 10 }}
                    onClick={() => setProfileOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      position: "absolute", right: 0, top: "calc(100% + 8px)",
                      width: 180, borderRadius: 12, zIndex: 20,
                      background: "rgba(255,255,255,0.96)",
                      border: "1px solid rgba(74,144,196,0.2)",
                      boxShadow: "0 8px 32px rgba(15,28,46,0.12)",
                      backdropFilter: "blur(20px)",
                      overflow: "hidden",
                    }}
                  >
                    {[
                      { href: "/posts", label: "Discussions" },
                      { href: "/faqs", label: "FAQs" },
                      { href: "/ask", label: "Ask" },
                      { href: "/profile", label: "Profile" },
                      { href: "/bookmarks", label: "Bookmarks" },
                      ...(user.role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
                    ].map(({ href, label }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setProfileOpen(false)}
                        style={{
                          display: "block", padding: "10px 16px",
                          fontFamily: "'Syne', sans-serif", fontSize: 12,
                          color: pathname === href ? "var(--sky)" : "var(--ink-mid)",
                          background: pathname === href ? "rgba(74,144,196,0.06)" : "transparent",
                          transition: "background 0.15s",
                          textDecoration: "none",
                        }}
                      >
                        {label}
                      </Link>
                    ))}
                    <button
                      onClick={handleLogout}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "10px 16px", fontFamily: "'Syne', sans-serif",
                        fontSize: 12, color: "var(--coral)", background: "transparent",
                        border: "none", borderTop: "1px solid rgba(74,144,196,0.1)",
                        cursor: "pointer",
                      }}
                    >
                      Sign Out
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <Link href="/login" className="apply-btn">
            Sign In →
          </Link>
        )}
      </div>
    </nav>
  );
}
