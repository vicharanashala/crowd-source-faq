import React, { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { getPublicUrl } from '../../utils/publicUrl';
import type { User } from '../../hooks/useAuth';

export default function AdminLogin() {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const { login } = useAdminAuth();
  const navigate = useNavigate();
  const publicUrl = getPublicUrl();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    // Read directly from DOM first — browser autofill sets input values in the
    // DOM without firing React's onChange, so `email`/`password` state can be
    // empty even when the user selected a saved credential.
    const form = e.currentTarget;
    const emailVal = (form.querySelector('input[name="email"]') as HTMLInputElement)?.value?.trim() || email.trim();
    const passwordVal = (form.querySelector('input[name="password"]') as HTMLInputElement)?.value || password;
    try {
      const user: User = await login(emailVal, passwordVal);
      if (!['admin', 'moderator'].includes(user.role as string)) {
        setError('Access denied. Admin privileges required.');
        return;
      }
      navigate('/admin');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #030307, #060614, #030307)' }}
    >
      {/* Ambient blobs */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full blur-3xl opacity-[0.06]"
        style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl opacity-[0.05]"
        style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }} />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', boxShadow: '0 0 32px rgba(139,92,246,0.4)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">Yaksha Admin</h1>
          <p className="text-sm text-white/30 mt-1">Sign in to your admin panel</p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-6"
          style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/40 mb-2">Email address</label>
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white/90 placeholder-white/20 outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(139,92,246,0.5)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/40 mb-2">Password</label>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white/90 placeholder-white/20 outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(139,92,246,0.5)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-200 relative overflow-hidden"
              style={{
                background: loading ? 'rgba(139,92,246,0.4)' : 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                boxShadow: loading ? 'none' : '0 0 20px rgba(139,92,246,0.35)',
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign in to Admin'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-white/20 mt-6">
          Admin access only. Unauthorized access is prohibited.
        </p>

        <p className="text-center mt-4">
          <Link
            to="/"
            className="text-xs text-white/30 hover:text-white/60 transition-colors underline underline-offset-2"
          >
            ← Goto Website
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
        <p className="text-center text-xs text-white/20 mt-6">
          Admin access only. Unauthorized access is prohibited.
        </p>

        <p className="text-center mt-4">
          <Link
            to="/"
            className="text-xs text-white/30 hover:text-white/60 transition-colors underline underline-offset-2"
          >
            ← Goto Website
          </Link>
        </p>
      </motion.div >
    </div >
  );
}
