"use client";
import BackgroundEffects from "@/components/BackgroundEffects";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", position: "relative", overflow: "hidden",
        background: "var(--page)",
      }}
    >
      <BackgroundEffects />
      <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 440, padding: "0 24px" }}>
        {children}
      </div>
    </div>
  );
}
