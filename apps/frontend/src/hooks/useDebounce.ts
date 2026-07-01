/**
 * useDebounce — debounces a value by `delayMs`.
 *
 * Replaces four near-identical copies that were copy-pasted into
 * `AdminFAQs.tsx`, `AdminCommunity.tsx`, `AdminUsers.tsx`, and
 * `AdminUnresolvedSearch.tsx`. Centralised here so:
 *
 *   - one place to fix timer cleanup bugs (the audit found at least
 *     one copy that didn't clear the timeout on unmount);
 *   - one place to enforce consistent typing;
 *   - one place to add tests.
 *
 * Usage:
 *   const debouncedQuery = useDebounce(query, 300);
 *   useEffect(() => { fetch(debouncedQuery); }, [debouncedQuery]);
 *
 * Note: returns the *value* form, not a debouncer callback. If you
 * need the latter (e.g. to debounce an event handler), wrap your
 * handler with useMemoisedDebounce (not provided — YAGNI for now).
 */

import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
