import { useState, useEffect, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useAdminAuth } from '../hooks/useAdminAuth';
import adminApi from '../utils/adminApi';
// v1.70 — Controlled-registration admin UI (toggle + invite link).
import RegistrationControlCard from '../components/settings/RegistrationControlCard';

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

      {/* v1.65 — Global app settings (Golden Ticket knobs). Live in
          the admin's own /admin/settings page (not on /admin/features)
          because they're runtime tunables, not feature toggles. */}
      <GoldenTicketSettingsCard onSaved={showToast} />

      {/* v1.70 — Controlled-registration: admin-only toggle + invite
          link + regenerate button. The card manages its own state and
          calls /api/admin/registration-config directly. */}
      <RegistrationControlCard onSaved={showToast} />
    </div>
  );
}

/**
 * Settings card for the Golden Ticket tunables. Editable inline;
 * hits PUT /api/admin/settings with one key at a time. The card
 * shows the current value, an input, and a Save button — no fancy
 * table, just a focused editor for the two most-impactful knobs.
 */
function GoldenTicketSettingsCard({ onSaved }: { onSaved: (msg: string, type: 'success' | 'error') => void }): React.ReactElement {
  const [cooldownHours, setCooldownHours] = useState<number>(48);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminApi.get('/admin/settings');
        if (cancelled) return;
        setCooldownHours(res.data?.settings?.goldenCooldownHours ?? 48);
      } catch {
        onSaved('Failed to load Golden Ticket settings', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [onSaved]);

  const save = async (key: 'goldenCooldownHours', value: number): Promise<void> => {
    setSavingKey(key);
    try {
      await adminApi.put('/admin/settings', { key, value });
      onSaved('Saved', 'success');
    } catch (err) {
      const msg = ((err as { response?: { data?: { message?: string } } })?.response?.data?.message) ?? 'Save failed';
      onSaved(msg, 'error');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="admin-card-surface">
      <div className="admin-card-header">
        <p className="text-sm font-semibold text-ink">Golden Ticket</p>
        <p className="text-xs text-ink-faint mt-0.5">Spurti Points escalation tunables. Changes apply to new submissions immediately.</p>
      </div>
      <div className="px-5 py-4 space-y-5">
        <div>
          <label className="admin-label">Cooldown (hours)</label>
          <p className="text-xs text-ink-faint mb-2">
            How long a user must wait after a Golden Ticket is closed (by admin
            resolution OR rejection) before submitting another. This is the only
            post-submission consequence — no ban, no penalty, no extra SP
            deduction. Set to 0 to disable the cooldown entirely.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={720}
              step={1}
              value={cooldownHours}
              disabled={loading}
              onChange={(e) => setCooldownHours(Math.max(0, Math.min(720, Math.trunc(Number(e.target.value) || 0))))}
              className="admin-input w-32"
            />
            <button
              type="button"
              disabled={loading || savingKey === 'goldenCooldownHours'}
              onClick={() => save('goldenCooldownHours', cooldownHours)}
              className="admin-btn-primary"
            >
              {savingKey === 'goldenCooldownHours' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
