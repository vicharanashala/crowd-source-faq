/**
 * useToast — lightweight, self-contained toast (no provider needed).
 *
 * Mirrors the toast pattern already used in admin/pages/AdminFAQs.tsx
 * (ref-based auto-dismiss timer, framer-motion fade/slide) but exposes
 * it as a reusable hook so feature components don't each reimplement
 * the timer-cleanup logic.
 *
 * Usage:
 *   const { toast, showToast, ToastViewport } = useToast();
 *   showToast('Saved!', 'success');
 *   return <>{...}<ToastViewport /></>;
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export type ToastType = 'success' | 'warn' | 'error';
export interface ToastState {
  msg: string;
  type: ToastType;
}

const TOAST_CLASS: Record<ToastType, string> = {
  success: 'admin-toast-success',
  warn: 'admin-toast-warn',
  error: 'admin-toast-error',
};

export function useToast(durationMs = 3000) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, type: ToastType = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ msg, type });
    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, durationMs);
  }, [durationMs]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const ToastViewport = useCallback(() => (
    <AnimatePresence>
      {toast && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={`fixed top-4 right-4 z-[100] px-4 py-2.5 rounded-lg text-xs font-medium border shadow-card ${TOAST_CLASS[toast.type]}`}
        >
          {toast.msg}
        </motion.div>
      )}
    </AnimatePresence>
  ), [toast]);

  return { toast, showToast, ToastViewport };
}
