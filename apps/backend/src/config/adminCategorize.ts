/**
 * adminCategorize — derive criticality + category from a config key.
 *
 * Used by the admin config service when writing new values to decide:
 *   1. Whether the value must be encrypted at rest (critical = yes)
 *   2. Which UI bucket it falls into for the admin panel
 *   3. Whether the REST API requires a passphrase challenge (Phase 2)
 *
 * The heuristic is intentionally biased toward "critical = true" when
 * uncertain. False positives (marking non-critical as critical) just add
 * friction. False negatives (marking critical as non-critical) would let
 * an attacker change JWT_SECRET without a passphrase — unacceptable.
 *
 * Categories are derived from the key prefix. New categories can be
 * added without code changes by extending the prefix map.
 */

export type ConfigCategory =
  | 'auth'           // JWT secret, OAuth client secrets, encryption master
  | 'ai'             // API keys, model names, thresholds, provider priority
  | 'rate-limit'     // max/window per route
  | 'feature-flag'   // boolean toggles (goldenTicket, aiAutoAnswer, ...)
  | 'storage'        // GCS, Cloudinary, HF, etc.
  | 'integration'    // Zoom, Discord, OAuth redirect URIs (but NOT secrets)
  | 'logging'        // LOG_LEVEL, Sentry DSN
  | 'email'          // SMTP creds
  | 'connection'     // Mongo URI, Redis URL (no public-facing component)
  | 'general';       // fallback

export interface Categorization {
  isCritical: boolean;
  category: ConfigCategory;
}

// ── Explicit non-critical allowlist ─────────────────────────────────────────
//
// These suffixes mean "this value is meant to be public" regardless of the
// heuristic below. Adding a key here is the SAFE way to mark something as
// non-critical — it overrides the patterns.
const PUBLIC_SAFE_SUFFIXES = [
  'public_host',
  'public_url',
  'public_key',
  'callback_url',
  'redirect_uri',       // careful — callback URIs are NOT secret, but the path matters
];

// ── Critical patterns (substring match, case-insensitive) ───────────────────
//
// Order matters — first match wins. Each is a substring; we match `includes`
// style for human-readable rules. We don't use full regex because the
// per-key overrides here should be obvious.
const CRITICAL_PATTERNS: Array<{ pattern: string; reason: string }> = [
  { pattern: 'secret', reason: 'contains "secret"' },
  { pattern: 'api_key', reason: 'contains "api_key"' },
  { pattern: 'apikey', reason: 'contains "apikey"' },
  { pattern: '_key', reason: 'ends with "_key" (e.g. SERVICE_KEY)' },
  { pattern: 'private', reason: 'contains "private"' },
  { pattern: 'master_key', reason: 'contains "master_key"' },
  { pattern: 'token', reason: 'contains "token"' },
  { pattern: 'password', reason: 'contains "password"' },
  { pattern: 'passwd', reason: 'contains "passwd"' },
  { pattern: 'credential', reason: 'contains "credential"' },
];

// URI / connection-string detection — applied only when no PUBLIC_SAFE_SUFFIXES matched.
// MONGODB_URI, REDIS_URL, AMQP_URL etc. are critical because they expose
// infrastructure topology. PUBLISHED_HOST etc. are caught earlier and
// exempted. We match both `_uri` and `_url` because real-world env vars
// use both conventions.
const URI_PATTERNS = ['uri', 'url', 'connection_string', 'connectionstring'];

function isPublicSafe(keyLower: string): boolean {
  return PUBLIC_SAFE_SUFFIXES.some((suf) => keyLower.endsWith(suf));
}

function matchesUriPattern(keyLower: string): boolean {
  return URI_PATTERNS.some((p) =>
    keyLower.endsWith(p) || keyLower.endsWith(`_${p}`) || keyLower.includes(`_${p}_`)
  );
}

