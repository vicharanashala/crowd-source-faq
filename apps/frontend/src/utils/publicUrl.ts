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

/**
 * Resolves and normalizes an asset URL (e.g. `/uploads/...` or `/csfaq/uploads/...`)
 * to always include the correct base path prefix if it is a relative path.
 */
export function resolveAssetUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  // Strip leading slashes and ensure a single leading slash
  const cleanUrl = '/' + trimmed.replace(/^\/+/, '');
  
  // import.meta.env.BASE_URL is '/csfaq/' or '/'
  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl; // e.g. '/csfaq'
  
  if (normalizedBase && cleanUrl.startsWith('/uploads/') && !cleanUrl.startsWith(normalizedBase + '/')) {
    return `${normalizedBase}${cleanUrl}`;
  }
  return cleanUrl;
}

