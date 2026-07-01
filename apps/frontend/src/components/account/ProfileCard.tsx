/**
 * ProfileCard.tsx — Profile + avatar card for the Account page.
 *
 * Owns its own state for the edit form and the avatar upload. Reads the
 * current user from useAuth() and uses useCloudinaryUpload for the
 * avatar asset upload. On save, updates the auth context's localStorage
 * cache and triggers a window reload to refresh the navbar.
 *
 * Extracted from AccountPage.tsx (formerly the inlined "Profile" +
 * "Edit profile" + "Avatar" sections).
 */

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useGcsUpload } from '../../hooks/useGcsUpload';
import api from '../../utils/api';
import Avatar from '../ui/Avatar';
import Input from '../ui/Input';
import Button from '../ui/Button';

export default function ProfileCard() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const [avatarError, setAvatarError] = useState('');
  const [avatarSuccess, setAvatarSuccess] = useState('');

  const { upload: uploadAvatar, uploading: avatarUploading, error: avatarUploadError } = useGcsUpload('avatar');

  useEffect(() => {
    if (user) setForm({ name: user.name ?? '', email: user.email ?? '' });
  }, [user]);

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarError('');
    setAvatarSuccess('');
    try {
      const asset = await uploadAvatar(file);
      const res = await api.patch<{ user: { id: string; name: string; email: string; role: string; avatar: { url: string; gcsUri: string; objectPath: string } } }>('/auth/profile', {
        avatar: { url: asset.url, gcsUri: asset.gcsUri, objectPath: asset.objectPath },
      });
      const stored = localStorage.getItem('yaksha_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        localStorage.setItem(
          'yaksha_user',
          JSON.stringify({ ...parsed, avatar: res.data.user.avatar })
        );
      }
      setAvatarSuccess('Profile picture updated.');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.patch<{ user: { id: string; name: string; email: string; role: string; avatar?: { url: string; publicId: string } } }>('/auth/profile', {
        name: form.name.trim(),
        email: form.email.trim(),
      });
      const updatedUser = res.data.user;
      const stored = localStorage.getItem('yaksha_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        localStorage.setItem('yaksha_user', JSON.stringify({ ...parsed, ...updatedUser }));
      }
      setSuccess('Profile updated successfully.');
      setEditing(false);
      setTimeout(() => window.location.reload(), 800);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Profile</h2>
        {!editing && (
          <button
            onClick={() => {
              setEditing(true);
              setSuccess('');
              setError('');
            }}
            className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <>
          <div className="flex items-center gap-4">
            <Avatar name={user?.name} src={user?.avatar?.url} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-ink truncate">{user?.name ?? 'Unknown'}</p>
              <p className="text-sm text-ink-faint truncate">{user?.email ?? ''}</p>
              <p className="text-xs text-ink-faint mt-0.5 capitalize">{user?.role ?? 'user'}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarFile}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
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
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            id="edit-name"
            label="Full Name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Your name"
            disabled={saving}
          />
          <Input
            id="edit-email"
            label="Email"
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="you@example.com"
            disabled={saving}
          />
          {error && (
            <p className="text-xs text-danger bg-danger-light border border-danger/15 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
          {success && (
            <p className="text-xs text-success bg-success-light border border-success/15 rounded-xl px-3 py-2">
              {success}
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" loading={saving} size="sm">Save changes</Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                setForm({ name: user?.name ?? '', email: user?.email ?? '' });
                setError('');
              }}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
