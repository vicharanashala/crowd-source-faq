/**
 * CommunityToast.tsx — Shared success/info toast.
 *
 * Extracted after review: this exact fixed-bottom-center toast markup
 * already existed inline in `CommunityPage.tsx`, and was being copied a
 * second time into `CopyLinkButton`. Rather than let a third copy appear
 * the next time someone needs a toast, it's factored out here so
 * `CopyLinkButton` (and any future component in this module) can share
 * one implementation.
 *
 * `CommunityPage.tsx`'s own pre-existing toast was left as-is — it's
 * outside this module's ownership and changing it wasn't requested, so
 * touching it would be an unrelated change. Whoever owns that file can
 * migrate it to this component later if useful.
 *
 * `role="status"` + `aria-live="polite"` ensure screen-reader users get
 * the confirmation, not just sighted users.
 */

import React from 'react';

export interface CommunityToastProps {
  message: string;
  className?: string;
}

export default function CommunityToast({ message, className = '' }: CommunityToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 bg-card border border-border rounded-xl text-xs text-ink font-medium shadow-float pointer-events-none ${className}`}
    >
      {message}
    </div>
  );
}
