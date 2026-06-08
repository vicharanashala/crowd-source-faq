import { useEffect, useState } from 'react';
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
  const [warnModal, setWarnModal] = useState<{ userId: string; name: string } | null>(null);
  const [warnReason, setWarnReason] = useState('');
  const [suspendModal, setSuspendModal] = useState<{ userId: string; name: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendDuration, setSuspendDuration] = useState('7d');
  const [banModal, setBanModal] = useState<{ userId: string; name: string } | null>(null);
  const [banReason, setBanReason] = useState('');

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
    if (actionTab === 'users') fetchQueue();
    else fetchEscalatedPosts();
  }, [page, actionTab]);

  const handleTabChange = (tab: 'users' | 'escalated') => {
    setActionTab(tab);
    const url = new URL(window.location.href);
    if (tab === 'users') url.searchParams.delete('tab');
    else url.searchParams.set('tab', 'escalated');
    window.history.replaceState({}, '', url.pathname + url.search);
    if (tab === 'users') setPage(1);
  };

  const doAction = async (fn: () => Promise<void>) => { try { await fn(); fetchQueue(); } catch {} };

  const handleUnban    = (id: string) => doAction(async () => { await adminApi.post('/moderation/unban', { userId: id }); });
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
        <p className="text-sm text-ink-faint">Manage bans, suspensions, warnings, and escalated questions</p>
        {/* Tab switcher */}
        <div className="admin-tab-bar">
          <button onClick={() => handleTabChange('users')} className={`admin-tab ${actionTab === 'users' ? 'admin-tab-active' : ''}`}>Users</button>
          <button onClick={() => handleTabChange('escalated')} className={`admin-tab flex items-center gap-1.5 ${actionTab === 'escalated' ? 'admin-tab-active' : ''}`}>
            Escalated
            {escalatedPosts.length > 0 && (
              <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${actionTab === 'escalated' ? 'bg-white/20 text-white' : 'bg-danger text-white'}`}>
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
            <div className="admin-card-surface">
              <div className="admin-card-header bg-danger/5">
                <p className="text-xs font-semibold text-danger uppercase tracking-wide">Banned ({banned.length})</p>
              </div>
              <table className="w-full">
                <thead><tr className="admin-thead-row">
                  <th className="admin-th">User</th>
                  <th className="admin-th">Reason</th>
                  <th className="admin-th">Banned</th>
                  <th className="admin-th text-right">Action</th>
                </tr></thead>
                <tbody>
                  {banned.map(u => (
                    <tr key={u._id} className="admin-tr">
                      <td className="admin-td"><div className="text-sm font-medium text-ink">{u.name}</div><div className="text-xs text-ink-faint">{u.email}</div></td>
                      <td className="admin-td text-ink-soft">{u.banReason || '—'}</td>
                      <td className="admin-td text-ink-faint">{u.bannedAt ? timeAgo(u.bannedAt) : '—'}</td>
                      <td className="admin-td text-right">
                        <button onClick={() => handleUnban(u._id)} className="px-3 py-1 rounded text-xs font-medium text-white bg-success hover:bg-success/80 transition-colors">Unban</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Suspended users */}
          {suspended.length > 0 && (
            <div className="admin-card-surface">
              <div className="admin-card-header bg-warning/5">
                <p className="text-xs font-semibold text-warning uppercase tracking-wide">Suspended ({suspended.length})</p>
              </div>
              <table className="w-full">
                <thead><tr className="admin-thead-row">
                  <th className="admin-th">User</th>
                  <th className="admin-th">Expires in</th>
                  <th className="admin-th text-right">Action</th>
                </tr></thead>
                <tbody>
                  {suspended.map(u => (
                    <tr key={u._id} className="admin-tr">
                      <td className="admin-td"><div className="text-sm font-medium text-ink">{u.name}</div><div className="text-xs text-ink-faint">{u.email}</div></td>
                      <td className="admin-td text-sm text-warning font-medium">{until(u.suspendedUntil)}</td>
                      <td className="admin-td text-right">
                        <button onClick={() => handleUnsuspend(u._id)} className="px-3 py-1 rounded text-xs font-medium text-white bg-warning hover:bg-warning/80 transition-colors">Lift</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {banned.length === 0 && suspended.length === 0 && !loading && (
            <div className="admin-card-surface">
              <div className="admin-empty">No banned or suspended users</div>
            </div>
          )}

          {/* Moderation log */}
          <div className="admin-card-surface">
            <div className="admin-card-header">
              <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide">Moderation Log</p>
            </div>
            <div className="divide-y divide-border">
              {loading ? (
                <div className="p-8 text-center text-sm text-ink-faint">Loading…</div>
              ) : logs.length === 0 ? (
                <div className="p-8 text-center text-sm text-ink-faint">No moderation actions yet</div>
              ) : logs.map(log => (
                <div key={log._id} className="px-4 py-3 hover:bg-mist transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-mist text-ink-soft mr-2">{ACTION_LABELS[log.action] ?? log.action}</span>
                      <span className="text-sm text-ink">{log.reason || '—'}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-ink-faint">{log.moderatorId?.name ?? 'System'}</p>
                      <p className="text-[10px] text-ink-faint">{timeAgo(log.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {total > 15 && (
              <div className="admin-pagination">
                <span>Page {page} · {total} entries</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="admin-pagination-btn">← Prev</button>
                  <button onClick={() => setPage(p => p + 1)} disabled={logs.length < 15} className="admin-pagination-btn">Next →</button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Escalated community posts */
        <div className="admin-card-surface">
          <div className="admin-card-header bg-danger/5">
            <p className="text-xs font-semibold text-danger uppercase tracking-wide">Escalated Posts ({escalatedPosts.length})</p>
          </div>
          {escalatedLoading ? (
            <div className="p-8 text-center text-sm text-ink-faint">Loading escalated posts…</div>
          ) : escalatedPosts.length === 0 ? (
            <div className="admin-empty">No escalated posts requiring attention</div>
          ) : (
            <div className="divide-y divide-border">
              {escalatedPosts.map(post => (
                <div key={post._id} className="p-4 hover:bg-mist transition-colors space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">{post.title}</h3>
                      <p className="text-xs text-ink-faint mt-0.5">
                        Posted by <span className="font-medium text-ink-soft">{post.author}</span> ({post.authorEmail}) · {timeAgo(post.createdAt)}
                      </p>
                    </div>
                    <div className="text-right text-[10px] text-danger font-medium shrink-0 bg-danger/10 px-2 py-0.5 rounded border border-danger/20">
                      Escalated {timeAgo(post.escalatedAt)}
                    </div>
                  </div>

                  {post.escalationReason && (
                    <div className="text-xs bg-mist border border-border p-2 rounded text-ink-soft italic">
                      Reason: {post.escalationReason}
                    </div>
                  )}

                  <p className="text-xs text-ink-soft line-clamp-2">{post.body}</p>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-ink-faint">{post.commentCount} comment{post.commentCount === 1 ? '' : 's'}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const outcome = prompt('Enter resolution details:');
                          if (outcome !== null) handleResolveEscalated(post._id, outcome);
                        }}
                        className="admin-btn-primary px-3 py-1 text-xs"
                      >Resolve</button>
                      <button
                        onClick={() => setDismissModal({ post, reason: '' })}
                        className="admin-btn-outline px-3 py-1 text-xs"
                      >Dismiss</button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setDismissModal(null)}>
          <div className="w-full max-w-sm admin-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header"><p className="text-sm font-semibold text-ink">Dismiss Escalation</p></div>
            <div className="admin-modal-body space-y-3">
              <p className="text-xs text-ink-faint">Dismissing will remove this post from the escalation queue. It will remain unanswered.</p>
              <div>
                <label className="admin-label">Reason (required)</label>
                <textarea rows={3} value={dismissModal.reason} onChange={e => setDismissModal({ ...dismissModal, reason: e.target.value })} placeholder="Reason for dismissal…" className="admin-textarea" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setDismissModal(null)} className="admin-btn-outline">Cancel</button>
                <button onClick={() => { if (dismissModal.reason.trim()) { handleDismissEscalated(dismissModal.post._id, dismissModal.reason); setDismissModal(null); } }} disabled={!dismissModal.reason.trim()} className="admin-btn-danger">Dismiss</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Warn Modal */}
      {warnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setWarnModal(null)}>
          <div className="w-full max-w-sm admin-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header"><p className="text-sm font-semibold text-ink">Warn {warnModal.name}</p></div>
            <div className="admin-modal-body space-y-3">
              <div>
                <label className="admin-label">Reason</label>
                <textarea rows={3} value={warnReason} onChange={e => setWarnReason(e.target.value)} placeholder="Describe the violation…" className="admin-textarea" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setWarnModal(null)} className="admin-btn-outline">Cancel</button>
                <button onClick={handleWarn} disabled={!warnReason} className="admin-btn-primary">Send Warning</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Modal */}
      {suspendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSuspendModal(null)}>
          <div className="w-full max-w-sm admin-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header"><p className="text-sm font-semibold text-ink">Suspend {suspendModal.name}</p></div>
            <div className="admin-modal-body space-y-3">
              <div>
                <label className="admin-label">Duration</label>
                <div className="flex gap-2">
                  {['1h','6h','24h','3d','7d'].map(d => (
                    <button key={d} onClick={() => setSuspendDuration(d)}
                      className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${suspendDuration === d ? 'border-accent bg-accent/10 text-accent' : 'border-border text-ink-soft hover:bg-mist'}`}>{d}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="admin-label">Reason</label>
                <textarea rows={2} value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="Reason for suspension…" className="admin-textarea" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setSuspendModal(null)} className="admin-btn-outline">Cancel</button>
                <button onClick={handleSuspend} disabled={!suspendReason} className="admin-btn-warn">Suspend</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ban Modal */}
      {banModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setBanModal(null)}>
          <div className="w-full max-w-sm admin-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header"><p className="text-sm font-semibold text-danger">Permanently Ban {banModal.name}</p></div>
            <div className="admin-modal-body space-y-3">
              <p className="text-xs text-ink-faint">This will permanently ban the user. They will not be able to access their account.</p>
              <div>
                <label className="admin-label">Reason (required)</label>
                <textarea rows={3} value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Detailed reason for permanent ban…" className="admin-textarea" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setBanModal(null)} className="admin-btn-outline">Cancel</button>
                <button onClick={handleBan} disabled={!banReason} className="admin-btn-danger">Permanently Ban</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
