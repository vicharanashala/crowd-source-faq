import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Eye, EyeOff, Mail, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthContext';
import { MagneticButton } from '../components/ui/Interactions';
import { useToast } from '../components/ui/Toast';

const backdrop = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const modal = {
  hidden: { opacity: 0, scale: 0.92, y: 30 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', damping: 25, stiffness: 300 },
  },
  exit: { opacity: 0, scale: 0.92, y: 30, transition: { duration: 0.2 } },
};

export default function AdminLogin({ isOpen, onClose, onSuccess }) {
  const { adminLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { showToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await adminLogin(email, password);
      setSuccess(true);
      showToast('Logged In');
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1400);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError('');
    setEmail('');
    setPassword('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          variants={backdrop}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.div
            className="absolute inset-0 bg-[#1e2d3d]/70 backdrop-blur-sm"
            onClick={handleClose}
          />

          <motion.div
            className="relative w-full max-w-md bg-[#fffdf9] border border-[#e2dccb] rounded-2xl shadow-xl overflow-hidden"
            variants={modal}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-[#7c7260] hover:text-[#1c2333] transition-colors z-10"
            >
              <X size={18} />
            </button>

            <div className="px-8 pt-8 pb-7">
              <div className="text-center mb-6">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-[#1e2d3d] flex items-center justify-center">
                  <ShieldCheck size={22} className="text-amber-400" />
                </div>
                <h2 className="text-xl font-bold text-[#1c2333]" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
                  Admin Access
                </h2>
                <p className="text-sm text-[#7c7260] mt-1">
                  Authorized personnel only
                </p>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
                >
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#5b5447] mb-1.5">Admin Email</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9a9077]" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#e2dccb] bg-white text-sm text-[#1c2333] placeholder:text-[#9a9077] focus:outline-none focus:border-[#c9a13b] focus:ring-1 focus:ring-[#c9a13b]/30 transition-colors"
                      placeholder="admin@vicharanashala.org"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#5b5447] mb-1.5">Password</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9a9077]" />
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-[#e2dccb] bg-white text-sm text-[#1c2333] placeholder:text-[#9a9077] focus:outline-none focus:border-[#c9a13b] focus:ring-1 focus:ring-[#c9a13b]/30 transition-colors"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9a9077] hover:text-[#5b5447] transition-colors"
                    >
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {success ? (
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-full py-2.5 rounded-xl btn-success text-white text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" className="check-animate" />
                    </svg>
                    Access Granted
                  </motion.div>
                ) : (
                  <MagneticButton
                    type="submit"
                    disabled={loading}
                    className="magnetic-btn-dark"
                  >
                    {loading ? 'Verifying…' : 'Access Dashboard'}
                  </MagneticButton>
                )}
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
