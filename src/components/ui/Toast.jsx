import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, X } from 'lucide-react';

const ToastContext = createContext({ showToast: () => {} });
export const useToast = () => useContext(ToastContext);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, { icon = '✓', duration = 3000 } = {}) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, icon }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed top-16 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 80, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.95, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              className="pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border border-[#e2dccb]/60"
              style={{
                background: 'rgba(255,253,249,0.85)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
            >
              <span className="text-[#c9a13b] text-sm flex-shrink-0">
                {t.icon === '✓' ? <CheckCircle2 size={16} /> : t.icon}
              </span>
              <span className="text-sm font-medium text-[#1c2333]">{t.message}</span>
              <button
                onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                className="text-[#9a9077] hover:text-[#1c2333] ml-2 transition-colors flex-shrink-0"
              >
                <X size={13} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
