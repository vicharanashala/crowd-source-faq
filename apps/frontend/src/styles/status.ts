/**
 * Status / semantic - Success / warning / danger / info, trust, and source badges.
 */

export const statusSuccess   = 'text-success bg-success-light border border-success/20';
export const statusWarning   = 'text-warning bg-warning-light border border-warning/20';
export const statusDanger    = 'text-danger bg-danger-light border border-danger/20';
export const statusInfo      = 'text-info bg-info-light border border-info/20';

export const badgeSuccess    = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-success/10 text-success border border-success/20';
export const badgeWarning    = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-warning/10 text-warning border border-warning/20';
export const badgeDanger     = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-danger/10 text-danger border border-danger/20';
export const badgeInfo       = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-info/10 text-info border border-info/20';
export const badgeNeutral    = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-mist text-ink-soft border border-border';

/* Trust / Source badges (TrustBadge / SourceBadge) */
export const trustBadgeBase      = 'ml-1.5 text-[11px] px-2 py-0.5 rounded-md border font-medium';
export const trustBadgeHigh      = 'bg-mist text-ink-soft border-border';                           /* Official */
export const trustBadgeExpert    = 'bg-accent/10 text-accent border-accent/30';                     /* Admin Approved */
export const trustBadgeMedium    = 'bg-success-light text-success border-success/30';                /* Community Approved */
export const trustBadgeLow       = 'bg-warning-light text-warning border-warning/30';                /* Community (low trust) */

export const sourceBadgeBase     = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider';
export const sourceBadgeCommunity = 'bg-info-light text-info border border-info/30';                 /* From Community */
export const sourceBadgeZoom     = 'bg-[#2D8CFF]/10 text-[#2D8CFF] border border-[#2D8CFF]/25';         /* From Meetings — BRAND ASSET */
export const sourceBadgeZoomCircle = 'bg-[#2D8CFF]/10 text-[#2D8CFF]';                                 /* Numbered circle variant of sourceBadgeZoom */
export const sourceBadgeExpert   = 'bg-accent/10 text-accent border border-accent/30';               /* Expert Verified */

/* Community Difficulty & Status Pills */
export const communityDifficultyEasy     = 'bg-success/10 text-success border border-success/30';
export const communityDifficultyModerate = 'bg-warning/10 text-warning border border-warning/30';
export const communityDifficultyHard     = 'bg-danger/10 text-danger border border-danger/30';

export const communityFirstResponder   = 'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-warning/10 border border-warning/30 text-warning text-[10px] font-bold';

export const communityStatusReported     = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger/10 border border-danger/30 text-danger text-xs font-semibold';
export const communityStatusOpen         = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 border border-warning/30 text-warning text-xs font-semibold';

export const communityPostSourceCommunity = 'bg-warning/10 text-warning border border-warning/30';
export const communityAiValidated         = 'bg-info/10 text-info border border-info/30';
export const communityAdminApproved       = 'bg-accent/10 text-accent border border-accent/30';
export const communityPillBase             = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold';

/**
 * Support status styling mapping (STATUS_STYLES).
 * Maps support statuses to theme-aware Tailwind classes.
 */
export const supportStatusStyles: Record<string, string> = {
  'Pending':   'bg-warning/15 text-warning border-warning/30',
  'In Review': 'bg-admin-blue/15 text-admin-blue border-admin-blue/30',
  'Resolved':  'bg-success/15 text-success border-success/30',
  'Rejected':  'bg-danger/15 text-danger border-danger/30',
};

// Centralized alias for direct STATUS_STYLES imports
export const STATUS_STYLES = supportStatusStyles;

/**
 * Golden ticket status styling mapping.
 */
export interface StatusStyleTuple {
  bg: string;
  text: string;
  label: string;
}

export const goldenStatusStyles: Record<string, StatusStyleTuple> = {
  'Resolved':  { bg: 'bg-accent/15', text: 'text-accent', label: 'Resolved' },
  'Rejected':  { bg: 'bg-danger/10', text: 'text-danger', label: 'Rejected' },
  'Pending':   { bg: 'bg-warning/10', text: 'text-warning', label: 'Pending' },
  'open':      { bg: 'bg-warning/10', text: 'text-warning', label: 'Pending' },
  'In Review': { bg: 'bg-accent/15', text: 'text-accent', label: 'In Review' },
  'closed':    { bg: 'bg-mist', text: 'text-ink-soft', label: 'Closed' },
};

export function getGoldenStatusStyle(status: string): StatusStyleTuple {
  return goldenStatusStyles[status] || { bg: 'bg-mist', text: 'text-ink-faint', label: status };
}

