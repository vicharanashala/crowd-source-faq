import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { useAuth } from './AuthContext';
import { MagneticButton } from '../components/ui/Interactions';

const formVariants = {
  hidden: { opacity: 0, x: -40 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', damping: 25, stiffness: 300 } },
  exit: { opacity: 0, x: 40, transition: { duration: 0.15 } },
};

export default function LoginForm({ onSuccess, onSwitchToSignup, onClose }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      setSuccess(true);
      setTimeout(() => onSuccess(), 1400);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <motion.div
      variants={formVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="bg-[#fffdf9] border border-[#e2dccb] rounded-2xl shadow-xl overflow-hidden"
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-[#7c7260] hover:text-[#1c2333] transition-colors z-10"
      >
        <X size={18} />
      </button>

      <div className="px-8 pt-8 pb-7">
        {/* Logo & heading */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-[#1e2d3d] flex items-center justify-center">
            <img
              src="/meditation-logo.png"
              alt="Vicharanashala"
              className="h-7 w-auto object-contain"
            />
          </div>
          <h2 className="text-xl font-bold text-[#1c2333]" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
            Welcome Back
          </h2>
          <p className="text-sm text-[#7c7260] mt-1">
            Continue your Vicharanashala journey
          </p>
        </div>

        {/* Google button */}
        <button
          type="button"
          className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl border border-[#e2dccb] bg-white text-sm font-medium text-[#1c2333] hover:bg-[#f7f4ee] transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-[#e2dccb]" />
          <span className="text-xs text-[#9a9077] font-medium">or</span>
          <div className="flex-1 h-px bg-[#e2dccb]" />
        </div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
          >
            {error}
          </motion.div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-[#5b5447] mb-1.5">Email Address</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9a9077]" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#e2dccb] bg-white text-sm text-[#1c2333] placeholder:text-[#9a9077] focus:outline-none focus:border-[#c9a13b] focus:ring-1 focus:ring-[#c9a13b]/30 transition-colors"
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          {/* Password */}
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

          {/* Remember + Forgot */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[#e2dccb] text-[#c9a13b] focus:ring-[#c9a13b]/30"
              />
              <span className="text-xs text-[#7c7260]">Remember me</span>
            </label>
            <button type="button" className="text-xs text-[#c9a13b] hover:text-[#ad872f] font-medium transition-colors">
              Forgot Password?
            </button>
          </div>

          {/* Submit — WOW 13: success checkmark */}
          {success ? (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full py-2.5 rounded-xl btn-success text-white text-sm font-semibold flex items-center justify-center gap-2"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" className="check-animate" />
              </svg>
              Logged In
            </motion.div>
          ) : (
            <MagneticButton
              type="submit"
              disabled={loading}
              className="magnetic-btn-dark"
            >
              {loading ? 'Signing in…' : 'Login'}
            </MagneticButton>
          )}
        </form>

        {/* Switch to signup */}
        <p className="text-center text-xs text-[#7c7260] mt-5">
          Don't have an account?{' '}
          <button
            onClick={onSwitchToSignup}
            className="text-[#c9a13b] hover:text-[#ad872f] font-semibold transition-colors"
          >
            Create Account
          </button>
        </p>
      </div>
    </motion.div>
  );
}
