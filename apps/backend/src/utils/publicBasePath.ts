/**
 * publicBasePath — single source of truth for the application's
 * public URL base path.
 *
 * Why this exists:
 *   The app is mounted under `/csfaq` (frontend `base: '/csfaq/'` in
 *   vite.config.ts, backend `app.use('/csfaq/api', router)` and
 *   `app.use('/csfaq', express.static(frontendDistPath))` in
 *   bootstrap/app.ts). Every static asset — uploads, recordings,
 *   exported assets — must be served under that same prefix so
 *   browsers resolve them correctly when the app is hosted at
 *   `/csfaq/` rather than `/`.
 *
 *   Previously, code that generated asset URLs (e.g. orientation
 *   uploads, onboarding resource uploads) hardcoded
 *   `/uploads/...`. That works when the app is hosted at `/` but
 *   breaks the moment it's mounted under any subdirectory. The
 *   symptom was SVGs failing to load in production under `/csfaq/`.
 *
 * This helper:
 *   - Reads `PUBLIC_BASE_PATH` from the environment.
 *   - Falls back to `/csfaq` (the only deployment the backend
 *     currently supports — see `app.use('/csfaq/api', ...)`).
 *   - Returns a value that's safe to concatenate with a leading
 *     slash path (e.g. `/uploads/foo.png`).
 *
 * The corresponding frontend equivalent is `import.meta.env.BASE_URL`
 * (configured by Vite from `vite.config.ts` → `base: '/csfaq/'`).
 * The two are kept in sync by convention: deploy the frontend
 * under the same path that the backend serves its public files
 * from.
 *
 * Usage:
 *   import { publicBasePath, publicAssetUrl } from
 *     '../utils/publicBasePath.js';
 *
 *   const url = publicAssetUrl(`/uploads/onboarding-resources/...`);
 *   // → `/csfaq/uploads/onboarding-resources/...`
 *
 *   // Or when you need only the prefix:
 *   const base = publicBasePath(); // → `/csfaq`
 */
let cached: string | null = null;

/**
 * Return the public base path the app is mounted under. Always
 * starts and ends with `/` so callers can concatenate without
 * worrying about slashes. Empty string means "mounted at root"
 * (i.e. no prefix).
 *
 * Resolution:
 *   - If PUBLIC_BASE_PATH is set to a non-empty value → use it
 *     (with normalization: leading + trailing slash handling).
 *   - If PUBLIC_BASE_PATH is set to '' (empty string) → treat as
 *     "mounted at root", returns ''. This lets ops override the
 *     default at runtime.
 *   - If PUBLIC_BASE_PATH is unset (undefined) → fall back to the
 *     single supported default `/csfaq`.
 *
 * The empty-string-vs-undefined distinction is what makes the
 * "mounted at root" override actually work: setting
 * `PUBLIC_BASE_PATH=''` is the way to disable the prefix even when
 * the default would otherwise kick in.
 */
export function publicBasePath(): string {
  if (cached !== null) return cached;
  const envValue = process.env.PUBLIC_BASE_PATH;
  // Distinguish: unset (default to /csfaq) vs explicit empty
  // (mounted at root).
  let value: string;
  if (envValue === undefined) {
    value = '/csfaq';
  } else {
    value = envValue.trim();
  }
  cached = normalizeBasePath(value);
  return cached;
}

/**
 * Build a fully-qualified public URL for an asset path stored
 * in the database (e.g. `/uploads/onboarding-resources/<id>.svg`).
 *
 * - Strips a leading `/` from the asset so it concatenates
 *   cleanly with the base path.
 * - Returns a string that begins with `/<basePath>/uploads/...`
 *   when a base path is configured, or `/uploads/...` when
 *   the app is mounted at root.
 * - Never returns a value with a double slash between the base
 *   path and the asset path.
 */
export function publicAssetUrl(assetPath: string): string {
  const base = publicBasePath();
  const tail = assetPath.replace(/^\/+/, '');
  if (base === '') return `/${tail}`;
  return `${base}/${tail}`;
}

/**
 * Force-clear the cached base path. Useful in tests that flip the
 * env var between cases — production code never needs this.
 */
export function _resetPublicBasePathCache(): void {
  cached = null;
}

function normalizeBasePath(value: string): string {
  if (value === '' || value === '/') return '';
  let v = value.trim();
  // Strip trailing slashes (except when the value is just "/").
  while (v.length > 1 && v.endsWith('/')) v = v.slice(0, -1);
  // Ensure leading slash.
  if (!v.startsWith('/')) v = `/${v}`;
  return v;
}