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

// Reddit-style depth colors — each nesting level gets a distinct accent
export const DEPTH_COLORS = [
  'border-accent',
  'border-accent/40',
  'border-amber-400',
  'border-rose-400',
  'border-violet-400',
];

export const DEPTH_BARS = [
  'bg-accent',
  'bg-accent',
  'bg-amber-400',
  'bg-rose-400',
  'bg-violet-400',
];

export const LIFECYCLE_CONFIG: Record<string, { label: string; cls: string }> = {
  open:               { label: 'Open',              cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  answered:           { label: 'Solved',            cls: 'bg-accent/10 text-accent border-accent/30' },
  community_accepted: { label: 'Community ✓',       cls: 'bg-accent/10 text-accent border-accent/30' },
  ai_validated:       { label: 'AI Validated',      cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  admin_accepted:     { label: 'Admin Approved',    cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  converted_to_faq:   { label: 'Official FAQ',      cls: 'bg-stone-100 text-stone-700 border-stone-300' },
};

// Count total descendants recursively
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function countReplies(comment: any): number {
  const replies: any[] = comment.replies ?? [];
  return replies.length + replies.reduce((s, r) => s + countReplies(r), 0);
}