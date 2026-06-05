import React, { useState, FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useAdminAuth } from '../hooks/useAdminAuth';
import adminApi from '../utils/adminApi';

interface ToastState { msg: string; type: 'success' | 'error'; }

function Toast({ toast }: { toast: ToastState }) {
  const c = toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700';
  return <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs font-medium border ${c}`}>{toast.msg}</motion.div>;
}

export default function AdminSettings() {
  const { user } = useAdminAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const saveProfile = async () => {
    setSaving(true);
    try { const res = await adminApi.patch('/auth/profile', { name, email }); showToast(res.data.message || 'Profile updated'); }
    catch (err) { const msg = ((err as { response?: { data?: { message?: string } } })?.response?.data?.message) ?? 'Failed'; showToast(msg, 'error'); }
    finally { setSaving(false); }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (passwords.next !== passwords.confirm) { showToast('Passwords do not match', 'error'); return; }
    if (passwords.next.length < 6) { showToast('Minimum 6 characters', 'error'); return; }
    setSaving(true);
    try { await adminApi.put('/auth/password', { currentPassword: passwords.current, newPassword: passwords.next }); showToast('Password changed'); setPasswords({ current: '', next: '', confirm: '' }); }
    catch (err) { const msg = ((err as { response?: { data?: { message?: string } } })?.response?.data?.message) ?? 'Failed'; showToast(msg, 'error'); }
    finally { setSaving(false); }
  };

  const inputCls = 'w-full px-3 py-2 rounded-md text-sm text-admin-text bg-admin-card border border-white/5 outline-none focus:border-admin-purple/50 transition-colors';

  return (
    <div className="space-y-5 max-w-xl">
      {toast && <Toast toast={toast} />}
      <div><h2 className="text-lg font-semibold text-admin-text">Settings</h2><p className="text-sm text-admin-muted mt-0.5">Manage your profile</p></div>

      {/* Profile */}
      <div className="bg-admin-card border border-white/5 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <p className="text-sm font-semibold text-admin-text">Profile</p>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-3 pb-4 border-b border-white/5">
            <div className="w-12 h-12 rounded-full bg-admin-surface flex items-center justify-center text-lg font-bold text-admin-muted">{user?.name?.[0]?.toUpperCase() ?? 'A'}</div>
            <div>
              <p className="text-sm font-semibold text-admin-text">{user?.name}</p>
              <p className="text-xs text-admin-muted">{user?.email}</p>
              <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded border border-white/5 text-admin-muted capitalize">{user?.role}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-admin-text mb-1">Display Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-admin-text mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
          </div>
          <button onClick={saveProfile} disabled={saving} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-admin-bg hover:bg-admin-surface disabled:opacity-40 transition-colors">{saving ? 'Saving…' : 'Save Profile'}</button>
        </div>
      </div>

      {/* Password */}
      <div className="bg-admin-card border border-white/5 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <p className="text-sm font-semibold text-admin-text">Change Password</p>
        </div>
        <form onSubmit={changePassword} className="px-5 py-4 space-y-3">
          {[{ label: 'Current Password', key: 'current' as const }, { label: 'New Password', key: 'next' as const }, { label: 'Confirm Password', key: 'confirm' as const }].map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-admin-text mb-1">{f.label}</label>
              <input type="password" value={passwords[f.key]} onChange={e => setPasswords(p => ({ ...p, [f.key]: e.target.value }))} placeholder="••••••••" className={inputCls} />
            </div>
          ))}
          <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-admin-bg hover:bg-admin-surface transition-colors">Change Password</button>
        </form>
      </div>

      {/* Security info */}
      <div className="bg-admin-card border border-white/5 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <p className="text-sm font-semibold text-admin-text">Security</p>
        </div>
        <div className="px-5 py-4 space-y-2 text-sm text-admin-text">
          <div className="flex items-center justify-between py-2 border-b border-white/5"><span>Session</span><span className="text-admin-muted">{user?.email}</span></div>
          <div className="flex items-center justify-between py-2"><span>Token expiry</span><span className="text-admin-muted">7 days</span></div>
          <p className="text-xs text-admin-muted pt-1">Tokens stored in localStorage. Use HTTPS in production.</p>
        </div>
      </div>
    </div>
  );
}
