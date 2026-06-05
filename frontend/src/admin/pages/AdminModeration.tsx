import React, { useEffect, useState } from 'react';
import adminApi from '../utils/adminApi';

interface BannedUser { _id: string; name: string; email: string; banReason?: string; bannedAt?: string; tier: string; points: number; }
interface SuspendedUser { _id: string; name: string; email: string; suspendedUntil?: string; tier: string; points: number; }
interface ModerationLog { _id: string; moderatorId: { name: string; email: string }; action: string; reason: string; targetId: string; targetType: string; duration?: string; createdAt: string; }
interface EscalatedPost {
  _id: string;
  title: string;
  body: string;
  author: string;
  authorEmail?: string;
  commentCount: number;
  createdAt: string;
  escalatedAt: string;
  escalationReason?: string;
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function until(d?: string) {
  if (!d) return '—';
  const diff = new Date(d).getTime() - Date.now();
  if (diff <= 0) return 'expired';
  const h = Math.floor(diff / 3600000);
  const d2 = Math.floor(h / 24);
  if (d2 > 0) return `${d2}d ${h % 24}h`;
  return `${h}h`;
}

export default function AdminModeration() {
  const [banned, setBanned] = useState<BannedUser[]>([]);
  const [suspended, setSuspended] = useState<SuspendedUser[]>([]);
  const [logs, setLogs] = useState<ModerationLog[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [warnModal, setWarnModal] = useState<{ userId: string; name: string } | null>(null);
  const [warnReason, setWarnReason] = useState('');
  const [suspendModal, setSuspendModal] = useState<{ userId: string; name: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendDuration, setSuspendDuration] = useState('7d');
  const [banModal, setBanModal] = useState<{ userId: string; name: string } | null>(null);
  const [banReason, setBanReason] = useState('');

  // Escalated community posts
  const [escalatedPosts, setEscalatedPosts] = useState<EscalatedPost[]>([]);
  const [escalatedLoading, setEscalatedLoading] = useState(false);
  const [actionTab, setActionTab] = useState<'users' | 'escalated'>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') === 'escalated' ? 'escalated' : 'users';
  });
  const [dismissModal, setDismissModal] = useState<{ post: EscalatedPost; reason: string } | null>(null);

  const fetchEscalatedPosts = () => {
    setEscalatedLoading(true);
    adminApi.get<{ posts: EscalatedPost[]; total: number }>('/admin/community/escalated-posts')
      .then(r => setEscalatedPosts(r.data.posts))
      .finally(() => setEscalatedLoading(false));
  };

  const handleResolveEscalated = async (id: string, outcome: string) => {
    await adminApi.post(`/admin/community/escalated-posts/${id}/resolve`, { outcome });
    fetchEscalatedPosts();
  };

  const handleDismissEscalated = async (id: string, reason: string) => {
    await adminApi.post(`/admin/community/escalated-posts/${id}/dismiss`, { reason });
    fetchEscalatedPosts();
  };

  const fetchQueue = () => {
    setLoading(true);
    Promise.all([
      adminApi.get<{ banned: BannedUser[]; suspended: SuspendedUser[] }>('/moderation/queue'),
      adminApi.get<{ logs: ModerationLog[]; total: number }>(`/moderation/logs?page=${page}&limit=15`),
    ]).then(([q, l]) => {
      setBanned(q.data.banned);
      setSuspended(q.data.suspended);
      setLogs(l.data.logs);
      setTotal(l.data.total);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (actionTab === 'users') {
      fetchQueue();
    } else {
      fetchEscalatedPosts();
    }
  }, [page, actionTab]);

  const handleTabChange = (tab: 'users' | 'escalated') => {
    setActionTab(tab);
    const url = new URL(window.location.href);
    if (tab === 'users') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', 'escalated');
    }
    window.history.replaceState({}, '', url.pathname + url.search);
    
    if (tab === 'users') {
      setPage(1);
    }
  };

  const doAction = async (fn: () => Promise<void>) => { try { await fn(); fetchQueue(); } catch {} };

