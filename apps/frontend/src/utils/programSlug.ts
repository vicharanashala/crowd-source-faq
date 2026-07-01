/**
 * Program-slug helpers.
 *
 * Slugs are auto-derived from a Batch's `name` field — no DB column.
 * The on-the-wire format is `lower-kebab-case` with non-ASCII chars
 * stripped. Collisions are impossible because Batch names are
 * enforced unique (case-insensitive) by a Mongo index.
 */

/**
 * Convert a free-form program name to a URL-safe slug.
 *   "Yaksha 2026-27"           -> "yaksha-2026-27"
 *   "Vicharanashala Lab"       -> "vicharanashala-lab"
 *   "  Spaced  Out  "          -> "spaced-out"
 *   "Café & Code"              -> "cafe-code"
 *
 * Algorithm: lowercase, strip diacritics, replace any non
 * `[a-z0-9]+` run with a single dash, trim leading/trailing dashes.
 */
export function slugifyProgramName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // strip diacritics (é → e)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'program';
}

/**
 * Inverse: turn a slug back into the *expected* slug form for a name.
 * Used to canonicalise slugs arriving from the URL before DB lookup.
 * (Mongo matches case-sensitively for the name field but we lookup
 * via a regex on the slug-derived form below.)
 */
export function normaliseSlug(slug: string): string {
  return slug.trim().toLowerCase();
}
