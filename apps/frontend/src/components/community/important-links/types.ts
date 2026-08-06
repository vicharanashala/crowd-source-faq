/**
 * types.ts — Shared types for the Important Links module.
 *
 * No backend / API types here on purpose — this module only defines the
 * shape the UI expects. Whoever wires up persistence can map their API
 * response onto `ImportantLink` (or vice versa).
 */

export const IMPORTANT_LINK_CATEGORIES = [
  'Documentation',
  'GitHub',
  'Zoom',
  'Submission',
  'Learning',
  'Other',
] as const;

export type LinkCategory = (typeof IMPORTANT_LINK_CATEGORIES)[number];

export interface ImportantLink {
  id: string;
  /** Emoji or short glyph, consistent with the emoji-icon convention already used across the app (📌 ⭐ 🚩 etc). */
  icon: string;
  title: string;
  description: string;
  category: LinkCategory;
  url: string;
  /** Drives the "Official" badge on the card. */
  isOfficial?: boolean;
}

/** Payload shape for creating/editing a link — no `id`, that's assigned by whoever persists it. */
export type ImportantLinkDraft = Omit<ImportantLink, 'id'>;
