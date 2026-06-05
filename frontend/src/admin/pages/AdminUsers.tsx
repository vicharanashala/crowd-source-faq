import React, { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import adminApi from '../utils/adminApi';
import Badge from '../components/common/Badge';

function useDebounce<T>(value: T, delay: number): T { const [v, setV] = useState(value); useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]); return v; }
type UserRole = 'admin' | 'moderator' | 'user' | 'ai_moderator' | 'expert';
interface AdminUser { _id: string; name: string; email: string; role: UserRole; createdAt: string; updatedAt: string; points?: number; reputation?: number; tier?: string; positiveBadges?: Array<{ badgeId: { _id: string; name: string; slug: string; icon: string; description: string }; awardedAt?: string; reason?: string }>; negativeBadges?: Array<{ badgeId: { _id: string; name: string; slug: string; icon: string }; awardedAt?: string; reason?: string }>; isBanned?: boolean; suspendedUntil?: string; }
interface UsersApiResponse { users: AdminUser[]; total: number; pages: number; }

const TIER_COLORS: Record<string, string> = {
  newcomer:       'bg-admin-surface text-admin-muted',
  contributor:   'bg-amber-100 text-amber-700',
  helper:        'bg-slate-100 text-slate-600',
  expert:        'bg-yellow-100 text-yellow-700',
  champion:      'bg-indigo-100 text-indigo-700',
  knowledge_master: 'bg-violet-100 text-violet-700',
};
const TIER_ICONS: Record<string, string> = {
  newcomer:       '🌱',
  contributor:   '🥉',
  helper:        '🥈',
  expert:        '🥇',
  champion:      '💎',
  knowledge_master: '👑',
};

