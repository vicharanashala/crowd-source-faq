import React, { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, type User } from '../../hooks/useAuth';
import { useAuthModal } from '../../context/AuthModalContext';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import Input from '../ui/Input';
import Button from '../ui/Button';
import {
  authCloseButton,
  authHintSoft,
  authInfoBox,
  authInputIcon,
  authModalPanel,
  authTitle,
  inlineDangerBanner,
  modalShell,
  modalTitleRow,
  stackMd,
} from '../../styles/style_config';

/**
 * AuthModal — staff-only sign-in.
 *
 * Incident fix (2026-09-25): direct registration is closed platform-wide
 * (POST /api/auth/register always 403s) and direct login now rejects any
 * non-staff account — students must come exclusively through the
 * Samagama SSO bridge. This modal used to also offer a "Get started"
 * registration tab; that's removed since it could never succeed. What
 * remains is a single sign-in form for the staff (admin/moderator/
 * ai_moderator) accounts that still use it directly, plus a pointer to
 * Samagama for everyone else — a login attempt from a student account
 * still works technically (form submits) but the backend's 403 message
 * ("...sign in through Samagama") surfaces via the existing error banner.
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
  const { isOpen, closeModal, prompt } = useAuthModal();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [showLoginPwd, setShowLoginPwd] = useState(false);

  // "closing" keeps the DOM node alive through the fade-out animation so
  // sibling dialogs (e.g. CreatePostDialog) don't appear on top of the
  // fading backdrop. Once the animation timer expires, the component
  // returns null and the provider's closeModal is considered complete.
  const [closing, setClosing] = useState(false);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset transient state whenever the modal opens.
  useEffect(() => {
    if (isOpen) {
      setError('');
      setClosing(false);
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    }
  }, [isOpen]);

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


  return (
    <div
      className={modalShell}
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
        className={authModalPanel}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={modalTitleRow}>
          <div>
            <h2 id="auth-modal-title" className={authTitle}>
              Staff sign in
            </h2>
            {prompt && (
              <p className={authHintSoft}>{prompt}</p>
            )}
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className={authCloseButton}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18"/>
              <line x1="18" y1="6" x2="6" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Incident fix (2026-09-25): registration is closed platform-wide
            and direct login is staff-only now — students must use Samagama.
            This note replaces the old "Get started" registration tab. */}
        <div className={authInfoBox}>
          Are you a student? Sign in through{' '}
          <a href="https://samagama.in/" className="font-semibold underline">
            Samagama
          </a>{' '}
          instead — direct sign-in here is for staff accounts only.
        </div>

        <form onSubmit={handleLoginSubmit} className={stackMd} noValidate>
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
                className={authInputIcon}
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
            <p className={inlineDangerBanner}>
              {error}
            </p>
          )}
          <Button type="submit" loading={loading} className="w-full mt-1">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}