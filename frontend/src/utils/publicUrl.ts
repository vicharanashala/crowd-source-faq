/**
 * Resolves the public-facing URL of this frontend.
 *
 * Priority:
 *   1. VITE_PUBLIC_URL env var (set in production / Vercel preview)
 *   2. window.location.origin (current host — works in dev, includes scheme + port)
 *
 * Use this anywhere we'd hardcode `http://localhost:5173` — those values break
 * the moment the app runs in a different environment (Vercel preview, prod,
 * staging, custom domain).
 */
export function getPublicUrl(): string {
  const fromEnv = (import.meta.env.VITE_PUBLIC_URL ?? '').toString().trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  // Last-resort fallback for SSR/test contexts
  return 'http://localhost:5173';
}