function timeAgo(d: string) { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`; const h = Math.floor(m / 3600); if (h < 24) return `${h}h ago`; return `${Math.floor(h / 24)}d ago`; }

function UserDetailModal({ user, onClose, onRefresh }: { user: AdminUser; onClose: () => void; onRefresh: () => void }) {
  const [warnModal, setWarnModal] = useState(false);
  const [suspendModal, setSuspendModal] = useState(false);
  const [banModal, setBanModal] = useState(false);
  const [suspendDuration, setSuspendDuration] = useState('7d');
  const [actionLoading, setActionLoading] = useState('');
  const [warnReason, setWarnReason] = useState('');
  const [suspendReason, setSuspendReason] = useState('');
  const [banReason, setBanReason] = useState('');

  const doAction = async (fn: () => Promise<void>, postAction?: () => void) => { setActionLoading('*'); try { await fn(); if (postAction) postAction(); onRefresh(); } catch {} finally { setActionLoading(''); } };

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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-admin-bg/30 backdrop-blur-sm" onClick={onClose}>
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg bg-admin-card rounded-xl border border-white/5 shadow-sm max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-white/5 flex items-start justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-admin-surface flex items-center justify-center text-base font-semibold text-admin-text">{user.name?.[0]?.toUpperCase()}</div>
              <div>
                <p className="text-sm font-semibold text-admin-text">{user.name}</p>
                <p className="text-xs text-admin-muted">{user.email}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Badge status={user.role === 'admin' ? 'admin' : user.role === 'moderator' ? 'moderator' : user.role === 'ai_moderator' ? 'moderator' : 'user'} label={user.role} />
              {user.isBanned && <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">BANNED</span>}
              {user.suspendedUntil && new Date(user.suspendedUntil) > new Date() && <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">SUSPENDED</span>}
            </div>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-admin-bg border border-white/5 rounded-lg p-2.5 text-center">
                <p className="text-base font-bold text-admin-text">{user.points ?? 0}</p>
                <p className="text-[10px] text-admin-muted mt-0.5">Points</p>
              </div>
              <div className="bg-admin-bg border border-white/5 rounded-lg p-2.5 text-center">
                <p className="text-base font-bold text-admin-text">{user.reputation ?? 0}</p>
                <p className="text-[10px] text-admin-muted mt-0.5">Rep</p>
              </div>
              <div className="bg-admin-bg border border-white/5 rounded-lg p-2.5 text-center">
                <span className={`inline-flex items-center gap-1 text-xs font-bold ${TIER_COLORS[tier] || ''} px-1.5 py-0.5 rounded`}>{TIER_ICONS[tier]} {tier}</span>
                <p className="text-[10px] text-admin-muted mt-0.5">Tier</p>
              </div>
              <div className="bg-admin-bg border border-white/5 rounded-lg p-2.5 text-center">
                <p className="text-base font-bold text-admin-text">{posBadges.length}</p>
                <p className="text-[10px] text-admin-muted mt-0.5">Badges</p>
              </div>
            </div>

            {/* Tier progress */}
            <div>
              <p className="text-[10px] font-semibold text-admin-muted uppercase mb-1.5">Tier Progress</p>
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
                      <p className="text-[9px] text-admin-muted mt-0.5 text-center">{TIER_ICONS[t]}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Positive badges */}
            {posBadges.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-admin-muted uppercase mb-1.5">Badges</p>
                <div className="flex flex-wrap gap-1.5">
                  {posBadges.map((b, i) => (
                    <div key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-xs text-emerald-700">
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
                <p className="text-[10px] font-semibold text-admin-muted uppercase mb-1.5">Penalties</p>
                <div className="flex flex-wrap gap-1.5">
                  {negBadges.map((b, i) => (
                    <div key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 border border-red-100 text-xs text-red-700">
                      <span>{b.badgeId?.icon ?? '⚠️'}</span>
                      <span className="font-light">{b.badgeId?.name ?? 'Penalty'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Joined */}
            <div className="text-xs text-admin-muted">Joined {new Date(user.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>

          {/* Action buttons */}
          <div className="px-5 py-4 border-t border-white/5 flex flex-wrap gap-2 shrink-0">
            {user.isBanned ? (
              <button onClick={handleUnban} disabled={!!actionLoading} className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50">Unban</button>
            ) : (
              <>
                <button onClick={() => setWarnModal(true)} disabled={!!actionLoading} className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-admin-surface hover:bg-admin-muted disabled:opacity-50">Warn</button>
                <button onClick={() => setSuspendModal(true)} disabled={!!actionLoading} className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50">Suspend</button>
                <button onClick={() => setBanModal(true)} disabled={!!actionLoading} className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-50">Ban</button>
              </>
            )}
            {user.suspendedUntil && new Date(user.suspendedUntil) > new Date() && (
              <button onClick={handleUnsuspend} disabled={!!actionLoading} className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50">Lift Suspension</button>
            )}
            <button onClick={handleSoftDelete} disabled={!!actionLoading || user.role === 'admin'} className="px-3 py-1.5 rounded-md text-xs text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40 ml-auto">Soft Delete</button>
            <button onClick={onClose} className="px-3 py-1.5 rounded-md text-xs text-admin-muted border border-white/5 hover:bg-admin-bg">Close</button>
          </div>
        </motion.div>
      </div>

      {/* Warn Modal */}
      {warnModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-admin-bg/40 backdrop-blur-sm" onClick={() => setWarnModal(false)}>
          <div className="w-full max-w-xs bg-admin-card rounded-xl border border-white/5 shadow-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/5"><p className="text-sm font-semibold text-admin-text">Send Warning to {user.name}</p></div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-admin-text mb-1">Reason</label>
                <textarea rows={3} value={warnReason} onChange={e => setWarnReason(e.target.value)} placeholder="Describe the violation…"
                  className="w-full px-3 py-2 rounded-md text-sm text-admin-text bg-admin-bg border border-white/5 outline-none focus:border-admin-purple/50 resize-none" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setWarnModal(false)} className="px-4 py-2 rounded-md text-sm text-admin-muted border border-white/5 hover:bg-admin-bg">Cancel</button>
                <button onClick={handleWarn} disabled={!warnReason} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-admin-bg hover:bg-admin-surface disabled:opacity-40">Send Warning</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Modal */}
      {suspendModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-admin-bg/40 backdrop-blur-sm" onClick={() => setSuspendModal(false)}>
          <div className="w-full max-w-xs bg-admin-card rounded-xl border border-white/5 shadow-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/5"><p className="text-sm font-semibold text-admin-text">Suspend {user.name}</p></div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-admin-text mb-1">Duration</label>
                <div className="flex flex-wrap gap-1.5">
                  {['1h','6h','24h','3d','7d'].map(d => (
                    <button key={d} onClick={() => setSuspendDuration(d)}
                      className={`px-3 py-1.5 rounded-md text-xs border ${suspendDuration === d ? 'border-admin-purple bg-admin-surface text-admin-text' : 'border-white/5 text-admin-muted hover:bg-admin-bg'}`}>{d}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-admin-text mb-1">Reason</label>
                <textarea rows={2} value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="Reason…"
                  className="w-full px-3 py-2 rounded-md text-sm text-admin-text bg-admin-bg border border-white/5 outline-none focus:border-admin-purple/50 resize-none" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setSuspendModal(false)} className="px-4 py-2 rounded-md text-sm text-admin-muted border border-white/5 hover:bg-admin-bg">Cancel</button>
                <button onClick={handleSuspend} disabled={!suspendReason} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-40">Suspend</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ban Modal */}
      {banModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-admin-bg/40 backdrop-blur-sm" onClick={() => setBanModal(false)}>
          <div className="w-full max-w-xs bg-admin-card rounded-xl border border-white/5 shadow-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/5"><p className="text-sm font-semibold text-red-700">Ban {user.name} permanently</p></div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-admin-muted">This user will be permanently banned and cannot access their account.</p>
              <div>
                <label className="block text-xs font-medium text-admin-text mb-1">Reason (required)</label>
                <textarea rows={3} value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Detailed reason…"
                  className="w-full px-3 py-2 rounded-md text-sm text-admin-text bg-admin-bg border border-white/5 outline-none focus:border-admin-purple/50 resize-none" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setBanModal(false)} className="px-4 py-2 rounded-md text-sm text-admin-muted border border-white/5 hover:bg-admin-bg">Cancel</button>
                <button onClick={handleBan} disabled={!banReason} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-40">Ban User</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RoleModal({ user, onClose, onUpdated }: { user: AdminUser; onClose: () => void; onUpdated: (u: AdminUser) => void }) {
  const [role, setRole] = useState<UserRole>(user.role);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const handleSave = async () => { if (role === user.role) { onClose(); return; } setLoading(true); setError(''); try { const res = await adminApi.patch<{ user: AdminUser }>(`/auth/users/${user._id}/role`, { role }); onUpdated({ ...user, role: res.data.user.role }); onClose(); } catch (err) { setError(((err as { response?: { data?: { message?: string } } })?.response?.data?.message) ?? 'Failed'); } finally { setLoading(false); } };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-admin-bg/30 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm bg-admin-card rounded-xl border border-white/5 shadow-sm">
        <div className="px-5 py-4 border-b border-white/5"><p className="text-sm font-semibold text-admin-text">Change Role</p><p className="text-xs text-admin-muted mt-0.5">{user.name} · {user.email}</p></div>
        <div className="px-5 py-4 space-y-1.5">
          {(['admin', 'moderator', 'user', 'ai_moderator'] as UserRole[]).map(r => (
            <label key={r} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer border transition-all text-sm ${role === r ? 'border-admin-muted bg-admin-bg' : 'border-white/5 hover:bg-admin-bg'}`}>
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="accent-admin-purple" />
              <span className="text-admin-text capitalize font-light">{r.replace('_', ' ')}</span>
            </label>
          ))}
        </div>
        {error && <p className="px-5 pb-2 text-xs text-red-500">{error}</p>}
        <div className="px-5 pb-4 flex gap-2">
          <button onClick={onClose} disabled={loading} className="flex-1 py-2 rounded-lg text-sm text-admin-muted border border-white/5 hover:bg-admin-bg transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={loading || role === user.role} className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-admin-bg hover:bg-admin-surface disabled:opacity-40 transition-colors">{loading ? 'Saving…' : 'Save'}</button>
        </div>
      </motion.div>
    </div>
  );
}

