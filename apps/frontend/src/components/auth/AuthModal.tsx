import React, { useEffect, useState, useRef, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, type User } from '../../hooks/useAuth';
import { useAuthModal } from '../../context/AuthModalContext';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import api from '../../utils/api';
import Input from '../ui/Input';
import Button from '../ui/Button';

type Tab = 'signin' | 'register';

/**
 * Public registration-mode snapshot returned by
 *   GET /api/auth/registration-status
 * Drives the banner + submit-button gating in the register tab.
 */
interface RegistrationStatus {
  enabled: boolean;
  openForAll: boolean;
}

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
  const { isOpen, initialTab, closeModal, prompt, inviteToken } = useAuthModal();
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
  
  const [showLoginPwd, setShowLoginPwd] = useState(false);
  const [showRegPwd, setShowRegPwd] = useState(false);
  const [showRegConfirmPwd, setShowRegConfirmPwd] = useState(false);

  // v1.7x — Public registration-mode snapshot. Fetched when the modal
  // opens on the register tab so we can render the right banner copy
  // ("registration closed" / "invite required" / "open to everyone")
  // instead of forcing the user to submit and discover via a 403.
  // `null` until the first fetch resolves; `closed` (default) if the
  // endpoint is unreachable so we never accidentally allow submit
  // against a downed backend.
  const [regStatus, setRegStatus] = useState<RegistrationStatus | null>(null);
  // H9 — separate loading flag so we can show a spinner in the button
  // during the initial regStatus fetch (distinct from per-submit loading).
  const [regStatusLoading, setRegStatusLoading] = useState(true);

  // "closing" keeps the DOM node alive through the fade-out animation so
  // sibling dialogs (e.g. CreatePostDialog) don't appear on top of the
  // fading backdrop. Once the animation timer expires, the component
  // returns null and the provider's closeModal is considered complete.
  const [closing, setClosing] = useState(false);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // H6 — guard against Enter-key race: a rapid second Enter press
  // should be a no-op while the first submission is still in-flight.
  const submittedRef = useRef(false);

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

  // v1.7x — Fetch public registration status whenever the register
  // tab is the active tab and the modal is open. Re-fetch on tab flip
  // (signin → register) so we always have fresh data when the user
  // arrives at the form. Failure is treated as "closed" — better UX
  // than showing an empty form that silently 403s on submit.
  useEffect(() => {
    if (!isOpen || tab !== 'register') return;
    let cancelled = false;
    // H9 — mark loading true when we kick off a fresh fetch.
    // Default true so button is dead from the start; cleared on
    // first resolve OR on error (defaulting to closed).
    setRegStatusLoading(true);
    api
      .get<RegistrationStatus>('/auth/registration-status')
      .then((res) => {
        if (!cancelled) {
          setRegStatus(res.data);
          setRegStatusLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Default to closed on fetch failure so the submit button
          // stays disabled until the user retries or refreshes.
          setRegStatus({ enabled: false, openForAll: false });
          setRegStatusLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, tab]);

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
  useBodyScrollLock(isOpen || closing);

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
    if (!loginForm.email || !loginForm.password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const loggedInUser: User = await login(loginForm.email.trim(), loginForm.password);
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
    // H6 — guard against double-submit (Enter-key race).
    if (submittedRef.current) return;
    submittedRef.current = true;
    if (!registerForm.name?.trim() || !registerForm.email || !registerForm.password) {
      setError('Please fill out all fields.');
      submittedRef.current = false;
      return;
    }
    if (
      registerForm.password.length < 8 ||
      !/[A-Za-z]/.test(registerForm.password) ||
      !/[0-9]/.test(registerForm.password)
    ) {
      setError('Password must be at least 8 characters and include a letter and a number.');
      submittedRef.current = false;
      return;
    }
    if (registerForm.password !== registerForm.confirmPassword) {
      setError('Passwords do not match.');
      submittedRef.current = false;
      return;
    }
    setLoading(true);
    try {
      await register(
        registerForm.name.trim(),
        registerForm.email.trim(),
        registerForm.password,
        // v1.70 — pass the invite token if the user arrived via /?token=...
        // Captured by AuthModalProvider on mount. Backend validates; if
        // missing/invalid the gate returns 403 and the error message below.
        inviteToken ?? undefined
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
      submittedRef.current = false;
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
              <line x1="6" y1="6" x2="18" y2="18"/>
              <line x1="18" y1="6" x2="6" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-full bg-mist mb-5">
          <button
            onClick={() => { setTab('signin'); setError(''); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-colors ${
              tab === 'signin' ? 'bg-card text-ink shadow-subtle' : 'text-ink-soft hover:text-ink'
            }`}
          >
            Sign in
          </button>
          <button
            onClick={() => { setTab('register'); setError(''); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-colors ${
              tab === 'register' ? 'bg-card text-ink shadow-subtle' : 'text-ink-soft hover:text-ink'
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
              type={showLoginPwd ? 'text' : 'password'}
              label="Password"
              autoComplete="current-password"
              value={loginForm.password}
              onChange={handleLoginChange}
              placeholder="••••••••"
              disabled={loading}
              iconRight={
                <button
                  type="button"
                  onClick={() => setShowLoginPwd(!showLoginPwd)}
                  className="pointer-events-auto p-1 hover:text-ink transition-colors flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
                  aria-label={showLoginPwd ? "Hide password" : "Show password"}
                >
                  {showLoginPwd ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  )}
                </button>
              }
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
            {/* v1.7x — Registration-mode banner. Drives both the copy
                and whether the submit button is enabled. The banner is
                intentionally rendered above the inputs so a closed-mode
                visitor sees "registration closed" before they fill out
                a form that would 403. */}
            {regStatus && (
              <div
                className={[
                  'rounded-md px-3 py-2 text-[11px] border',
                  !regStatus.enabled
                    ? 'bg-red-50 border-red-200 text-red-900'
                    : regStatus.openForAll
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : inviteToken
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900',
                ].join(' ')}
                aria-live="polite"
              >
                {!regStatus.enabled ? (
                  <>
                    <span className="font-semibold">Registration is closed.</span>{' '}
                    New accounts are not being accepted right now.
                  </>
                ) : regStatus.openForAll ? (
                  <>
                    <span className="font-semibold">Open registration.</span>{' '}
                    Anyone can create an account — no invite link required.
                  </>
                ) : inviteToken ? (
                  <>
                    <span className="font-semibold">Invite link accepted.</span>{' '}
                    You arrived via an invite link, so registration is unlocked for you.
                  </>
                ) : (
                  <>
                    <span className="font-semibold">Invite required.</span>{' '}
                    Registration is invite-only — please use the link shared with you,
                    or ask an admin for one.
                  </>
                )}
              </div>
            )}
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
              type={showRegPwd ? 'text' : 'password'}
              label="Password"
              autoComplete="new-password"
              value={registerForm.password}
              onChange={handleRegisterChange}
              placeholder="••••••••"
              disabled={loading}
              iconRight={
                <button
                  type="button"
                  onClick={() => setShowRegPwd(!showRegPwd)}
                  className="pointer-events-auto p-1 hover:text-ink transition-colors flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
                  aria-label={showRegPwd ? "Hide password" : "Show password"}
                >
                  {showRegPwd ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  )}
                </button>
              }
            />
            <p className="text-[10px] text-ink-faint -mt-2">At least 8 characters, including a letter and a number</p>
            <Input
              id="modal-register-confirm"
              name="confirmPassword"
              type={showRegConfirmPwd ? 'text' : 'password'}
              label="Confirm Password"
              autoComplete="new-password"
              value={registerForm.confirmPassword}
              onChange={handleRegisterChange}
              placeholder="••••••••"
              disabled={loading}
              iconRight={
                <button
                  type="button"
                  onClick={() => setShowRegConfirmPwd(!showRegConfirmPwd)}
                  className="pointer-events-auto p-1 hover:text-ink transition-colors flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
                  aria-label={showRegConfirmPwd ? "Hide password" : "Show password"}
                >
                  {showRegConfirmPwd ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  )}
                </button>
              }
            />
            {error && (
              <p className="text-xs text-danger bg-danger-light border border-danger/15 rounded-xl px-3 py-2">
                {error}
              </p>
            )}
            <Button
              type="submit"
              // H9 — include regStatusLoading so the spinner appears while
              // the initial regStatus fetch is in flight (distinct from
              // per-submit loading).
              loading={loading || regStatusLoading}
              // Block submit while we don't yet know the registration
              // status (status fetch in flight) or when the gate is
              // closed. We still allow submit when invite-only + no
              // token — the backend returns a clear 403 with copy
              // matching the banner.
              disabled={loading || regStatus === null || !regStatus.enabled}
              className="w-full mt-1"
            >
              {regStatusLoading ? 'Loading…' : 'Create account'}
            </Button>
            <div className="mt-3 rounded-xl border border-border bg-mist px-3 py-2.5 text-center text-[11px] text-ink-soft">
              If you are Unable to Register, please ensure that you have joined the whatsapp group sent to you via mail
            </div>
          </form>
        )}
      </div>
    </div>
  );
}