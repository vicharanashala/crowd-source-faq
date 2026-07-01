// ── Post Status ──────────────────────────────────────────────────
export const PostStatus = {
  OPEN: 'open',
  CLOSED: 'closed',
  RESOLVED: 'resolved',
} as const;

export type PostStatus = (typeof PostStatus)[keyof typeof PostStatus];

// ── Support Ticket Status ────────────────────────────────────────
export const SupportStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
  ESCALATED: 'escalated',
} as const;

export type SupportStatus = (typeof SupportStatus)[keyof typeof SupportStatus];

// ── Zoom Meeting Status ──────────────────────────────────────────
export const MeetingStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type MeetingStatus = (typeof MeetingStatus)[keyof typeof MeetingStatus];

// ── Freshness Tier ───────────────────────────────────────────────
export const FreshnessTier = {
  EVERGREEN: 'evergreen',
  SEASONAL: 'seasonal',
  VOLATILE: 'volatile',
} as const;

export type FreshnessTier = (typeof FreshnessTier)[keyof typeof FreshnessTier];

// ── Freshness Status ─────────────────────────────────────────────
export const FreshnessStatus = {
  VERIFIED: 'verified',
  UNDER_REVIEW: 'under_review',
  UPDATE_REQUESTED: 'update_requested',
  STALE: 'stale',
} as const;

export type FreshnessStatus = (typeof FreshnessStatus)[keyof typeof FreshnessStatus];

// ── User Tier ────────────────────────────────────────────────────
export const UserTier = {
  NEWCOMER: 'newcomer',
  CONTRIBUTOR: 'contributor',
  EXPERT: 'expert',
  MENTOR: 'mentor',
  KNOWLEDGE_MASTER: 'knowledge_master',
} as const;

export type UserTier = (typeof UserTier)[keyof typeof UserTier];