function DeleteModal({ user, onClose, onDeleted }: { user: AdminUser; onClose: () => void; onDeleted: (id: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const handleDelete = async () => { setLoading(true); setError(''); try { await adminApi.delete(`/auth/users/${user._id}`); onDeleted(user._id); onClose(); } catch (err) { setError(((err as { response?: { data?: { message?: string } } })?.response?.data?.message) ?? 'Failed'); } finally { setLoading(false); } };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-admin-bg/30 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xs bg-admin-card rounded-xl border border-white/5 shadow-sm">
        <div className="px-5 py-4"><p className="text-sm font-semibold text-admin-text">Delete User</p><p className="text-xs text-admin-muted mt-1">Remove <span className="text-admin-text">{user.name}</span>? Cannot be undone.</p></div>
        {error && <p className="px-5 pb-2 text-xs text-red-500">{error}</p>}
        <div className="px-5 pb-4 flex gap-2">
          <button onClick={onClose} disabled={loading} className="flex-1 py-2 rounded-lg text-sm text-admin-muted border border-white/5 hover:bg-admin-bg transition-colors">Cancel</button>
          <button onClick={handleDelete} disabled={loading} className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 transition-colors">{loading ? 'Deleting…' : 'Delete'}</button>
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

  const th = 'px-4 py-2.5 text-left text-[10px] font-semibold text-admin-muted uppercase tracking-wide';
  const td = 'px-4 py-3 text-sm text-admin-text';

  return (
    <div className="space-y-4 max-w-6xl">
      <AnimatePresence>{editUser && <RoleModal user={editUser} onClose={() => setEditUser(null)} onUpdated={handleRoleUpdated} />}{deleteUser && <DeleteModal user={deleteUser} onClose={() => setDeleteUser(null)} onDeleted={handleDeleted} />}{detailUser && <UserDetailModal user={detailUser} onClose={() => setDetailUser(null)} onRefresh={fetchUsers} />}</AnimatePresence>
      <div><h2 className="text-lg font-semibold text-admin-text">Users</h2><p className="text-sm text-admin-muted mt-0.5">{total} registered</p></div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-admin-card border border-white/5 rounded-lg p-3"><p className="text-xl font-bold text-admin-text">{total}</p><p className="text-xs text-admin-muted mt-0.5">Total</p></div>
        <div className="bg-admin-card border border-white/5 rounded-lg p-3"><p className="text-xl font-bold text-admin-text">{users.filter(u => u.role === 'admin').length}</p><p className="text-xs text-admin-muted mt-0.5">Admins</p></div>
        <div className="bg-admin-card border border-white/5 rounded-lg p-3"><p className="text-xl font-bold text-admin-text">{users.filter(u => u.role === 'moderator').length}</p><p className="text-xs text-admin-muted mt-0.5">Moderators</p></div>
      </div>

      <div className="relative max-w-xs">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-admin-muted" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 rounded-md text-sm text-admin-text placeholder-admin-muted bg-admin-card border border-white/5 outline-none focus:border-admin-purple/50 transition-colors" />
      </div>

      <div className="bg-admin-card border border-white/5 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-admin-bg border-b border-white/5">
              <th className={th}>Name</th><th className={th}>Email</th><th className={th}>Points / Tier</th><th className={th}>Role</th><th className={th}>Joined</th><th className={`${th} text-right`}>Actions</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-admin-muted">Loading…</td></tr> :
               users.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-admin-muted">No users found</td></tr> :
               users.map(u => {
                 const tier = u.tier || 'newcomer';
                 return (
                <tr key={u._id} className="border-b border-white/5 last:border-0 hover:bg-admin-bg transition-colors">
                  <td className={td}><button onClick={() => setDetailUser(u)} className="flex items-center gap-2 hover:opacity-80 cursor-pointer text-left"><div className="w-6 h-6 rounded-full bg-admin-surface flex items-center justify-center text-[10px] font-semibold text-admin-muted">{u.name?.[0]?.toUpperCase()}</div><span className="font-medium text-admin-text">{u.name}</span></button></td>
                  <td className={`${td} text-admin-muted`}>{u.email}</td>
                  <td className={td}><div className="flex items-center gap-1"><span className="text-sm font-medium text-admin-text">{u.points ?? 0}</span><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TIER_COLORS[tier]}`}>{TIER_ICONS[tier]}</span></div></td>
                  <td className={td}><Badge status={u.role === 'admin' ? 'admin' : u.role === 'moderator' ? 'moderator' : 'user'} label={u.role} /></td>
                  <td className={`${td} text-admin-muted`}>{new Date(u.createdAt).toLocaleDateString('en-IN')}</td>
                  <td className={`${td} text-right`}>
                    <button onClick={() => setDetailUser(u)} className="px-2.5 py-1 rounded-md text-[10px] text-admin-muted border border-white/5 hover:border-admin-muted hover:text-admin-text transition-colors mr-1">Detail</button>
                    <button onClick={() => setEditUser(u)} className="px-2.5 py-1 rounded-md text-[10px] text-admin-muted border border-white/5 hover:border-admin-muted hover:text-admin-text transition-colors mr-1">Edit</button>
                    <button onClick={() => setDeleteUser(u)} className="px-2.5 py-1 rounded-md text-[10px] text-admin-muted hover:text-red-600 hover:bg-red-50 transition-colors">Delete</button>
                  </td>
                </tr>
                 );
               })}
            </tbody>
          </table>
        </div>
        {pages > 1 && <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 text-sm text-admin-muted"><span>Page {page} of {pages}</span><div className="flex gap-1"><button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded-md hover:bg-admin-surface disabled:opacity-30">← Prev</button><button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1 rounded-md hover:bg-admin-surface disabled:opacity-30">Next →</button></div></div>}
      </div>
    </div>
  );
}
