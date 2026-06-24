import React, { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, type User } from '../../hooks/useAuth';
import { useAuthModal } from '../../context/AuthModalContext';
import Input from '../ui/Input';
import Button from '../ui/Button';

type Tab = 'signin' | 'register';

/**
 * AuthModal — single tabbed modal that combines Sign in + Get started.
 *
 * - Backdrop has a frosted blur over the page underneath.
 * - ESC key, click on backdrop, or successful submit all close it.
 * - On success, the parent AuthModalProvider detects the auth-state flip
 *   and replays any pending action that was stashed by useAuthGate().
 *
 * Closing: when asked to close the modal starts a fade-out animation
 * (controlled via the "closing" state + a 500ms timer). The DOM node
 * stays alive through the animation so sibling dialogs that open in
 * response don't render on top of the fading backdrop.
 */
export default function AuthModal() {
  const { isOpen, initialTab, closeModal, prompt } = useAuthModal();
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // "closing" keeps the DOM node alive through the fade-out animation so
  // sibling dialogs (e.g. CreatePostDialog) don't appear on top of the
  // fading backdrop. Once the animation timer expires, the component
  // returns null and the provider's closeModal is considered complete.
  const [closing, setClosing] = useState(false);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync the tab when the modal opens with a different starting tab.
  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setError('');
      setClosing(false);
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    }
  }, [isOpen, initialTab]);

  // ESC closes the modal.
  useEffect(() => {
    if (!isOpen && !closing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !closing) closeModal();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, closing, closeModal]);

  // Lock body scroll while the modal is open (or animating out).
  useEffect(() => {
    if (isOpen || closing) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [isOpen, closing]);

  // After the fade-out animation (500ms), truly unmount.
  // The provider's closeModal sets isOpen=false, which triggers this.
  useEffect(() => {
    if (!isOpen && !closing) return;
    if (!isOpen && closing) {
      closeTimerRef.current = setTimeout(() => {
        setClosing(false);
        closeTimerRef.current = null;
      }, 500);
      return () => {
        if (closeTimerRef.current) {
          clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
      };
    }
  }, [isOpen, closing]);

  // Start the closing animation. Called when the user dismisses the modal
  // (ESC, backdrop click, close button). Triggers isOpen=false in the
  // provider, which fires the pending action (e.g. open CreatePostDialog).
  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    closeModal(); // sets isOpen=false → provider fires pending action after 350ms
  };

  // Don't render until opened at least once; stay alive through closing
  // animation so sibling dialogs don't z-index above the fading backdrop.
  if (!isOpen && !closing) return null;

  const handleLoginChange = (e: ChangeEvent<HTMLInputElement>) => {
    setLoginForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleRegisterChange = (e: ChangeEvent<HTMLInputElement>) => {
    setRegisterForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Read directly from DOM first — browser autofill sets input values in the
    // DOM without firing React's onChange, so loginForm state can be empty even
    // when the user selected a saved credential. DOM values are always current.
    const form = (e.currentTarget as HTMLFormElement);
    const emailVal = (form.querySelector('input[name="email"]') as HTMLInputElement)?.value?.trim() || loginForm.email.trim();
    const passwordVal = (form.querySelector('input[name="password"]') as HTMLInputElement)?.value || loginForm.password;

    if (!emailVal || !passwordVal) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const loggedInUser: User = await login(emailVal, passwordVal);
      // v1.68 — smart routing after login:
      //   - if URL has ?next=/admin (came from /admin/login), honor it
      //   - else if the user is admin/moderator, send to /admin
      //   - else, stay where they were (no navigation)
      // (replaces the previous "one login that didn't go
      // anywhere" — the admin login page was just a visual
      // duplicate that submitted to the same endpoint.)
      const params = new URLSearchParams(location.search);
      const next = params.get('next');
      const isAdmin = loggedInUser.role === 'admin' || loggedInUser.role === 'moderator';
      if (next) {
        navigate(next, { replace: true });
      } else if (isAdmin) {
        navigate('/admin', { replace: true });
      }
      // Set closing=true + closeModal() — the sequence matters.
      // closing=true keeps the DOM alive (fade animation)
      // closeModal() sets isOpen=false so the provider's effect can detect
      // the state change and fire the pending action.
      setClosing(true);
      closeModal();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  const handleRegisterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!registerForm.name?.trim() || !registerForm.email || !registerForm.password) {
      setError('Please fill out all fields.');
      return;
    }
    if (registerForm.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (registerForm.password !== registerForm.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await register(
        registerForm.name.trim(),
        registerForm.email.trim(),
        registerForm.password
      );
      // Same as handleLoginSubmit — set closing=true + closeModal()
      // so the provider's effect sees the isOpen transition and fires the
      // pending action, while the fade animation plays out.
      setClosing(true);
      closeModal();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 animate-fade-in"
      style={{
        backgroundColor: 'rgba(15, 15, 15, 0.45)',
        backdropFilter: 'blur(14px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.4)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        className="w-full max-w-sm bg-card rounded-2xl border border-border shadow-card p-6 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 id="auth-modal-title" className="text-base font-serif text-ink">
              {tab === 'signin' ? 'Sign in' : 'Get started'}
            </h2>
            {prompt && (
              <p className="text-[11px] text-ink-soft mt-1">{prompt}</p>
            )}
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="w-7 h-7 flex items-center justify-center rounded-full text-ink-faint hover:text-ink hover:bg-black/[0.04] transition-colors -mt-1 -mr-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-full bg-mist mb-5">
          <button
            onClick={() => { setTab('signin'); setError(''); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-colors ${tab === 'signin' ? 'bg-card text-ink shadow-subtle' : 'text-ink-soft hover:text-ink'
              }`}
          >
            Sign in
          </button>
          <button
            onClick={() => { setTab('register'); setError(''); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-colors ${tab === 'register' ? 'bg-card text-ink shadow-subtle' : 'text-ink-soft hover:text-ink'
              }`}
          >
            Get started
          </button>
        </div>

        {tab === 'signin' ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
            <Input
              id="modal-login-email"
              name="email"
              type="email"
              label="Email"
              autoComplete="email"
              value={loginForm.email}
              onChange={handleLoginChange}
              placeholder="you@example.com"
              disabled={loading}
            />
            <Input
              id="modal-login-password"
              name="password"
              type="password"
              label="Password"
              autoComplete="current-password"
              value={loginForm.password}
              onChange={handleLoginChange}
              placeholder="••••••••"
              disabled={loading}
            />
            {error && (
              <p className="text-xs text-danger bg-danger-light border border-danger/15 rounded-xl px-3 py-2">
                {error}
              </p>
            )}
            <Button type="submit" loading={loading} className="w-full mt-1">
              Sign in
            </Button>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="space-y-4" noValidate>
            <Input
              id="modal-register-name"
              name="name"
              type="text"
              label="Full Name"
              autoComplete="name"
              value={registerForm.name}
              onChange={handleRegisterChange}
              placeholder="John Doe"
              disabled={loading}
            />
            <Input
              id="modal-register-email"
              name="email"
              type="email"
              label="Email"
              autoComplete="email"
              value={registerForm.email}
              onChange={handleRegisterChange}
              placeholder="you@example.com"
              disabled={loading}
            />
            <Input
              id="modal-register-password"
              name="password"
              type="password"
              label="Password"
              autoComplete="new-password"
              value={registerForm.password}
              onChange={handleRegisterChange}
              placeholder="••••••••"
              disabled={loading}
            />
            <p className="text-[10px] text-ink-faint -mt-2">Minimum 6 characters</p>
            <Input
              id="modal-register-confirm"
              name="confirmPassword"
              type="password"
              label="Confirm Password"
              autoComplete="new-password"
              value={registerForm.confirmPassword}
              onChange={handleRegisterChange}
              placeholder="••••••••"
              disabled={loading}
            />
            {error && (
              <p className="text-xs text-danger bg-danger-light border border-danger/15 rounded-xl px-3 py-2">
                {error}
              </p>
            )}
            <Button type="submit" loading={loading} className="w-full mt-1">
              Create account
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}