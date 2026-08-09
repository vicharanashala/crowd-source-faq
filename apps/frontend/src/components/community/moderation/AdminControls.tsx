/**
 * AdminControls.tsx — Reusable admin/moderator action bar for Community
 * Moderation (Pin / Verify / Edit / Delete).
 *
 * - Renders nothing for non-admin/non-moderator users.
 * - Renders nothing itself; each action button only appears if the caller
 *   passes the matching callback prop. This lets the same component be
 *   reused for "pin only" surfaces (e.g. a compact card) and "full control"
 *   surfaces (e.g. a detail view) without conditional wrapping at the
 *   call site.
 * - No internal state, no API calls — every action is delegated to the
 *   parent via props, matching the pattern already used by
 *   ThreadBookmarkButton (`isBookmarked` + `onToggle`).
 * - Reuses the existing `Button` primitive (ghost/sm) rather than
 *   introducing new button styling.
 */

import React from 'react';
import Button from '../../ui/Button';
import { useAuth } from '../../../hooks/useAuth';

export interface AdminControlsProps {
  /**
   * Explicitly control visibility. If omitted, the component falls back
   * to checking the logged-in user's role via `useAuth()` (admin or
   * moderator). Passing this prop lets callers who already resolved the
   * role (e.g. inside an admin-only page) skip the extra check.
   */
  isAdmin?: boolean;

  /** Current pin/verify state, used only to flip button labels. */
  isPinned?: boolean;
  isVerified?: boolean;

  /** Only rendered when the matching callback is supplied. */
  onPin?: () => void;
  onVerify?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;

  size?: 'sm' | 'md';
  className?: string;
}

export default function AdminControls({
  isAdmin,
  isPinned = false,
  isVerified = false,
  onPin,
  onVerify,
  onEdit,
  onDelete,
  size = 'sm',
  className = '',
}: AdminControlsProps) {
  const { user } = useAuth();
  const resolvedIsAdmin =
    isAdmin ?? (user?.role === 'admin' || user?.role === 'moderator');

  if (!resolvedIsAdmin) return null;
  if (!onPin && !onVerify && !onEdit && !onDelete) return null;

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      {onPin && (
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={onPin}
          title={isPinned ? 'Unpin' : 'Pin'}
        >
          <span aria-hidden="true">📌</span>
          <span>{isPinned ? 'Unpin' : 'Pin'}</span>
        </Button>
      )}
      {onVerify && (
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={onVerify}
          title={isVerified ? 'Unverify' : 'Verify'}
        >
          <span aria-hidden="true">⭐</span>
          <span>{isVerified ? 'Unverify' : 'Verify'}</span>
        </Button>
      )}
      {onEdit && (
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={onEdit}
          title="Edit"
        >
          <span aria-hidden="true">✏️</span>
          <span>Edit</span>
        </Button>
      )}
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={onDelete}
          title="Delete"
          className="text-danger hover:bg-danger-light"
        >
          <span aria-hidden="true">🗑️</span>
          <span>Delete</span>
        </Button>
      )}
    </div>
  );
}