// ── Category derivation ──────────────────────────────────────────────────────
//
// First matching prefix wins. Add new categories by extending this table;
// no other code needs to change (categories are display-only).
const CATEGORY_PREFIXES: Array<{ prefix: string; category: ConfigCategory }> = [
  { prefix: 'jwt',            category: 'auth' },
  { prefix: 'oauth',          category: 'auth' },
  { prefix: 'encryption',     category: 'auth' },
  { prefix: 'mongodb',        category: 'connection' },
  { prefix: 'redis',          category: 'connection' },
  { prefix: 'mongo',          category: 'connection' },
  { prefix: 'anthropic',      category: 'ai' },
  { prefix: 'openai',         category: 'ai' },
  { prefix: 'xai',            category: 'ai' },
  { prefix: 'minimax',        category: 'ai' },
  { prefix: 'ai.',            category: 'ai' },
  { prefix: 'featureFlag.',   category: 'feature-flag' },
  { prefix: 'feature_flag',   category: 'feature-flag' },
  { prefix: 'rateLimit.',     category: 'rate-limit' },
  { prefix: 'rate_limit',     category: 'rate-limit' },
  { prefix: 'rateLimit',      category: 'rate-limit' },
  { prefix: 'gcs',            category: 'storage' },
  { prefix: 'cloudinary',     category: 'storage' },
  { prefix: 'huggingface',    category: 'storage' },
  { prefix: 'embedding',      category: 'ai' },
  { prefix: 'zoom',           category: 'integration' },
  { prefix: 'discord',        category: 'integration' },
  { prefix: 'log',            category: 'logging' },
  { prefix: 'sentry',         category: 'logging' },
  { prefix: 'email',          category: 'email' },
  { prefix: 'smtp',           category: 'email' },
];

function categorizeByKey(key: string): ConfigCategory {
  const k = key.toLowerCase();
  // Exact-prefix match wins (so 'ai.foo' goes to 'ai', not 'auth')
  for (const { prefix, category } of CATEGORY_PREFIXES) {
    if (k.startsWith(prefix) || k.startsWith(prefix.toLowerCase())) {
      return category;
    }
  }
  // Per-program scoping doesn't change the category
  // (program.<id>.jwt.secret is still 'auth')
  if (k.startsWith('program.')) {
    // Recurse on the portion after 'program.<id>.'
    const after = k.split('.').slice(2).join('.');
    if (after) return categorizeByKey(after);
  }
  return 'general';
}

/**
 * Decide whether a key is critical (needs encryption + passphrase) and
 * which UI bucket it belongs to. The two are independent — a key can be
 * non-critical but still in the 'ai' category, etc.
 */
export function categorize(key: string): Categorization {
  const k = key.toLowerCase();

  // Public-safe values are ALWAYS non-critical, regardless of other patterns.
  if (isPublicSafe(k)) {
    return { isCritical: false, category: categorizeByKey(key) };
  }

  // URI / connection strings: critical unless public-safe (already caught above).
  if (matchesUriPattern(k)) {
    return { isCritical: true, category: 'connection' };
  }

  // Critical substring patterns.
  for (const { pattern } of CRITICAL_PATTERNS) {
    if (k.includes(pattern)) {
      return { isCritical: true, category: categorizeByKey(key) };
    }
  }

  // No critical markers → non-critical.
  return { isCritical: false, category: categorizeByKey(key) };
}

/**
 * Convert a config key to the corresponding env-var name. The backend
 * reads `process.env.JWT_SECRET` not `process.env.jwt.secret`; this
 * helper bridges the dotted-key world to the SCREAMING_SNAKE env world.
 */
export function keyToEnvVar(key: string): string {
  return key.toUpperCase().replace(/\./g, '_');
}

/**
 * Parse a stringified env value into its likely runtime type. Numeric
 * values, booleans, JSON objects get coerced; everything else stays a string.
 */
export function parseEnvValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed);
  // JSON object/array
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { return JSON.parse(trimmed); } catch { return raw; }
  }
  return raw;
}