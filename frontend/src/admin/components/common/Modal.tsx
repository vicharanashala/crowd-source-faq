import React, { useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ModalProps { open: boolean; onClose: () => void; title?: string; children: ReactNode; maxWidth?: string; }

export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-xl' }: ModalProps) {
  useEffect(() => { if (open) document.body.style.overflow = 'hidden'; else document.body.style.overflow = ''; return () => { document.body.style.overflow = ''; }; }, [open]);
  useEffect(() => { const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-admin-bg/20" onClick={onClose} />
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }} transition={{ duration: 0.15, ease: 'easeOut' }} className={`relative w-full ${maxWidth} rounded-xl border border-white/5 bg-admin-card shadow-sm`}>
            {title && (
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <h2 className="text-sm font-semibold text-admin-text">{title}</h2>
                <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-admin-muted hover:text-admin-text hover:bg-admin-surface transition-colors">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}
            <div className="px-5 py-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
