/**
 * CopyLinkButton.tsx — Reusable "copy URL to clipboard" button with a
 * success toast.
 *
 * Reuses the existing `Button` primitive rather than a bespoke <button>,
 * and mirrors the exact toast visual already used in `CommunityPage.tsx`
 * (fixed bottom-center, `bg-card border border-border shadow-float`) so
 * this doesn't introduce a second toast style into the app. No shared
 * `Toast` component exists yet in the codebase to import, so the toast
 * markup lives here, self-contained, matching that established pattern.
 *
 * No API calls — `navigator.clipboard` only.
 */

import React, { useState } from 'react';
import Button from '../../ui/Button';

export interface CopyLinkButtonProps {
  url: string;
  size?: 'sm' | 'md';
  label?: string;
  className?: string;
}

export default function CopyLinkButton({
  url,
  size = 'sm',
  label = 'Copy Link',
  className = '',
}: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for browsers/contexts without clipboard API permission.
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size={size}
        onClick={handleCopy}
        className={className}
        title="Copy link to clipboard"
      >
        <span aria-hidden="true">🔗</span>
        <span>{label}</span>
      </Button>

      {copied && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 bg-card border border-border rounded-xl text-xs text-ink font-medium shadow-float pointer-events-none">
          ✅ Link copied to clipboard
        </div>
      )}
    </>
  );
}
