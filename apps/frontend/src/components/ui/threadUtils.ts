/**
 * Shared constants and helpers for ThreadDetail / CommentNode.
 * Extracted to reduce ThreadDetail.tsx from ~1008 lines.
 */

export const formatDate = (d: string | undefined) =>
  new Date(d ?? Date.now()).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

// Reddit-style depth colours — each nesting level gets the
// same accent token at decreasing opacity so deeper replies are
// visually de-emphasised without leaving the warm-sand palette.
export const DEPTH_COLORS = [
  'border-accent',
  'border-accent/40',
  'border-accent/30',
  'border-accent/20',
  'border-accent/10',
];

export const DEPTH_BARS = [
  'bg-accent',
  'bg-accent/80',
  'bg-accent/60',
  'bg-accent/40',
  'bg-accent/20',
];

export const LIFECYCLE_CONFIG: Record<string, { label: string; cls: string }> = {
  open:               { label: 'Open',              cls: 'bg-mist text-ink-soft border-border' },
  answered:           { label: 'Solved',            cls: 'bg-accent/10 text-accent border-accent/30' },
  community_accepted: { label: 'Community ✓',       cls: 'bg-accent/10 text-accent border-accent/30' },
  ai_validated:       { label: 'AI Validated',      cls: 'bg-info/10 text-info border-info/30' },
  admin_accepted:     { label: 'Admin Approved',    cls: 'bg-accent/10 text-accent border-accent/30' },
  converted_to_faq:   { label: 'Official FAQ',      cls: 'bg-mist text-ink-soft border-border' },
};

// Count total descendants recursively
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function countReplies(comment: any): number {
  const replies: any[] = comment.replies ?? [];
  return replies.length + replies.reduce((s, r) => s + countReplies(r), 0);
}