import { useEffect, useState } from 'react';
import adminApi from '../utils/adminApi';
import { friendlyError } from '../../utils/api';
import Badge from '../components/common/Badge';
import { AdminCard } from '../components/ui';

interface QueuedPost {
  _id: string;
  title: string;
  body?: string;
  status: string;
  aiAnswer?: string | null;
  aiAnswerConfidence?: number | null;
  aiAnswerStatus?: string;
  aiAnswerSource?: string | null;
  aiAnswerSuggestedAt?: string | null;
  aiAnswerAttempts?: number;
  tags?: string[];
  createdAt?: string;
  author?: { name?: string; email?: string };
}

interface QueueResponse {
  queue: QueuedPost[];
  counts: { suggested: number; escalated: number };
}

export default function AdminAutoAnswerQueue() {
  const [posts, setPosts] = useState<QueuedPost[]>([]);
  const [counts, setCounts] = useState({ suggested: 0, escalated: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'suggested' | 'escalated'>('all');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  const fetchQueue = () => {
    setLoading(true);
    adminApi.get<QueueResponse>('/admin/auto-answer/queue')
      .then((r) => { setPosts(r.data.queue ?? []); setCounts(r.data.counts ?? { suggested: 0, escalated: 0 }); })
      .catch((e) => setActionError(friendlyError(e, 'Failed to load queue')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchQueue(); }, []);

  const handleAction = async (postId: string, action: 'approve' | 'reject' | 'escalate', manualAnswer?: string) => {
    setActionError(null);
    setActionLoading(postId);
    try {
      await adminApi.patch(`/admin/auto-answer/${postId}`, { action, manualAnswer });
      fetchQueue();
    } catch (e) {
      setActionError(friendlyError(e, `Action failed`));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunAutoAnswer = async () => {
    setRunLoading(true);
    setRunResult(null);
    try {
      const r = await adminApi.post('/admin/community/auto-answer');
      setRunResult(`${r.data.message} — processed: ${r.data.processed}, auto-approved: ${r.data.auto_approved}, suggested: ${r.data.suggested}, escalated: ${r.data.escalated}, errors: ${r.data.errors}`);
      fetchQueue();
    } catch (e) {
      setRunResult(`Error: ${friendlyError(e, 'Run failed')}`);
    } finally {
      setRunLoading(false);
    }
  };

  const handleDryRun = async () => {
    setRunLoading(true);
    setRunResult(null);
    try {
      const r = await adminApi.get('/admin/community/auto-answer?dry_run=true');
      setRunResult(`Dry run: would process ${r.data.would_process} posts`);
    } catch (e) {
      setRunResult(`Error: ${friendlyError(e, 'Dry run failed')}`);
    } finally {
      setRunLoading(false);
    }
  };

  const filtered = posts.filter((p) => {
    if (filter === 'all') return true;
    return p.aiAnswerStatus === filter;
  });

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-ink">AI Auto-Answer Queue</h1>
          <p className="text-xs text-ink-faint mt-0.5">Review suggested answers or escalate to human moderators</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDryRun} disabled={runLoading} className="text-xs px-3.5 py-1.5 rounded-lg border border-border text-ink-soft hover:text-ink hover:bg-mist transition-all disabled:opacity-50">
            Dry Run
          </button>
          <button onClick={handleRunAutoAnswer} disabled={runLoading} className="text-xs px-3.5 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-all disabled:opacity-50">
            {runLoading ? 'Running…' : 'Run Now'}
          </button>
        </div>
      </div>

      {/* Run result */}
      {runResult && (
        <div className={`text-xs px-4 py-3 rounded-xl border ${runResult.startsWith('Error') ? 'bg-danger/5 border-danger/20 text-danger' : 'bg-card border-border text-ink'}`}>
          {runResult}
        </div>
      )}

      {actionError && (
        <div className="text-xs px-4 py-3 rounded-xl bg-danger/5 border border-danger/20 text-danger">
          {actionError}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <AdminCard noPadding>
          <div className="p-4">
            <p className="text-2xl font-bold text-ink">{counts.suggested}</p>
            <p className="text-xs text-ink-soft mt-0.5">Suggested</p>
            <p className="text-[10px] text-ink-faint mt-1">AI found an answer — review before posting</p>
          </div>
        </AdminCard>
        <AdminCard noPadding>
          <div className="p-4">
            <p className="text-2xl font-bold text-warning">{counts.escalated}</p>
            <p className="text-xs text-ink-soft mt-0.5">Escalated</p>
            <p className="text-[10px] text-ink-faint mt-1">Sensitive or no match found — human needed</p>
          </div>
        </AdminCard>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-1">
        {(['all', 'suggested', 'escalated'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              filter === f
                ? 'bg-accent/10 border-accent/20 text-accent'
                : 'bg-card border-border text-ink-soft hover:text-ink hover:bg-mist'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Queue */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-mist rounded w-3/4 mb-2" />
              <div className="h-3 bg-mist rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl px-6 py-12 text-center">
          <p className="text-sm text-ink-faint">Queue is empty — no posts need review</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((post) => (
            <div key={post._id} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-semibold text-ink">{post.title}</h3>
                      <Badge
                        status={post.aiAnswerStatus === 'escalated' ? 'rejected' : post.aiAnswerStatus === 'suggested' ? 'pending' : 'default'}
                        label={post.aiAnswerStatus ?? ''}
                        showDot={false}
                      />
                    </div>
                    <p className="text-xs text-ink-faint line-clamp-1">{post.body}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-[10px] text-ink-faint">by {post.author?.name ?? 'Unknown'}</span>
                      {post.aiAnswerSource && (
                        <span className="text-[10px] text-ink-faint">Source: {post.aiAnswerSource}</span>
                      )}
                      {post.aiAnswerConfidence != null && (
                        <span className={`text-[10px] font-medium ${post.aiAnswerConfidence >= 0.85 ? 'text-success' : 'text-warning'}`}>
                          {Math.round(post.aiAnswerConfidence * 100)}% confidence
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleAction(post._id, 'approve')}
                      disabled={actionLoading === post._id}
                      className="text-[11px] px-3 py-1.5 rounded-lg bg-success/10 border border-success/20 text-success hover:bg-success/20 transition-all disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleAction(post._id, 'reject')}
                      disabled={actionLoading === post._id}
                      className="text-[11px] px-3 py-1.5 rounded-lg bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 transition-all disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleAction(post._id, 'escalate')}
                      disabled={actionLoading === post._id}
                      className="text-[11px] px-3 py-1.5 rounded-lg bg-warning/10 border border-warning/20 text-warning hover:bg-warning/20 transition-all disabled:opacity-50"
                    >
                      Escalate
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded answer preview */}
              {expandedId === post._id && post.aiAnswer && (
                <div className="px-4 pb-4">
                  <div className="bg-mist rounded-xl p-4 border border-border">
                    <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest mb-2">AI Suggested Answer</p>
                    <p className="text-sm text-ink/80 leading-relaxed whitespace-pre-wrap">{post.aiAnswer}</p>
                    {post.aiAnswerConfidence != null && (
                      <p className="text-[10px] text-ink-faint mt-2">Confidence: {Math.round(post.aiAnswerConfidence * 100)}% · {post.aiAnswerSource}</p>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <textarea
                      id={`manual-${post._id}`}
                      placeholder="Optional: replace with a manual answer before approving…"
                      rows={3}
                      className="flex-1 rounded-xl border border-border bg-mist px-3 py-2 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 resize-none"
                    />
                    <button
                      onClick={() => {
                        const ta = document.getElementById(`manual-${post._id}`) as HTMLTextAreaElement;
                        handleAction(post._id, 'approve', ta?.value);
                      }}
                      className="text-[11px] px-3 py-1.5 rounded-lg bg-accent text-accent-text hover:bg-accent/80 transition-all shrink-0"
                    >
                      Approve with Edit
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}