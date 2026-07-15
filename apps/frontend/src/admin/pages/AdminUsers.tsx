import { useEffect, useState, useCallback } from 'react'
import {
  adminBtnDanger,
  adminBtnOutline,
  adminBtnPrimary,
  adminBtnSmOutline,
  adminBtnSuccess,
  adminBtnWarn,
  adminInput,
  adminLabel,
  adminSearchInput,
  adminTextarea,
  modalBackdrop,
} from '../../styles/style_config';
import { AnimatePresence, motion } from 'framer-motion';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import adminApi from '../utils/adminApi';
import Badge from '../components/common/Badge';
import { useDebounce } from '../../hooks/useDebounce';


type UserRole = 'admin' | 'moderator' | 'user' | 'ai_moderator' | 'expert';
interface AdminUser { _id: string; name: string; email: string; role: UserRole; createdAt: string; updatedAt: string; points?: number; reputation?: number; tier?: string; positiveBadges?: Array<{ badgeId: { _id: string; name: string; slug: string; icon: string; description: string }; awardedAt?: string; reason?: string }>; negativeBadges?: Array<{ badgeId: { _id: string; name: string; slug: string; icon: string }; awardedAt?: string; reason?: string }>; isBanned?: boolean; suspendedUntil?: string; }
interface UsersApiResponse { users: AdminUser[]; total: number; pages: number; }

const TIER_COLORS: Record<string, string> = {
  newcomer:         'bg-border/40 text-ink-faint',
  contributor:      'bg-warning/10 text-warning',
  helper:           'bg-accent/10 text-accent',
  expert:           'bg-warning/15 text-warning',
  champion:         'bg-accent/10 text-accent',
  knowledge_master: 'bg-accent/10 text-accent',
};
const TIER_ICONS: Record<string, string> = {
  newcomer:         '🌱',
  contributor:      '🥉',
  helper:           '🥈',
  expert:           '🥇',
  champion:         '💎',
  knowledge_master: '👑',
};

