import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useAdminAuth } from '../hooks/useAdminAuth';
import adminApi from '../utils/adminApi';

interface ToastState { msg: string; type: 'success' | 'error'; }

function Toast({ toast }: { toast: ToastState }) {
  const c = toast.type === 'error' ? 'admin-toast-error' : 'admin-toast-success';
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

  return (
    <div className="space-y-5 max-w-xl">
      {toast && <Toast toast={toast} />}
      <p className="text-sm text-ink-faint -mt-2">Manage your profile</p>

      {/* Profile */}
      <div className="admin-card-surface">
        <div className="admin-card-header">
          <p className="text-sm font-semibold text-ink">Profile</p>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="w-12 h-12 rounded-full bg-mist border border-border flex items-center justify-center text-lg font-bold text-ink-soft">{user?.name?.[0]?.toUpperCase() ?? 'A'}</div>
            <div>
              <p className="text-sm font-semibold text-ink">{user?.name}</p>
              <p className="text-xs text-ink-faint">{user?.email}</p>
              <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded border border-border text-ink-faint capitalize">{user?.role}</span>
            </div>
          </div>
          <div>
            <label className="admin-label">Display Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="admin-input" />
          </div>
          <div>
            <label className="admin-label">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="admin-input" />
          </div>
          <button onClick={saveProfile} disabled={saving} className="admin-btn-primary">{saving ? 'Saving…' : 'Save Profile'}</button>
        </div>
      </div>

      {/* Password */}
      <div className="admin-card-surface">
        <div className="admin-card-header">
          <p className="text-sm font-semibold text-ink">Change Password</p>
        </div>
        <form onSubmit={changePassword} className="px-5 py-4 space-y-3">
          {[{ label: 'Current Password', key: 'current' as const }, { label: 'New Password', key: 'next' as const }, { label: 'Confirm Password', key: 'confirm' as const }].map(f => (
            <div key={f.key}>
              <label className="admin-label">{f.label}</label>
              <input type="password" value={passwords[f.key]} onChange={e => setPasswords(p => ({ ...p, [f.key]: e.target.value }))} placeholder="••••••••" className="admin-input" />
            </div>
          ))}
          <button type="submit" className="admin-btn-primary">Change Password</button>
        </form>
      </div>

      {/* Security info */}
      <div className="admin-card-surface">
        <div className="admin-card-header">
          <p className="text-sm font-semibold text-ink">Security</p>
        </div>
        <div className="px-5 py-4 space-y-2 text-sm text-ink-soft">
          <div className="flex items-center justify-between py-2 border-b border-border"><span>Session</span><span className="text-ink-faint">{user?.email}</span></div>
          <div className="flex items-center justify-between py-2"><span>Token expiry</span><span className="text-ink-faint">7 days</span></div>
          <p className="text-xs text-ink-faint pt-1">Tokens stored in localStorage. Use HTTPS in production.</p>
        </div>
      </div>
    </div>
  );
}
