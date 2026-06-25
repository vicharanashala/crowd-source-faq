"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function FAB() {
  const pathname = usePathname();
  if (pathname === "/ai-chat") return null;

  return (
    <Link href="/ai-chat" className="fab" aria-label="Ask AI">
      <div className="fab-dot" />
      <span className="fab-text">✦ Ask AI</span>
    </Link>
  );
}