function UserDetailModal({ user, onClose, onRefresh }: { user: AdminUser; onClose: () => void; onRefresh: () => void }) {
  useBodyScrollLock(true);

  const [warnModal, setWarnModal] = useState(false);
  const [suspendModal, setSuspendModal] = useState(false);
  const [banModal, setBanModal] = useState(false);
  const [suspendDuration, setSuspendDuration] = useState('7d');
  const [actionLoading, setActionLoading] = useState('');
  const [warnReason, setWarnReason] = useState('');
  const [suspendReason, setSuspendReason] = useState('');
  const [banReason, setBanReason] = useState('');

  const doAction = async (fn: () => Promise<void>, postAction?: () => void) => { setActionLoading('*'); try { await fn(); if (postAction) postAction(); onRefresh(); } catch { void 0 } finally { setActionLoading(''); } };

  const handleUnban    = () => doAction(async () => { await adminApi.post('/moderation/unban', { userId: user._id }); });
  const handleUnsuspend = () => doAction(async () => { await adminApi.post('/moderation/unsuspend', { userId: user._id }); });
  const handleWarn     = async () => { if (!warnReason) return; await doAction(async () => { await adminApi.post('/moderation/warn', { userId: user._id, reason: warnReason }); }); setWarnModal(false); setWarnReason(''); };
  const handleSuspend  = async () => { if (!suspendReason) return; await doAction(async () => { await adminApi.post('/moderation/suspend', { userId: user._id, reason: suspendReason, duration: suspendDuration }); }); setSuspendModal(false); setSuspendReason(''); };
  const handleBan      = async () => { if (!banReason) return; await doAction(async () => { await adminApi.post('/moderation/ban', { userId: user._id, reason: banReason }); }); setBanModal(false); setBanReason(''); };
  const handleSoftDelete = () => doAction(async () => { await adminApi.post('/moderation/soft-delete', { userId: user._id, reason: 'Admin soft delete' }); onClose(); });

  const tier = user.tier || 'newcomer';
  const posBadges = user.positiveBadges || [];
  const negBadges = user.negativeBadges || [];

  return (
    <>
      <div className={modalBackdrop} onClick={onClose}>
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg admin-modal-panel max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="admin-modal-header shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-mist border border-border flex items-center justify-center text-base font-semibold text-ink-soft">{user.name?.[0]?.toUpperCase()}</div>
              <div>
                <p className="text-sm font-semibold text-ink">{user.name}</p>
                <p className="text-xs text-ink-faint">{user.email}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Badge status={user.role === 'admin' ? 'admin' : user.role === 'moderator' ? 'moderator' : user.role === 'ai_moderator' ? 'moderator' : 'user'} label={user.role} />
              {user.isBanned && <span className="text-[10px] font-semibold admin-badge admin-badge-rejected">BANNED</span>}
              {user.suspendedUntil && new Date(user.suspendedUntil) > new Date() && <span className="text-[10px] font-semibold admin-badge admin-badge-pending">SUSPENDED</span>}
            </div>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Points', value: user.points ?? 0 },
                { label: 'Rep', value: user.reputation ?? 0 },
              ].map(s => (
                <div key={s.label} className="admin-stat-mini p-2.5 text-center">
                  <p className="text-base font-bold text-ink">{s.value}</p>
                  <p className="text-[10px] text-ink-faint mt-0.5">{s.label}</p>
                </div>
              ))}
              <div className="admin-stat-mini p-2.5 text-center">
                <span className={`inline-flex items-center gap-1 text-xs font-bold ${TIER_COLORS[tier] || ''} px-1.5 py-0.5 rounded`}>{TIER_ICONS[tier]} {tier}</span>
                <p className="text-[10px] text-ink-faint mt-0.5">Tier</p>
              </div>
              <div className="admin-stat-mini p-2.5 text-center">
                <p className="text-base font-bold text-ink">{posBadges.length}</p>
                <p className="text-[10px] text-ink-faint mt-0.5">Badges</p>
              </div>
            </div>

            {/* Tier progress */}
            <div>
              <p className="text-[10px] font-semibold text-ink-faint uppercase mb-1.5">Tier Progress</p>
              <div className="flex items-center gap-2">
                {['newcomer','contributor','helper','expert','champion','knowledge_master'].map((t, i, arr) => {
                  const thresholds: Record<string, number> = { newcomer: 0, contributor: 50, helper: 150, expert: 300, champion: 600, knowledge_master: 1000 };
                  const points = user.points ?? 0;
                  const pct = arr[i + 1] ? Math.min(100, Math.round(((points - thresholds[t]) / (thresholds[arr[i + 1]] - thresholds[t])) * 100)) : 100;
                  return (
                    <div key={t} className="flex-1">
                      <div className={`h-1.5 rounded-full ${TIER_COLORS[t]} ${t === tier ? '' : 'opacity-30'}`}>
                        {t === tier && <div className="h-full bg-current rounded-full" style={{ width: `${pct}%` }} />}
                      </div>
                      <p className="text-[9px] text-ink-faint mt-0.5 text-center">{TIER_ICONS[t]}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Positive badges */}
            {posBadges.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-ink-faint uppercase mb-1.5">Badges</p>
                <div className="flex flex-wrap gap-1.5">
                  {posBadges.map((b, i) => (
                    <div key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-success/10 border border-success/20 text-xs text-success">
                      <span>{b.badgeId?.icon ?? '🏅'}</span>
                      <span className="font-light">{b.badgeId?.name ?? 'Badge'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Negative badges */}
            {negBadges.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-ink-faint uppercase mb-1.5">Penalties</p>
                <div className="flex flex-wrap gap-1.5">
                  {negBadges.map((b, i) => (
                    <div key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-danger/10 border border-danger/20 text-xs text-danger">
                      <span>{b.badgeId?.icon ?? '⚠️'}</span>
                      <span className="font-light">{b.badgeId?.name ?? 'Penalty'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-ink-faint">Joined {new Date(user.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>

          {/* Action buttons */}
          <div className="admin-modal-footer shrink-0">
            {user.isBanned ? (
              <button onClick={handleUnban} disabled={!!actionLoading} className={`${adminBtnSuccess} px-3 py-1.5 text-xs`}>Unban</button>
            ) : (
              <>
                <button onClick={() => setWarnModal(true)} disabled={!!actionLoading} className="px-3 py-1.5 rounded-md text-xs font-medium bg-mist text-ink-soft hover:bg-border/50 disabled:opacity-50 transition-colors">Warn</button>
                <button onClick={() => setSuspendModal(true)} disabled={!!actionLoading} className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-warning hover:bg-warning/80 disabled:opacity-50 transition-colors">Suspend</button>
                <button onClick={() => setBanModal(true)} disabled={!!actionLoading} className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-danger hover:bg-danger/80 disabled:opacity-50 transition-colors">Ban</button>
              </>
            )}
            {user.suspendedUntil && new Date(user.suspendedUntil) > new Date() && (
              <button onClick={handleUnsuspend} disabled={!!actionLoading} className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-warning hover:bg-warning/80 disabled:opacity-50 transition-colors">Lift Suspension</button>
            )}
            <button onClick={handleSoftDelete} disabled={!!actionLoading || user.role === 'admin'} className="px-3 py-1.5 rounded-md text-xs text-danger border border-danger/30 hover:bg-danger/10 disabled:opacity-40 ml-auto transition-colors">Soft Delete</button>
            <button onClick={onClose} className={`px-3 py-1.5 rounded-md text-xs ${adminBtnOutline}`}>Close</button>
          </div>
        </motion.div>
      </div>

      {/* Warn Modal */}
      {warnModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setWarnModal(false)}>
          <div className="w-full max-w-xs admin-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header"><p className="text-sm font-semibold text-ink">Send Warning to {user.name}</p></div>
            <div className="admin-modal-body space-y-3">
              <div>
                <label className={`${adminLabel}`}>Reason</label>
                <textarea rows={3} value={warnReason} onChange={e => setWarnReason(e.target.value)} placeholder="Describe the violation…" className={`${adminTextarea}`} />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setWarnModal(false)} className={`${adminBtnOutline}`}>Cancel</button>
                <button onClick={handleWarn} disabled={!warnReason} className={`${adminBtnPrimary}`}>Send Warning</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Modal */}
      {suspendModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSuspendModal(false)}>
          <div className="w-full max-w-xs admin-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header"><p className="text-sm font-semibold text-ink">Suspend {user.name}</p></div>
            <div className="admin-modal-body space-y-3">
              <div>
                <label className={`${adminLabel}`}>Duration</label>
                <div className="flex flex-wrap gap-1.5">
                  {['1h','6h','24h','3d','7d'].map(d => (
                    <button key={d} onClick={() => setSuspendDuration(d)}
                      className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${suspendDuration === d ? 'border-accent bg-accent/10 text-accent' : 'border-border text-ink-soft hover:bg-mist'}`}>{d}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className={`${adminLabel}`}>Reason</label>
                <textarea rows={2} value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="Reason…" className={`${adminTextarea}`} />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setSuspendModal(false)} className={`${adminBtnOutline}`}>Cancel</button>
                <button onClick={handleSuspend} disabled={!suspendReason} className={`${adminBtnWarn}`}>Suspend</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ban Modal */}
      {banModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setBanModal(false)}>
          <div className="w-full max-w-xs admin-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header"><p className="text-sm font-semibold text-danger">Ban {user.name} permanently</p></div>
            <div className="admin-modal-body space-y-3">
              <p className="text-xs text-ink-faint">This user will be permanently banned and cannot access their account.</p>
              <div>
                <label className={`${adminLabel}`}>Reason (required)</label>
                <textarea rows={3} value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Detailed reason…" className={`${adminTextarea}`} />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setBanModal(false)} className={`${adminBtnOutline}`}>Cancel</button>
                <button onClick={handleBan} disabled={!banReason} className={`${adminBtnDanger}`}>Ban User</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RoleModal({ user, onClose, onUpdated }: { user: AdminUser; onClose: () => void; onUpdated: (u: AdminUser) => void }) {
  useBodyScrollLock(true);

  const [role, setRole] = useState<UserRole>(user.role);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const handleSave = async () => { if (role === user.role) { onClose(); return; } setLoading(true); setError(''); try { const res = await adminApi.patch<{ user: AdminUser }>(`/auth/users/${user._id}/role`, { role }); onUpdated({ ...user, role: res.data.user.role }); onClose(); } catch (err) { setError(((err as { response?: { data?: { message?: string } } })?.response?.data?.message) ?? 'Failed'); } finally { setLoading(false); } };
  return (
    <div className={modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm admin-modal-panel">
        <div className="admin-modal-header">
          <p className="text-sm font-semibold text-ink">Change Role</p>
          <p className="text-xs text-ink-faint mt-0.5">{user.name} · {user.email}</p>
        </div>
        <div className="admin-modal-body space-y-1.5">
          {(['admin', 'moderator', 'user', 'ai_moderator'] as UserRole[]).map(r => (
            <label key={r} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer border transition-all text-sm ${role === r ? 'border-accent bg-accent/10 text-ink' : 'border-border text-ink-soft hover:bg-mist'}`}>
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="accent-[rgb(var(--accent-rgb))]" />
              <span className="capitalize font-light">{r.replace('_', ' ')}</span>
            </label>
          ))}
        </div>
        {error && <p className="px-5 pb-2 text-xs text-danger">{error}</p>}
        <div className="admin-modal-footer">
          <button onClick={onClose} disabled={loading} className={`flex-1 py-2 rounded-lg text-sm ${adminBtnOutline}`}>Cancel</button>
          <button onClick={handleSave} disabled={loading || role === user.role} className={`flex-1 py-2 rounded-lg text-sm font-medium ${adminBtnPrimary}`}>{loading ? 'Saving…' : 'Save'}</button>
        </div>
      </motion.div>
    </div>
  );
}

function DeleteModal({ user, onClose, onDeleted }: { user: AdminUser; onClose: () => void; onDeleted: (id: string) => void }) {
  useBodyScrollLock(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const handleDelete = async () => { setLoading(true); setError(''); try { await adminApi.delete(`/auth/users/${user._id}`); onDeleted(user._id); onClose(); } catch (err) { setError(((err as { response?: { data?: { message?: string } } })?.response?.data?.message) ?? 'Failed'); } finally { setLoading(false); } };
  return (
    <div className={modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xs admin-modal-panel">
        <div className="admin-modal-body">
          <p className="text-sm font-semibold text-ink">Delete User</p>
          <p className="text-xs text-ink-faint mt-1">Remove <span className="text-ink">{user.name}</span>? Cannot be undone.</p>
        </div>
        {error && <p className="px-5 pb-2 text-xs text-danger">{error}</p>}
        <div className="admin-modal-footer">
          <button onClick={onClose} disabled={loading} className={`flex-1 py-2 rounded-lg text-sm ${adminBtnOutline} transition-colors`}>Cancel</button>
          <button onClick={handleDelete} disabled={loading} className={`flex-1 py-2 rounded-lg text-sm font-medium ${adminBtnDanger} transition-colors`}>{loading ? 'Deleting…' : 'Delete'}</button>
        </div>
      </motion.div>
    </div>
  );
}

// v1.85 — admin-initiated password reset. The backend (PUT
// /api/auth/users/:id/password) returns 403 when the target user
// is an admin — we hide the button for admins in the table row, so
// the UI matches the server's hard floor. Visible feedback on
// success: toast + the modal closes; on 4xx/5xx the error
// message is shown inline. Min 8 chars + at least one letter + at
// least one number (matches the backend's passwordPolicy). Live
// strength hint guides the admin; "Show" toggle handles the
// shoulder-surfing case.
function ResetPasswordModal({ user, onClose, onReset }: { user: AdminUser; onClose: () => void; onReset: (u: AdminUser) => void }) {
  useBodyScrollLock(true);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Live strength hint — same rules the backend enforces.
  // Returns 0..4. Rendered as a 4-segment bar + a word.
  const score = (() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[A-Za-z]/.test(password) && /[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();
  const meets = score >= 3 && password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
  const strengthLabel = ['too short', 'weak', 'ok', 'strong', 'excellent'][score] ?? '—';
  const strengthColor = ['bg-danger', 'bg-danger', 'bg-warning', 'bg-accent', 'bg-success'][score] ?? 'bg-border';

  const handleReset = async () => {
    if (!meets) return;
    setLoading(true);
    setError('');
    try {
      const r = await adminApi.put<{ userId: string; mustReLogin: boolean }>(`/auth/users/${user._id}/password`, { newPassword: password });
      void r;
      setSuccess(true);
      // Brief pause so the admin sees the success state, then close.
      setTimeout(() => onReset({ ...user }), 800);
    } catch (err) {
      const body = (err as { response?: { data?: { message?: string; errorCode?: string } } })?.response?.data;
      setError(body?.message ?? 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={modalBackdrop} onClick={e => e.target === e.currentTarget && !loading && onClose()}>
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm admin-modal-panel" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <p className="text-sm font-semibold text-ink">Reset password for {user.name}</p>
          <p className="text-xs text-ink-faint mt-0.5">{user.email}</p>
        </div>
        <div className="admin-modal-body space-y-3">
          <div>
            <label className={adminLabel} htmlFor="reset-pw">New password</label>
            <div className="relative">
              <input
                id="reset-pw"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setSuccess(false); }}
                placeholder="Min 8 chars, 1 letter, 1 number"
                autoFocus
                disabled={loading || success}
                data-testid="reset-password-input"
                className={`${adminInput} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShow(s => !s)}
                data-testid="reset-password-toggle"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-ink-faint hover:text-ink px-2 py-0.5 rounded"
                tabIndex={-1}
              >
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
            {/* Strength bar — 4 segments, fills based on score. */}
            <div className="flex gap-1 mt-2" aria-label="Password strength">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className={`h-1 flex-1 rounded ${i < score ? strengthColor : 'bg-border/40'}`} />
              ))}
            </div>
            <p className={`text-[10px] mt-1 ${meets ? 'text-success' : 'text-ink-faint'}`}>
              {password.length === 0 ? ' ' : `Strength: ${strengthLabel}`}
            </p>
          </div>
          {error && (
            <div
              data-testid="reset-password-error"
              className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2"
            >
              {error}
            </div>
          )}
          {success && (
            <div
              data-testid="reset-password-success"
              className="text-xs text-success bg-success/10 border border-success/20 rounded-md px-3 py-2"
            >
              Password reset. The user will be signed out on their next request.
            </div>
          )}
        </div>
        <div className="admin-modal-footer">
          <button onClick={onClose} disabled={loading} className={`flex-1 py-2 rounded-lg text-sm ${adminBtnOutline}`}>Cancel</button>
          <button
            onClick={handleReset}
            disabled={!meets || loading || success}
            data-testid="reset-password-submit"
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${adminBtnPrimary} disabled:opacity-50`}
          >
            {loading ? 'Resetting…' : success ? 'Done' : 'Reset password'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  // v1.85 — admin password reset modal target. Set when the admin
  // clicks "Reset password" in a row; the modal closes itself via
  // onReset. Hidden for admin users in the table row to match
  // the server's hard floor.
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const dSearch = useDebounce(search, 350);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), limit: '15' });
    if (dSearch) params.set('search', dSearch);
    adminApi.get(`/admin/users?${params}`).then(r => { const d = r.data as UsersApiResponse; setUsers(d.users); setTotal(d.total); setPages(d.pages); }).finally(() => setLoading(false));
  }, [page, dSearch]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { setPage(1); }, [dSearch]);
  const handleRoleUpdated = (updated: AdminUser) => setUsers(prev => prev.map(u => u._id === updated._id ? updated : u));
  const handleDeleted = (id: string) => { setUsers(prev => prev.filter(u => u._id !== id)); setTotal(p => p - 1); };
  // v1.85 — after a reset, close the modal but keep the user in
  // the list (their `role` and other fields haven't changed). The
  // table refresh is implicit; if we ever want to invalidate the
  // cached user doc on the client, this is the hook.
  const handleReset = (_updated: AdminUser) => { setResetUser(null); };

  return (
    <div className="space-y-4 max-w-6xl">
      <AnimatePresence>{editUser && <RoleModal user={editUser} onClose={() => setEditUser(null)} onUpdated={handleRoleUpdated} />}{deleteUser && <DeleteModal user={deleteUser} onClose={() => setDeleteUser(null)} onDeleted={handleDeleted} />}{detailUser && <UserDetailModal user={detailUser} onClose={() => setDetailUser(null)} onRefresh={fetchUsers} />}{resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} onReset={handleReset} />}</AnimatePresence>
      <p className="text-sm text-ink-faint -mt-2">{total} registered</p>

      <div className="grid grid-cols-3 gap-3">
        <div className="admin-stat-mini p-3"><p className="text-xl font-bold text-ink">{total}</p><p className="text-xs text-ink-faint mt-0.5">Total</p></div>
        <div className="admin-stat-mini p-3"><p className="text-xl font-bold text-ink">{users.filter(u => u.role === 'admin').length}</p><p className="text-xs text-ink-faint mt-0.5">Admins</p></div>
        <div className="admin-stat-mini p-3"><p className="text-xl font-bold text-ink">{users.filter(u => u.role === 'moderator').length}</p><p className="text-xs text-ink-faint mt-0.5">Moderators</p></div>
      </div>

      <div className="relative max-w-xs">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} className={`${adminSearchInput}`} />
      </div>

      <div className="admin-table-wrap">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="admin-thead-row">
              <th className="admin-th">Name</th><th className="admin-th">Email</th><th className="admin-th">Points / Tier</th><th className="admin-th">Role</th><th className="admin-th">Joined</th><th className="admin-th text-right">Actions</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="admin-empty">Loading…</td></tr> :
               users.length === 0 ? <tr><td colSpan={6} className="admin-empty">No users found</td></tr> :
               users.map(u => {
                 const tier = u.tier || 'newcomer';
                 return (
                <tr key={u._id} className="admin-tr">
                  <td className="admin-td"><button onClick={() => setDetailUser(u)} className="flex items-center gap-2 hover:opacity-80 cursor-pointer text-left"><div className="w-6 h-6 rounded-full bg-mist border border-border flex items-center justify-center text-[10px] font-semibold text-ink-soft">{u.name?.[0]?.toUpperCase()}</div><span className="font-medium text-ink">{u.name}</span></button></td>
                  <td className="admin-td text-ink-faint">{u.email}</td>
                  <td className="admin-td"><div className="flex items-center gap-1"><span className="text-sm font-medium text-ink">{u.points ?? 0}</span><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TIER_COLORS[tier]}`}>{TIER_ICONS[tier]}</span></div></td>
                  <td className="admin-td"><Badge status={u.role === 'admin' ? 'admin' : u.role === 'moderator' ? 'moderator' : 'user'} label={u.role} /></td>
                  <td className="admin-td text-ink-faint">{new Date(u.createdAt).toLocaleDateString('en-IN')}</td>
                  <td className="admin-td text-right">
                    <button onClick={() => setDetailUser(u)} className={`${adminBtnSmOutline} mr-1`}>Detail</button>
                    <button onClick={() => setEditUser(u)} className={`${adminBtnSmOutline} mr-1`}>Edit</button>
                    {/* v1.85 — admin password reset. Hidden for admin
                        users so the UI matches the server's hard
                        floor (which also returns 403 if an admin
                        tries to call the endpoint). One less way
                        to accidentally trip the security check. */}
                    {u.role !== 'admin' && (
                      <button
                        onClick={() => setResetUser(u)}
                        data-testid={`reset-password-btn-${u._id}`}
                        className="px-2.5 py-1 rounded-md text-[10px] text-ink-soft hover:text-accent hover:bg-accent/10 transition-colors mr-1"
                      >
                        Reset pw
                      </button>
                    )}
                    <button onClick={() => setDeleteUser(u)} className="px-2.5 py-1 rounded-md text-[10px] text-ink-faint hover:text-danger hover:bg-danger/10 transition-colors">Delete</button>
                  </td>
                </tr>
                 );
               })}
            </tbody>
          </table>
        </div>
        {pages > 1 && <div className="admin-pagination"><span>Page {page} of {pages}</span><div className="flex gap-1"><button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="admin-pagination-btn">← Prev</button><button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="admin-pagination-btn">Next →</button></div></div>}
      </div>
    </div>
  );
}
