import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Avatar from '../components/ui/Avatar';
import { useCloudinaryUpload } from '../hooks/useCloudinaryUpload';
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

  // ─── Avatar upload (Cloudinary) ──────────────────────────────────
  const { upload: uploadAvatar, uploading: avatarUploading, error: avatarUploadError } = useCloudinaryUpload('avatar');
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const [avatarError, setAvatarError] = useState('');
  const [avatarSuccess, setAvatarSuccess] = useState('');
  const handleAvatarPick = () => avatarFileInputRef.current?.click();
  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file twice still fires onChange.
    e.target.value = '';
    if (!file) return;
    setAvatarError('');
    setAvatarSuccess('');
    try {
      const asset = await uploadAvatar(file);
      const res = await api.patch<{ user: { id: string; name: string; email: string; role: string; avatar: { url: string; publicId: string } } }>('/auth/profile', {
        avatar: { url: asset.url, publicId: asset.publicId },
      });
      // Persist on localStorage so the navbar avatar updates on next render
      // (the auth context reads from localStorage on every page load).
      const stored = localStorage.getItem('yaksha_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        localStorage.setItem(
          'yaksha_user',
          JSON.stringify({ ...parsed, avatar: res.data.user.avatar })
        );
      }
      setAvatarSuccess('Profile picture updated.');
      // Force a reload so the auth context picks up the new avatar — same
      // pattern as the existing name/email save flow.
      setTimeout(() => window.location.reload(), 600);
    } catch (err: unknown) {
      setAvatarError((err as Error).message || 'Failed to upload avatar.');
    }
  };
  const handleAvatarRemove = async () => {
    setAvatarError('');
    setAvatarSuccess('');
    try {
      const res = await api.patch<{ user: { id: string; name: string; email: string; role: string; avatar: { url: string; publicId: string } | null } }>('/auth/profile', {
        avatar: null,
      });
      const stored = localStorage.getItem('yaksha_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        localStorage.setItem(
          'yaksha_user',
          JSON.stringify({ ...parsed, avatar: res.data.user.avatar })
        );
      }
      setAvatarSuccess('Profile picture removed.');
      setTimeout(() => window.location.reload(), 600);
    } catch (err: unknown) {
      setAvatarError((err as Error).message || 'Failed to remove avatar.');
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileError('');
    setProfileSuccess('');
    try {
      const res = await api.patch<{ user: { id: string; name: string; email: string; role: string; avatar?: { url: string; publicId: string } } }>('/auth/profile', {
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
  const [transcriptUploading, setTranscriptUploading] = useState(false);
  const [transcriptMsg, setTranscriptMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [transcriptMeetingId, setTranscriptMeetingId] = useState<string | null>(null);
  const [transcriptProgress, setTranscriptProgress] = useState<{ stage: string; percent: number; message: string } | null>(null);
  const [transcriptSelectedFile, setTranscriptSelectedFile] = useState<{ file: File; type: 'vtt' | 'txt' } | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const transcriptRef = useRef<HTMLInputElement>(null);
  const transcriptPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleTranscriptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so same file can be re-uploaded
    if (!file) return;
    setTranscriptMsg(null);
    setTranscriptUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post('/zoom/upload-transcript', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setTranscriptMsg({ type: 'ok', text: `Uploaded "${file.name}" — processing now. Check Admin → Zoom Insights for results.` });
      if (transcriptRef.current) transcriptRef.current.value = '';
    } catch (err: unknown) {
      setTranscriptMsg({ type: 'err', text: (err as Error).message || 'Upload failed. Try again.' });
    } finally {
      setTranscriptUploading(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/'); };

  // Poll progress while a transcript is processing
  useEffect(() => {
    if (!transcriptMeetingId) return;
    const poll = () => {
      api.get<{ stage: string; percent: number; message: string; status: string }>(
        `/zoom/meetings/${transcriptMeetingId}/progress`
      ).then(res => {
        setTranscriptProgress(res.data);
        if (res.data.status === 'completed' || res.data.status === 'done' || res.data.stage === 'done' || res.data.stage === 'failed') {
          setTranscriptMeetingId(null);
          if (res.data.stage === 'failed') {
            setTranscriptMsg({ type: 'err', text: res.data.message || 'Processing failed.' });
          } else {
            setTranscriptMsg({ type: 'ok', text: `Processing done — ${res.data.message}` });
          }
        } else {
          transcriptPollRef.current = setTimeout(poll, 2000);
        }
      }).catch(() => {
        transcriptPollRef.current = setTimeout(poll, 3000);
      });
    };
    poll();
    return () => { if (transcriptPollRef.current) clearTimeout(transcriptPollRef.current); };
  }, [transcriptMeetingId]);

  // Handle Process button — show confirmation modal
  const handleTranscriptProcess = useCallback(() => {
    if (!transcriptSelectedFile) return;
    const topic = (document.getElementById('transcript-topic') as HTMLInputElement)?.value?.trim();
    if (!topic) { setTranscriptMsg({ type: 'err', text: 'Add a meeting topic first.' }); return; }
    setShowProcessModal(true);
  }, [transcriptSelectedFile]);

  // Confirmed in modal — start upload
  const confirmTranscriptProcess = useCallback(() => {
    if (!transcriptSelectedFile) return;
    const topic = (document.getElementById('transcript-topic') as HTMLInputElement)?.value?.trim();
    setShowProcessModal(false);
    setTranscriptMsg(null);
    setTranscriptProgress({ stage: 'queued', percent: 0, message: 'Uploading…' });
    setTranscriptUploading(true);
    const form = new FormData();
    form.append('file', transcriptSelectedFile.file);
    form.append('meetingTopic', topic!);
    api.post('/zoom/upload-transcript', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(res => { setTranscriptMeetingId(res.data.meetingId); })
      .catch((err) => {
        setTranscriptMsg({ type: 'err', text: (err as Error).message || 'Upload failed.' });
        setTranscriptUploading(false);
      });
  }, [transcriptSelectedFile]);

  // Cancel selected file
  const handleTranscriptCancel = useCallback(() => {
    setTranscriptSelectedFile(null);
    setTranscriptProgress(null);
    setTranscriptMsg(null);
    if (transcriptRef.current) transcriptRef.current.value = '';
  }, []);

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
            <>
              <div className="flex items-center gap-4">
                <Avatar
                  name={user?.name}
                  src={user?.avatar?.url}
                  size="lg"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink truncate">{user?.name ?? 'Unknown'}</p>
                  <p className="text-sm text-ink-faint truncate">{user?.email ?? ''}</p>
                  <p className="text-xs text-ink-faint mt-0.5 capitalize">{user?.role ?? 'user'}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleAvatarFile}
                    className="hidden"
                  />
                  <button
                    onClick={handleAvatarPick}
                    disabled={avatarUploading}
                    className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
                  >
                    {avatarUploading ? 'Uploading…' : user?.avatar?.url ? 'Change photo' : 'Add photo'}
                  </button>
                  {user?.avatar?.url && (
                    <button
                      onClick={handleAvatarRemove}
                      className="text-[11px] text-ink-faint hover:text-danger transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {(avatarSuccess || avatarError || avatarUploadError) && (
                <p
                  className={`text-xs rounded-xl px-3 py-2 border ${
                    avatarError || avatarUploadError
                      ? 'text-danger bg-danger-light border-danger/15'
                      : 'text-success bg-success-light border-success/15'
                  }`}
                >
                  {avatarError || avatarUploadError || avatarSuccess}
                </p>
              )}
            </>
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
                    <rect x="2" y="6" width="11" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
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
                  ? 'bg-accent-light text-accent border border-accent/30'
                  : 'bg-mist text-ink-faint border border-border'
              }`}>
                {zoomStatus?.connected ? 'Connected' : 'Not connected'}
              </span>
            </div>

            {/* Error message */}
            {zoomError && (
              <div className="text-sm text-danger bg-danger-light border border-danger/30 rounded-xl px-4 py-2.5">
                {zoomError}
              </div>
            )}

            {/* Action button */}
            {zoomStatus?.connected ? (
              <button
                onClick={handleDisconnectZoom}
                disabled={disconnecting}
                className="w-full px-4 py-2.5 rounded-xl border border-danger/30 text-danger text-sm font-medium hover:bg-danger-light transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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

            {/* Manual transcript upload — robustness fallback when webhook fails */}
            {(zoomStatus?.connected || (user?.role === 'admin' || user?.role === 'moderator')) && (
              <div className="border-t border-border/40 pt-4 space-y-3.5">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-ink-faint" />
                  <p className="text-[11px] text-ink-faint">
                    If the webhook missed a meeting, upload the transcript manually.
                  </p>
                </div>

                {/* Topic field — always required */}
                <div>
                  <label className="text-[11px] text-ink-faint mb-1 block">Meeting topic *</label>
                  <input
                    id="transcript-topic"
                    type="text"
                    placeholder="e.g. Q3 Planning, Sprint Retro, Product Review…"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-bg text-sm text-ink placeholder-ink-faint/60 focus:outline-none focus:border-accent"
                  />
                </div>

                {/* File selector — choose a file first */}
                {transcriptProgress?.stage === 'done' ? (
                  // Upload done — show reset
                  <div className="flex items-center justify-between px-3 py-2 bg-accent-light border border-accent/30 rounded-xl">
                    <span className="text-xs text-accent">Done — {transcriptProgress.message}</span>
                    <button onClick={handleTranscriptCancel} className="text-[10px] text-accent hover:text-emerald-800 font-medium underline">Upload another</button>
                  </div>
                ) : transcriptMeetingId ? (
                  // Processing — show progress bar
                  <div className="px-3 py-2.5 bg-accent/5 border border-accent/20 rounded-xl">
                    <div className="flex items-center justify-between text-[11px] text-accent font-medium mb-1.5">
                      <span className="capitalize">{transcriptProgress?.stage}</span>
                      <span>{transcriptProgress?.percent}%</span>
                    </div>
                    <div className="h-1.5 bg-accent/15 rounded-full overflow-hidden mb-1.5">
                      <div className="h-full bg-accent rounded-full transition-all duration-700 ease-out" style={{ width: `${transcriptProgress?.percent ?? 0}%` }} />
                    </div>
                    <p className="text-[10px] text-accent/70">{transcriptProgress?.message}</p>
                  </div>
                ) : (
                  // File selected but not processed yet — show Process / Cancel
                  <div className="px-3 py-2.5 bg-accent/5 border border-accent/20 rounded-xl space-y-2">
                    <div className="flex items-center gap-2">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent flex-shrink-0">
                        <path d="M6 9V3M3 5l3 3 3-3M2 10h8"/>
                      </svg>
                      <span className="text-xs text-accent font-medium truncate">{transcriptSelectedFile?.file.name}</span>
                      <span className="text-[10px] text-accent/50 flex-shrink-0">.{transcriptSelectedFile?.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleTranscriptProcess}
                        disabled={transcriptUploading}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        Process
                      </button>
                      <button
                        onClick={handleTranscriptCancel}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-ink text-xs font-medium hover:bg-mist transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Hidden file inputs — trigger only on label click */}
                <div className="grid grid-cols-2 gap-2">
                  {/* VTT upload */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-ink-faint">Zoom VTT file</span>
                    <input
                      ref={transcriptRef}
                      type="file"
                      accept=".vtt,text/vtt"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        setTranscriptSelectedFile({ file, type: 'vtt' });
                        setTranscriptMsg(null);
                      }}
                      className="hidden"
                      id="transcript-upload-vtt"
                    />
                    <label
                      htmlFor="transcript-upload-vtt"
                      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl border border-accent/40 bg-accent/5 text-accent hover:bg-accent/10 hover:border-accent/60 text-xs font-medium cursor-pointer transition-all"
                    >
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9V3M3 5l3 3 3-3M2 10h8"/></svg>
                      Upload .vtt
                    </label>
                  </div>

                  {/* TXT upload */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-ink-faint">Plain text file</span>
                    <input
                      type="file"
                      accept=".txt,text/plain"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        setTranscriptSelectedFile({ file, type: 'txt' });
                        setTranscriptMsg(null);
                      }}
                      className="hidden"
                      id="transcript-upload-txt"
                    />
                    <label
                      htmlFor="transcript-upload-txt"
                      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl border border-accent/40 bg-accent/5 text-accent hover:bg-accent/10 hover:border-accent/60 text-xs font-medium cursor-pointer transition-all"
                    >
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9V3M3 5l3 3 3-3M2 10h8"/></svg>
                      Upload .txt
                    </label>
                  </div>
                </div>

                {transcriptMsg && (
                  <div className={`text-xs px-3 py-2 rounded-lg ${
                    transcriptMsg.type === 'ok'
                      ? 'bg-accent-light text-accent border border-accent/30'
                      : 'bg-danger-light text-danger border border-danger/30'
                  }`}>
                    {transcriptMsg.text}
                  </div>
                )}
              </div>
            )}
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
      {/* Process confirmation modal */}
      {showProcessModal && transcriptSelectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setShowProcessModal(false)} />
          <div className="relative bg-bg rounded-2xl shadow-2xl border border-border w-full max-w-sm p-6 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-ink">Process transcript?</h3>
              <p className="text-xs text-ink-faint mt-1">This will send the file to AI for FAQ extraction. This action cannot be undone.</p>
            </div>
            <div className="bg-cream rounded-xl px-3 py-2 space-y-1">
              <div className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent"><path d="M6 9V3M3 5l3 3 3-3M2 10h8"/></svg>
                <span className="text-xs text-ink font-medium truncate">{transcriptSelectedFile.file.name}</span>
              </div>
              <div className="text-[10px] text-ink-faint">
                Topic: {(document.getElementById('transcript-topic') as HTMLInputElement)?.value || '—'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={confirmTranscriptProcess}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Confirm & Process
              </button>
              <button
                onClick={() => setShowProcessModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-ink text-sm font-medium hover:bg-cream transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
