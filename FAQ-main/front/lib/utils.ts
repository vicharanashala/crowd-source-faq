export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function truncate(str: string, len: number) {
  return str.length <= len ? str : str.slice(0, len) + "…";
}

// Deterministic bg class (1-6) by index in a row — matches reference i % BG_CLASSES.length
export function bgClass(index: number): string {
  return `card-bg-${(index % 6) + 1}`;
}

// Category → orb color (consistent, not random)
export const CATEGORY_ORB: Record<string, string> = {
  ACADEMICS: "rgba(74,144,196,0.7)",
  HOSTEL: "rgba(200,146,42,0.7)",
  SPORTS: "rgba(90,184,122,0.7)",
  RESEARCH: "rgba(155,89,182,0.7)",
  EVENTS: "rgba(230,126,34,0.7)",
  CULTURE: "rgba(233,30,99,0.7)",
  PLACEMENT: "rgba(0,188,212,0.7)",
  ADMINISTRATION: "rgba(96,125,139,0.7)",
  GENERAL: "rgba(74,144,196,0.7)",
};

export function orbColor(category: string): string {
  return CATEGORY_ORB[category?.toUpperCase()] || CATEGORY_ORB.GENERAL;
}

export const CATEGORIES = [
  "All","ACADEMICS","HOSTEL","SPORTS","RESEARCH",
  "EVENTS","CULTURE","PLACEMENT","ADMINISTRATION","GENERAL",
] as const;

export type Category = (typeof CATEGORIES)[number];