  const handleUnban  = (id: string) => doAction(async () => { await adminApi.post('/moderation/unban', { userId: id }); });
  const handleUnsuspend = (id: string) => doAction(async () => { await adminApi.post('/moderation/unsuspend', { userId: id }); });
  const handleWarn    = async () => { if (!warnModal || !warnReason) return; await doAction(async () => { await adminApi.post('/moderation/warn', { userId: warnModal.userId, reason: warnReason }); }); setWarnModal(null); setWarnReason(''); };
  const handleSuspend = async () => { if (!suspendModal || !suspendReason) return; await doAction(async () => { await adminApi.post('/moderation/suspend', { userId: suspendModal.userId, reason: suspendReason, duration: suspendDuration }); }); setSuspendModal(null); setSuspendReason(''); };
  const handleBan    = async () => { if (!banModal || !banReason) return; await doAction(async () => { await adminApi.post('/moderation/ban', { userId: banModal.userId, reason: banReason }); }); setBanModal(null); setBanReason(''); };

  const ACTION_LABELS: Record<string, string> = {
    ban: 'Banned', unban: 'Unbanned', suspend: 'Suspended', unsuspend: 'Unsuspended',
    warn: 'Warned', soft_delete: 'Soft-deleted', restore: 'Restored',
    delete_content: 'Content deleted', point_deduct: 'Points deducted', lift_warning: 'Warning lifted',
    badge_issue_negative: 'Negative badge issued',
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-admin-text">Moderation</h2>
          <p className="text-sm text-admin-muted mt-0.5">Manage bans, suspensions, warnings, and escalated questions</p>
        </div>
        {/* Tab switcher */}
        <div className="flex rounded-md border border-white/5 overflow-hidden text-xs font-medium shrink-0">
          <button
            onClick={() => handleTabChange('users')}
            className={`px-4 py-2 transition-colors ${actionTab === 'users' ? 'bg-admin-bg text-white' : 'bg-admin-card text-admin-muted hover:bg-admin-bg'}`}
          >Users</button>
          <button
            onClick={() => handleTabChange('escalated')}
            className={`px-4 py-2 transition-colors flex items-center gap-1.5 ${actionTab === 'escalated' ? 'bg-admin-bg text-white' : 'bg-admin-card text-admin-muted hover:bg-admin-bg'}`}
          >
            Escalated
            {escalatedPosts.length > 0 && (
              <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${actionTab === 'escalated' ? 'bg-admin-card text-admin-text' : 'bg-red-500 text-white'}`}>
                {escalatedPosts.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {actionTab === 'users' ? (
        <>
          {/* Banned users */}
          {banned.length > 0 && (
            <div className="bg-admin-card border border-white/5 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 bg-red-50">
                <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Banned ({banned.length})</p>
              </div>
              <table className="w-full">
                <thead><tr className="border-b border-white/5 bg-admin-bg">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-admin-muted uppercase">User</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-admin-muted uppercase">Reason</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-admin-muted uppercase">Banned</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-admin-muted uppercase">Action</th>
                </tr></thead>
                <tbody>
                  {banned.map(u => (
                    <tr key={u._id} className="border-b border-white/5 last:border-0 hover:bg-admin-bg">
                      <td className="px-4 py-3"><div className="text-sm font-medium text-admin-text">{u.name}</div><div className="text-xs text-admin-muted">{u.email}</div></td>
                      <td className="px-4 py-3 text-sm text-admin-muted">{u.banReason || '—'}</td>
                      <td className="px-4 py-3 text-xs text-admin-muted">{u.bannedAt ? timeAgo(u.bannedAt) : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleUnban(u._id)} className="px-3 py-1 rounded text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors">Unban</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Suspended users */}
          {suspended.length > 0 && (
            <div className="bg-admin-card border border-white/5 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 bg-amber-50">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Suspended ({suspended.length})</p>
              </div>
              <table className="w-full">
                <thead><tr className="border-b border-white/5 bg-admin-bg">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-admin-muted uppercase">User</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-admin-muted uppercase">Expires in</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-admin-muted uppercase">Action</th>
                </tr></thead>
                <tbody>
                  {suspended.map(u => (
                    <tr key={u._id} className="border-b border-white/5 last:border-0 hover:bg-admin-bg">
                      <td className="px-4 py-3"><div className="text-sm font-medium text-admin-text">{u.name}</div><div className="text-xs text-admin-muted">{u.email}</div></td>
                      <td className="px-4 py-3 text-sm text-amber-600 font-medium">{until(u.suspendedUntil)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleUnsuspend(u._id)} className="px-3 py-1 rounded text-xs font-medium text-white bg-amber-600 hover:bg-amber-500 transition-colors">Lift</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {banned.length === 0 && suspended.length === 0 && !loading && (
            <div className="bg-admin-card border border-white/5 rounded-lg p-12 text-center">
              <p className="text-sm text-admin-muted">No banned or suspended users</p>
            </div>
          )}

          {/* Moderation log */}
          <div className="bg-admin-card border border-white/5 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5">
              <p className="text-xs font-semibold text-admin-text uppercase tracking-wide">Moderation Log</p>
            </div>
            <div className="divide-y divide-white/5">
              {loading ? (
                <div className="p-8 text-center text-sm text-admin-muted">Loading…</div>
              ) : logs.length === 0 ? (
                <div className="p-8 text-center text-sm text-admin-muted">No moderation actions yet</div>
              ) : logs.map(log => (
                <div key={log._id} className="px-4 py-3 hover:bg-admin-bg">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-admin-surface text-admin-text mr-2">{ACTION_LABELS[log.action] ?? log.action}</span>
                      <span className="text-sm text-admin-text">{log.reason || '—'}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-admin-muted">{log.moderatorId?.name ?? 'System'}</p>
                      <p className="text-[10px] text-admin-muted">{timeAgo(log.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {total > 15 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                <span className="text-xs text-admin-muted">Page {page} · {total} entries</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-xs rounded border border-white/5 hover:bg-admin-bg disabled:opacity-30">← Prev</button>
                  <button onClick={() => setPage(p => p + 1)} disabled={logs.length < 15} className="px-3 py-1 text-xs rounded border border-white/5 hover:bg-admin-bg disabled:opacity-30">Next →</button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Escalated community posts */
        <div className="bg-admin-card border border-white/5 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 bg-red-50/50">
            <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Escalated Posts ({escalatedPosts.length})</p>
          </div>
          {escalatedLoading ? (
            <div className="p-8 text-center text-sm text-admin-muted">Loading escalated posts…</div>
          ) : escalatedPosts.length === 0 ? (
            <div className="p-12 text-center text-sm text-admin-muted">No escalated posts requiring attention</div>
          ) : (
            <div className="divide-y divide-white/5">
              {escalatedPosts.map(post => (
                <div key={post._id} className="p-4 hover:bg-admin-bg space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-admin-text">{post.title}</h3>
                      <p className="text-xs text-admin-muted mt-0.5">
                        Posted by <span className="font-medium text-admin-muted">{post.author}</span> ({post.authorEmail}) · {timeAgo(post.createdAt)}
                      </p>
                    </div>
                    <div className="text-right text-[10px] text-red-600 font-medium shrink-0 bg-red-50 px-2 py-0.5 rounded border border-red-100">
                      Escalated {timeAgo(post.escalatedAt)}
                    </div>
                  </div>
                  
                  {post.escalationReason && (
                    <div className="text-xs bg-admin-bg border border-white/10 p-2 rounded text-admin-muted italic">
                      Reason: {post.escalationReason}
                    </div>
                  )}

                  <p className="text-xs text-admin-muted line-clamp-2">{post.body}</p>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-admin-muted">{post.commentCount} comment{post.commentCount === 1 ? '' : 's'}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const outcome = prompt('Enter resolution details (e.g. "Answered in thread", "Created official FAQ"):');
                          if (outcome !== null) {
                            handleResolveEscalated(post._id, outcome);
                          }
                        }}
                        className="px-3 py-1 rounded text-xs font-medium text-white bg-admin-bg hover:bg-admin-card transition-colors"
                      >
                        Resolve
                      </button>
                      <button
                        onClick={() => {
                          setDismissModal({ post, reason: '' });
                        }}
                        className="px-3 py-1 rounded text-xs font-medium text-admin-text bg-admin-card border border-white/5 hover:bg-admin-bg transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dismiss Modal */}
      {dismissModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-admin-bg/30 backdrop-blur-sm" onClick={() => setDismissModal(null)}>
          <div className="w-full max-w-sm bg-admin-card rounded-xl border border-white/5 shadow-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/5">
              <p className="text-sm font-semibold text-admin-text">Dismiss Escalation</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-admin-muted">Dismissing will remove this post from the escalation queue. It will remain unanswered.</p>
              <div>
                <label className="block text-xs font-medium text-admin-text mb-1">Reason (required)</label>
                <textarea
                  rows={3}
                  value={dismissModal.reason}
                  onChange={e => setDismissModal({ ...dismissModal, reason: e.target.value })}
                  placeholder="Reason for dismissal…"
                  className="w-full px-3 py-2 rounded-md text-sm text-admin-text bg-admin-bg border border-white/5 outline-none focus:border-admin-purple/50 resize-none"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setDismissModal(null)} className="px-4 py-2 rounded-md text-sm text-admin-muted border border-white/5 hover:bg-admin-bg">Cancel</button>
                <button
                  onClick={() => {
                    if (dismissModal.reason.trim()) {
                      handleDismissEscalated(dismissModal.post._id, dismissModal.reason);
                      setDismissModal(null);
                    }
                  }}
                  disabled={!dismissModal.reason.trim()}
                  className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-40"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Warn Modal */}
      {warnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-admin-bg/30 backdrop-blur-sm" onClick={() => setWarnModal(null)}>
          <div className="w-full max-w-sm bg-admin-card rounded-xl border border-white/5 shadow-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/5"><p className="text-sm font-semibold text-admin-text">Warn {warnModal.name}</p></div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-admin-text mb-1">Reason</label>
                <textarea rows={3} value={warnReason} onChange={e => setWarnReason(e.target.value)} placeholder="Describe the violation…"
                  className="w-full px-3 py-2 rounded-md text-sm text-admin-text bg-admin-bg border border-white/5 outline-none focus:border-admin-purple/50 resize-none" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setWarnModal(null)} className="px-4 py-2 rounded-md text-sm text-admin-muted border border-white/5 hover:bg-admin-bg">Cancel</button>
                <button onClick={handleWarn} disabled={!warnReason} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-admin-bg hover:bg-admin-surface disabled:opacity-40">Send Warning</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Modal */}
      {suspendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-admin-bg/30 backdrop-blur-sm" onClick={() => setSuspendModal(null)}>
          <div className="w-full max-w-sm bg-admin-card rounded-xl border border-white/5 shadow-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/5"><p className="text-sm font-semibold text-admin-text">Suspend {suspendModal.name}</p></div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-admin-text mb-1">Duration</label>
                <div className="flex gap-2">
                  {['1h','6h','24h','3d','7d'].map(d => (
                    <button key={d} onClick={() => setSuspendDuration(d)}
                      className={`px-3 py-1.5 rounded-md text-xs border ${suspendDuration === d ? 'border-admin-purple bg-admin-surface text-admin-text' : 'border-white/5 text-admin-muted hover:bg-admin-bg'}`}>{d}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-admin-text mb-1">Reason</label>
                <textarea rows={2} value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="Reason for suspension…"
                  className="w-full px-3 py-2 rounded-md text-sm text-admin-text bg-admin-bg border border-white/5 outline-none focus:border-admin-purple/50 resize-none" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setSuspendModal(null)} className="px-4 py-2 rounded-md text-sm text-admin-muted border border-white/5 hover:bg-admin-bg">Cancel</button>
                <button onClick={handleSuspend} disabled={!suspendReason} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-40">Suspend</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ban Modal */}
      {banModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-admin-bg/30 backdrop-blur-sm" onClick={() => setBanModal(null)}>
          <div className="w-full max-w-sm bg-admin-card rounded-xl border border-white/5 shadow-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/5"><p className="text-sm font-semibold text-red-700">Permanently Ban {banModal.name}</p></div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-admin-muted">This will permanently ban the user. They will not be able to access their account.</p>
              <div>
                <label className="block text-xs font-medium text-admin-text mb-1">Reason (required)</label>
                <textarea rows={3} value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Detailed reason for permanent ban…"
                  className="w-full px-3 py-2 rounded-md text-sm text-admin-text bg-admin-bg border border-white/5 outline-none focus:border-admin-purple/50 resize-none" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setBanModal(null)} className="px-4 py-2 rounded-md text-sm text-admin-muted border border-white/5 hover:bg-admin-bg">Cancel</button>
                <button onClick={handleBan} disabled={!banReason} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-40">Permanently Ban</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
