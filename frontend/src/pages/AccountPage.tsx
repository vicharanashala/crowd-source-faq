import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';

interface ZoomStatus {
  connected: boolean;
  connectedAt?: string;
  zoomUserId?: string;
}

export default function AccountPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // ─── Edit Profile ────────────────────────────────────────────────
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  // Sync form with current user data
  useEffect(() => {
    if (user) {
      setProfileForm({ name: user.name ?? '', email: user.email ?? '' });
    }
  }, [user]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileError('');
    setProfileSuccess('');
    try {
      const res = await api.patch<{ user: { id: string; name: string; email: string; role: string } }>('/auth/profile', {
        name: profileForm.name.trim(),
        email: profileForm.email.trim(),
      });
      // Update localStorage and reload user context
      const updatedUser = res.data.user;
      const stored = localStorage.getItem('yaksha_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        localStorage.setItem('yaksha_user', JSON.stringify({ ...parsed, ...updatedUser }));
      }
      setProfileSuccess('Profile updated successfully.');
      setEditingProfile(false);
      // Force a page reload to refresh auth context with new data
      setTimeout(() => window.location.reload(), 800);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setProfileError(axiosErr.response?.data?.message || 'Failed to update profile.');
    } finally {
      setProfileLoading(false);
    }
  };

  // ─── Change Password ────────────────────────────────────────────
  const [showPassword, setShowPassword] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwError, setPwError] = useState('');

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (pwForm.newPassword.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('Passwords do not match.');
      return;
    }

    setPwLoading(true);
    try {
      await api.put('/auth/password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwSuccess('Password changed successfully.');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => { setPwSuccess(''); setShowPassword(false); }, 3000);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setPwError(axiosErr.response?.data?.message || 'Failed to change password.');
    } finally {
      setPwLoading(false);
    }
  };

  // ─── Zoom Integration ───────────────────────────────────────────
  const [zoomStatus, setZoomStatus] = useState<ZoomStatus | null>(null);
  const [zoomLoading, setZoomLoading] = useState(false);
  const [zoomError, setZoomError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('zoom_connected') === '1') {
      setZoomStatus({ connected: true });
      window.history.replaceState({}, '', '/account');
    } else if (params.get('zoom_error')) {
      setZoomError(decodeURIComponent(params.get('zoom_error')!));
      window.history.replaceState({}, '', '/account');
    }
  }, []);

  const fetchZoomStatus = async () => {
    try {
      const res = await api.get<ZoomStatus>('/zoom/auth/status');
      setZoomStatus(res.data);
    } catch {
      setZoomStatus({ connected: false });
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchZoomStatus();
    }
  }, [user]);

  const handleConnectZoom = async () => {
    setZoomLoading(true);
    setZoomError(null);
    try {
      const res = await api.get<{ authUrl: string }>('/zoom/auth/connect');
      if (res.data.authUrl) {
        window.location.href = res.data.authUrl;
      }
    } catch {
      setZoomError('Could not connect to Zoom. Please try again.');
    } finally {
      setZoomLoading(false);
    }
  };

  const handleDisconnectZoom = async () => {
    if (!confirm('Disconnect your Zoom account? Your processed meetings will remain but won\'t update.')) return;
    setDisconnecting(true);
    try {
      await api.delete('/zoom/auth/disconnect');
      setZoomStatus({ connected: false });
    } catch {
      setZoomError('Failed to disconnect. Please try again.');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/'); };

  const zoomConnectedAt = zoomStatus?.connectedAt
    ? new Date(zoomStatus.connectedAt).toLocaleDateString()
    : null;

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      {/* pt-20 / pt-24 clears the fixed Navbar (h-14 on mobile, h-16 on sm+).
          Without it the "Account" heading sits behind the header. */}
      <div className="max-w-xl mx-auto px-4 pt-20 sm:pt-24 pb-8 sm:pb-10 space-y-6">
        {/* Page title + back */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">Account</h1>
            <p className="text-sm text-ink-faint mt-0.5">Manage your profile and integrations</p>
          </div>
          <button
            onClick={() => {
              // navigate(-1) is unsafe if the user landed on /account directly —
              // it can push them to about:blank or outside the SPA. Default to
              // home in that case.
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/');
              }
            }}
            className="flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Back
          </button>
        </div>

        {/* Profile card */}
        <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Profile</h2>
            {!editingProfile && (
              <button
                onClick={() => { setEditingProfile(true); setProfileSuccess(''); setProfileError(''); }}
                className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
              >
                Edit
              </button>
            )}
          </div>

          {!editingProfile ? (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-lg">
                {user?.name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div>
                <p className="font-medium text-ink">{user?.name ?? 'Unknown'}</p>
                <p className="text-sm text-ink-faint">{user?.email ?? ''}</p>
                <p className="text-xs text-ink-faint mt-0.5 capitalize">{user?.role ?? 'user'}</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleProfileSubmit} className="space-y-3">
              <Input
                id="edit-name"
                label="Full Name"
                value={profileForm.name}
                onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Your name"
                disabled={profileLoading}
              />
              <Input
                id="edit-email"
                label="Email"
                type="email"
                value={profileForm.email}
                onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com"
                disabled={profileLoading}
              />
              {profileError && (
                <p className="text-xs text-danger bg-danger-light border border-danger/15 rounded-xl px-3 py-2">
                  {profileError}
                </p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Button type="submit" loading={profileLoading} size="sm">
                  Save changes
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingProfile(false);
                    setProfileForm({ name: user?.name ?? '', email: user?.email ?? '' });
                    setProfileError('');
                  }}
                  disabled={profileLoading}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {profileSuccess && (
            <p className="text-xs text-success bg-success-light border border-success/15 rounded-xl px-3 py-2 animate-fade-in">
              {profileSuccess}
            </p>
          )}
        </div>

        {/* Change Password */}
        <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Security</h2>
            <button
              onClick={() => { setShowPassword(!showPassword); setPwError(''); setPwSuccess(''); }}
              className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
            >
              {showPassword ? 'Cancel' : 'Change password'}
            </button>
          </div>

          {!showPassword ? (
            <p className="text-sm text-ink-faint">Password last changed: unknown</p>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <Input
                id="current-password"
                label="Current Password"
                type="password"
                autoComplete="current-password"
                value={pwForm.currentPassword}
                onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
                placeholder="••••••••"
                disabled={pwLoading}
              />
              <Input
                id="new-password"
                label="New Password"
                type="password"
                autoComplete="new-password"
                value={pwForm.newPassword}
                onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                placeholder="••••••••"
                disabled={pwLoading}
              />
              <p className="text-[10px] text-ink-faint -mt-2">Minimum 6 characters</p>
              <Input
                id="confirm-new-password"
                label="Confirm New Password"
                type="password"
                autoComplete="new-password"
                value={pwForm.confirmPassword}
                onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                placeholder="••••••••"
                disabled={pwLoading}
              />
              {pwError && (
                <p className="text-xs text-danger bg-danger-light border border-danger/15 rounded-xl px-3 py-2">
                  {pwError}
                </p>
              )}
              {pwSuccess && (
                <p className="text-xs text-success bg-success-light border border-success/15 rounded-xl px-3 py-2 animate-fade-in">
                  {pwSuccess}
                </p>
              )}
              <Button type="submit" loading={pwLoading} size="sm">
                Update password
              </Button>
            </form>
          )}
        </div>

        {user?.role === 'admin' && (
          /* Zoom integration card */
          <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Zoom icon */}
                <div className="w-10 h-10 rounded-xl bg-[#2D8CFF]/10 flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M15.5 8.5l5-3v9l-5-3v-3z" fill="#2D8CFF"/>
                    <rect x="2" y="6" width="11" height="12" rx="2" stroke="#2D8CFF" strokeWidth="1.5" fill="none"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-ink">Zoom Integration</h2>
                  <p className="text-xs text-ink-faint mt-0.5">
                    {zoomStatus?.connected
                      ? `Connected · since ${zoomConnectedAt}`
                      : 'Connect to auto-import meeting transcripts'}
                  </p>
                </div>
              </div>

              {/* Connection badge */}
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                zoomStatus?.connected
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                  : 'bg-gray-100 text-gray-500 border border-gray-200'
              }`}>
                {zoomStatus?.connected ? 'Connected' : 'Not connected'}
              </span>
            </div>

            {/* Error message */}
            {zoomError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                {zoomError}
              </div>
            )}

            {/* Action button */}
            {zoomStatus?.connected ? (
              <button
                onClick={handleDisconnectZoom}
                disabled={disconnecting}
                className="w-full px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect Zoom'}
              </button>
            ) : (
              <button
                onClick={handleConnectZoom}
                disabled={zoomLoading}
                className="w-full px-4 py-2.5 rounded-xl bg-[#2D8CFF] text-white text-sm font-semibold hover:bg-[#1a78ef] active:bg-[#1560d4] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {zoomLoading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Redirecting to Zoom...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M15.5 8.5l5-3v9l-5-3v-3z" fill="white"/>
                      <rect x="2" y="6" width="11" height="12" rx="2" stroke="white" strokeWidth="1.5" fill="none"/>
                    </svg>
                    Connect Zoom Account
                  </>
                )}
              </button>
            )}

            <p className="text-xs text-ink-faint text-center">
              {zoomStatus?.connected
                ? 'Your Zoom account is linked. New recordings will auto-process.'
                : 'You\'ll be redirected to Zoom to authorize access to your recordings.'}
            </p>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full px-4 py-2.5 rounded-xl border border-border text-ink text-sm font-medium hover:bg-cream transition-all"
        >
          Sign Out
        </button>

      </div>
      <Footer />
    </div>
  );
}
