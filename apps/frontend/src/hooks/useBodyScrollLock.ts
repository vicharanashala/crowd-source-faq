/**
 * useBodyScrollLock — stack-aware body scroll lock for modals.
 *
 * The naive pattern `useEffect(() => { document.body.style.overflow = 'hidden' },
 * [open])` has a cross-modal bug (H7 in audit-findings.md): when two
 * modals stack (e.g. AuthModal under a community modal), the child's
 * cleanup wipes the parent's lock. Same applies to stacking order in
 * any direction.
 *
 * This hook maintains a module-level refcount. The first lock saves
 * the previous overflow value and sets 'hidden'; subsequent locks
 * increment the count. The last unlock restores the saved value. This
 * means N stacked modals → exactly one body lock, regardless of which
 * one mounted first or unmounted last.
 *
 * Usage:
 *   function MyModal({ open, onClose }) {
 *     useBodyScrollLock(open);
 *     return <dialog>...</dialog>;
 *   }
 *
 * The dep array is `[open]` so toggling the prop without unmounting
 * correctly acquires/releases the lock. The effect runs once per
 * open transition (StrictMode-safe via the refcount, not via a guard).
 */

import { useEffect } from 'react';

// Module-level state — shared across all hook calls so stacking works.
let lockCount = 0;
let savedOverflow: string | null = null;

export function useBodyScrollLock(open: boolean): void {
  useEffect(() => {
    if (!open) return;

    if (lockCount === 0) {
      // First lock — save the existing value so we can restore it
      // when the last lock releases. Don't clobber if the page had
      // already set overflow via some other mechanism (e.g. iOS
      // rubber-band handling).
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount += 1;

    return () => {
      // Clamp at 0 in case of double-cleanup (StrictMode dev edge).
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        // Last lock released — restore the original value.
        document.body.style.overflow = savedOverflow ?? '';
        savedOverflow = null;
      }
    };
  }, [open]);
}
