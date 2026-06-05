import React, { useEffect, useState } from 'react';
import adminApi from '../utils/adminApi';

interface AiGeneratedFaq {
  question: string;
  answer: string;
  category: string;
  tags: string[];
  confidenceScore: number;
  duplicateOf?: string;
  hallucinationFlags: string[];
  grammarIssues: string[];
}

interface QueueItem {
  _id: string;
  title: string;
  body: string;
  answer: string;
  tags: string[];
  author?: { name: string };
  upvotes: number;
  commentCount: number;
  lifecycle: {
    status: string;
    communityAcceptedAt: string;
    aiValidatedAt?: string;
    statusHistory: Array<{ from: string; to: string; changedAt: string; note?: string }>;
  };
  aiGeneratedFaq: AiGeneratedFaq | null;
  existingFaq: { _id: string; trustLevel: string } | null;
  promotedAt?: string;
  sourceCommunityPostId?: { _id: string; title: string; upvotes: string[] };
}

const lifecycleConfig: Record<string, { label: string; class: string }> = {
  open:               { label: 'Open', class: 'bg-admin-surface text-admin-muted border-white/5' },
  answered:           { label: 'Answered', class: 'bg-blue-50 text-blue-700 border-blue-200' },
  community_accepted: { label: 'Community Approved', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ai_validated:       { label: 'AI Validated', class: 'bg-purple-50 text-purple-700 border-purple-200' },
  admin_accepted:     { label: 'Admin Approved', class: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  converted_to_faq:   { label: 'Official FAQ', class: 'bg-stone-100 text-stone-700 border-stone-300' },
};

const trustConfig: Record<string, { label: string; class: string }> = {
  high:   { label: 'Official', class: 'bg-stone-100 text-stone-700 border-stone-300' },
  expert: { label: 'Admin Approved', class: 'bg-blue-50 text-blue-700 border-blue-200' },
  medium: { label: 'Community Approved', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  low:    { label: 'Community', class: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const VALID_CATEGORIES = ['General', 'Internship', 'Offer Letter', 'NOC', 'Project', 'Certificate', 'Team', 'HR', 'IT', 'Other'];

export default function FaqReview() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actioning, setActioning] = useState<string | null>(null);
  const [objectModal, setObjectModal] = useState<string | null>(null);
  const [objectReason, setObjectReason] = useState('');
  const [viewItem, setViewItem] = useState<QueueItem | null>(null);
  const [editData, setEditData] = useState<AiGeneratedFaq | null>(null);
  const [mergeTarget, setMergeTarget] = useState('');
  const [aiBatchLoading, setAiBatchLoading] = useState(false);

  const limit = 20;

  useEffect(() => {
    loadQueue(page);
  }, [page]);

  async function loadQueue(p: number) {
    setLoading(true);
    try {
      const res = await adminApi.get(`/admin/community-promotions/queue?page=${p}&limit=${limit}`);
      setQueue(res.data.queue ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAIReviewBatch() {
    setAiBatchLoading(true);
    try {
      await adminApi.post('/admin/community-promotions/ai-review-batch');
      await loadQueue(page);
    } catch (e) { console.warn(e); }
    finally { setAiBatchLoading(false); }
  }

  async function handleApprove(item: QueueItem) {
    setActioning(item._id);
    try {
      // Approve existing FAQ or promote to expert then official
      const faqId = item.existingFaq?._id;
      if (faqId) {
        await adminApi.post(`/admin/faqs/${faqId}/promote`, { targetLevel: 'expert' });
        await adminApi.post(`/admin/faqs/${faqId}/promote`, { targetLevel: 'high' });
      } else {
        // Create FAQ from post then promote
        await adminApi.post(`/admin/community-promotions/${item._id}/ai-review`);
      }
      await loadQueue(page);
    } catch (e) { console.warn(e); }
    finally { setActioning(null); }
  }

  async function handleReject(itemId: string) {
    if (!objectReason.trim()) return;
    setActioning(itemId);
    try {
      const item = queue.find(q => q._id === itemId);
      if (item?.existingFaq?._id) {
        await adminApi.post(`/admin/faqs/${item.existingFaq._id}/object`, { reason: objectReason.trim() });
      }
      setObjectModal(null);
      setObjectReason('');
      await loadQueue(page);
    } catch (e) { console.warn(e); }
    finally { setActioning(null); }
  }

  async function handleMerge(item: QueueItem) {
    if (!mergeTarget.trim()) return;
    setActioning(item._id);
    try {
      // Mark as merged: update the lifecycle, update FAQ tags
      await adminApi.patch(`/admin/faqs/${item.existingFaq?._id ?? item._id}`, {
        tags: item.aiGeneratedFaq?.tags ?? item.tags,
      });
      await loadQueue(page);
    } catch (e) { console.warn(e); }
    finally { setActioning(null); setMergeTarget(''); }
  }

  async function handleEditSave(item: QueueItem) {
    if (!editData) return;
    setActioning(item._id);
    try {
      await adminApi.patch(`/admin/faqs/${item.existingFaq?._id ?? item._id}`, {
        question: editData.question,
        answer: editData.answer,
        category: editData.category,
        tags: editData.tags,
      });
      setViewItem(null);
      setEditData(null);
      await loadQueue(page);
    } catch (e) { console.warn(e); }
    finally { setActioning(null); }
  }

  const totalPages = Math.ceil(total / limit);
  const lc = lifecycleConfig;
  const tc = trustConfig;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">FAQ Review</h1>
          <p className="text-sm text-ink-faint mt-1">
            Review and upgrade community-promoted FAQs. Community Approved FAQs are already visible to users.
          </p>
        </div>
        <div className="text-sm text-ink-faint">{total} total</div>
        <button
          onClick={handleAIReviewBatch}
          disabled={aiBatchLoading}
          className="text-xs px-4 py-2 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 disabled:opacity-50 transition-colors"
        >
          {aiBatchLoading ? 'Running AI...' : 'Run AI Batch Review'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-ink-faint">Loading...</div>
      ) : queue.length === 0 ? (
        <div className="text-center py-12 text-ink-faint border rounded-xl">
          No community-promoted FAQs to review yet.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-semibold text-ink-faint">Question</th>
                  <th className="text-left py-3 px-4 font-semibold text-ink-faint">Stage</th>
                  <th className="text-left py-3 px-4 font-semibold text-ink-faint">AI Confidence</th>
                  <th className="text-left py-3 px-4 font-semibold text-ink-faint">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => {
                  const lcCfg = lc[item.lifecycle?.status ?? 'community_accepted'] ?? lc['community_accepted'];
                  const ai = item.aiGeneratedFaq;
                  const hasDuplicate = !!ai?.duplicateOf;
                  return (
                    <tr key={item._id} className="border-b border-border/50 hover:bg-cream/50 transition-colors">
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-medium text-ink truncate">{item.title}</div>
                        <div className="text-xs text-ink-faint mt-0.5 truncate">
                          by {item.author?.name ?? 'unknown'} · {item.upvotes} upvotes
                        </div>
                        {ai && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {(ai.tags ?? []).map(tag => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-100">{tag}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${lcCfg.class}`}>
                          {lcCfg.label}
                        </span>
                        {hasDuplicate && (
                          <div className="text-[10px] text-amber-600 mt-0.5">Duplicate flagged</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {ai ? (
                          <div className="flex items-center gap-1">
                            <div className="w-12 h-1.5 bg-admin-surface rounded-full overflow-hidden">
                              <div className="h-full bg-purple-500 rounded-full" style={{ width: `${ai.confidenceScore}%` }} />
                            </div>
                            <span className="text-xs text-ink-faint">{ai.confidenceScore}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-500">Pending AI review</span>
                        )}
                        {(ai?.hallucinationFlags?.length ?? 0) > 0 && (
                          <div className="text-[10px] text-red-500 mt-0.5">{ai!.hallucinationFlags!.length} hallucination flags</div>
                        )}
                        {(ai?.grammarIssues?.length ?? 0) > 0 && (
                          <div className="text-[10px] text-amber-500 mt-0.5">{ai!.grammarIssues!.length} grammar issues</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.lifecycle?.status === 'ai_validated' && (
                            <>
                              <button
                                onClick={() => handleApprove(item)}
                                disabled={actioning === item._id}
                                className="text-xs px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                              >
                                {actioning === item._id ? '...' : '✓ Approve'}
                              </button>
                              <button
                                onClick={() => { setViewItem(item); setEditData(ai ?? { question: item.title, answer: item.answer ?? '', category: 'General', tags: item.tags, confidenceScore: 0, hallucinationFlags: [], grammarIssues: [] }); }}
                                className="text-xs px-3 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                              >
                                Edit
                              </button>
                            </>
                          )}
                          {item.lifecycle?.status === 'community_accepted' && hasDuplicate && (
                            <button
                              onClick={() => setMergeTarget(item._id)}
                              className="text-xs px-3 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                            >
                              Merge
                            </button>
                          )}
                          <button
                            onClick={() => { setViewItem(item); setEditData(null); }}
                            className="text-xs px-3 py-1 rounded-lg border border-border hover:bg-cream transition-colors"
                          >
                            View
                          </button>
                          <button
                            onClick={() => setObjectModal(item._id)}
                            className="text-xs px-3 py-1 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                          >
                            Object
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm rounded-lg border border-border hover:bg-cream disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-ink-faint">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1 text-sm rounded-lg border border-border hover:bg-cream disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* View / Edit Modal */}
      {viewItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-y-auto py-8">
          <div className="bg-admin-card rounded-2xl shadow-xl w-full max-w-2xl mx-4">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-ink">Review Details</h2>
              <button onClick={() => { setViewItem(null); setEditData(null); }} className="text-ink-faint hover:text-ink transition-colors">✕</button>
            </div>

            <div className="p-6 space-y-5">
              {/* Stage + badges */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded border font-medium ${lc[viewItem.lifecycle?.status ?? 'community_accepted']?.class ?? lc['community_accepted'].class}`}>
                  {lc[viewItem.lifecycle?.status ?? 'community_accepted']?.label}
                </span>
                {viewItem.aiGeneratedFaq?.duplicateOf && (
                  <span className="text-xs px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200 font-medium">
                    Duplicate flagged
                  </span>
                )}
                {viewItem.existingFaq && (
                  <span className={`text-xs px-2 py-0.5 rounded border font-medium ${tc[viewItem.existingFaq.trustLevel]?.class ?? 'bg-admin-bg text-admin-muted border-white/5'}`}>
                    {tc[viewItem.existingFaq.trustLevel]?.label ?? viewItem.existingFaq.trustLevel}
                  </span>
                )}
              </div>

              {/* Original question */}
              <div>
                <div className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-1">Original Question</div>
                <div className="font-medium text-ink">{viewItem.title}</div>
                <div className="text-sm text-ink-faint mt-1">{viewItem.body?.slice(0, 300)}{viewItem.body?.length > 300 ? '…' : ''}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {(viewItem.tags ?? []).map(tag => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-admin-bg text-admin-muted rounded border border-white/5">{tag}</span>
                  ))}
                </div>
              </div>

              {/* Accepted answer */}
              {viewItem.answer && (
                <div>
                  <div className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-1">Accepted Answer</div>
                  <div className="text-sm text-ink bg-emerald-50 rounded-xl p-3 border border-emerald-100">{viewItem.answer}</div>
                  <div className="text-xs text-ink-faint mt-1">by {viewItem.author?.name ?? 'unknown'} · {viewItem.upvotes} upvotes</div>
                </div>
              )}

              {/* AI generated FAQ */}
              {viewItem.aiGeneratedFaq ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-semibold text-ink-faint uppercase tracking-wide">AI Generated FAQ</div>
                    <div className="flex items-center gap-1">
                      <div className="w-16 h-1.5 bg-admin-surface rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${viewItem.aiGeneratedFaq.confidenceScore}%` }} />
                      </div>
                      <span className="text-xs text-ink-faint">{viewItem.aiGeneratedFaq.confidenceScore}% conf.</span>
                    </div>
                  </div>
                  {editData ? (
                    <div className="space-y-2">
                      <input value={editData.question} onChange={e => setEditData({ ...editData, question: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="Question..." />
                      <textarea value={editData.answer} onChange={e => setEditData({ ...editData, answer: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" rows={4} placeholder="Answer..." />
                      <select value={editData.category} onChange={e => setEditData({ ...editData, category: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
                        {VALID_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input value={editData.tags?.join(', ')} onChange={e => setEditData({ ...editData, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="Tags (comma separated)..." />
                      <div className="flex gap-2">
                        <button onClick={() => setEditData(null)} className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-cream transition-colors">Cancel</button>
                        <button onClick={() => handleEditSave(viewItem)} disabled={actioning === viewItem._id} className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                          {actioning === viewItem._id ? '...' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-purple-50 rounded-xl p-3 border border-purple-100 space-y-2">
                      <div className="font-medium text-sm text-ink">{viewItem.aiGeneratedFaq.question}</div>
                      <div className="text-sm text-ink">{viewItem.aiGeneratedFaq.answer}</div>
                      <div className="text-xs text-ink-faint">{viewItem.aiGeneratedFaq.category} · {(viewItem.aiGeneratedFaq.tags ?? []).join(', ')}</div>
                      {(viewItem.aiGeneratedFaq.hallucinationFlags ?? []).length > 0 && (
                        <div className="mt-2">
                          <div className="text-[10px] font-semibold text-red-500 uppercase mb-1">Hallucination flags</div>
                          {(viewItem.aiGeneratedFaq.hallucinationFlags ?? []).map((f, i) => (
                            <div key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1 mb-0.5">⚠ {f}</div>
                          ))}
                        </div>
                      )}
                      {(viewItem.aiGeneratedFaq.grammarIssues ?? []).length > 0 && (
                        <div className="mt-2">
                          <div className="text-[10px] font-semibold text-amber-600 uppercase mb-1">Grammar issues</div>
                          {(viewItem.aiGeneratedFaq.grammarIssues ?? []).map((g, i) => (
                            <div key={i} className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 mb-0.5">✎ {g}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-amber-500 bg-amber-50 rounded-xl p-3 border border-amber-100">
                  Pending AI review — click "Run AI Batch Review" or trigger individually
                </div>
              )}

              {/* Activity timeline */}
              {viewItem.lifecycle?.statusHistory?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">Activity Timeline</div>
                  <div className="space-y-2">
                    {(viewItem.lifecycle.statusHistory ?? []).map((h, i) => (
                      <div key={i} className="flex gap-3 text-xs">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-accent mt-1 shrink-0" />
                          {i < (viewItem.lifecycle.statusHistory ?? []).length - 1 && <div className="w-px flex-1 bg-border mt-0.5" />}
                        </div>
                        <div className="pb-2">
                          <div className="font-medium text-ink">{h.from || '—'} → {h.to}</div>
                          <div className="text-ink-faint">{h.note ?? ''}</div>
                          <div className="text-ink-subtle">{new Date(h.changedAt).toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal actions */}
            <div className="flex items-center justify-between p-6 border-t border-border">
              <div className="flex gap-2">
                {viewItem.lifecycle?.status === 'ai_validated' && !editData && (
                  <>
                    <button onClick={() => setEditData(viewItem.aiGeneratedFaq ?? { question: viewItem.title, answer: viewItem.answer ?? '', category: 'General', tags: viewItem.tags, confidenceScore: 0, hallucinationFlags: [], grammarIssues: [] })} className="px-3 py-1.5 text-xs rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors">Edit</button>
                    <button onClick={() => handleApprove(viewItem)} disabled={actioning === viewItem._id} className="px-3 py-1.5 text-xs rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 transition-colors">
                      {actioning === viewItem._id ? '...' : '✓ Approve'}
                    </button>
                    {viewItem.aiGeneratedFaq?.duplicateOf && (
                      <button onClick={() => setMergeTarget(viewItem._id)} className="px-3 py-1.5 text-xs rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors">Merge</button>
                    )}
                  </>
                )}
              </div>
              <button onClick={() => { setViewItem(null); setEditData(null); }} className="px-4 py-1.5 text-sm rounded-lg border border-border hover:bg-cream transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Modal */}
      {mergeTarget && (() => {
        const item = queue.find(q => q._id === mergeTarget);
        if (!item) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-admin-card rounded-2xl shadow-xl p-6 w-full max-w-md">
              <h2 className="text-lg font-semibold text-ink mb-2">Merge Duplicate FAQ</h2>
              <p className="text-sm text-ink-faint mb-4">
                Merge <strong className="text-ink">{item.title}</strong> into an existing FAQ to avoid duplication.
              </p>
              {item.aiGeneratedFaq?.duplicateOf && (
                <div className="text-xs bg-amber-50 text-amber-700 rounded-lg px-3 py-2 mb-4 border border-amber-100">
                  AI flagged this as duplicate of FAQ: <span className="font-mono">{item.aiGeneratedFaq.duplicateOf}</span>
                </div>
              )}
              <div className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-1">Tags to merge</div>
              <div className="flex flex-wrap gap-1 mb-4">
                {(item.aiGeneratedFaq?.tags ?? item.tags ?? []).map(tag => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-100">{tag}</span>
                ))}
              </div>
              <textarea
                value={objectReason}
                onChange={e => setObjectReason(e.target.value)}
                placeholder="Merge target FAQ ID (MongoDB ObjectId)..."
                className="w-full border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none font-mono"
                rows={2}
              />
              <div className="flex items-center justify-end gap-3 mt-4">
                <button onClick={() => { setMergeTarget(''); setObjectReason(''); }} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-cream transition-colors">Cancel</button>
                <button onClick={() => handleMerge(item)} disabled={!objectReason.trim() || actioning === item._id} className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors">
                  {actioning === item._id ? '...' : 'Merge'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Objection Modal */}
      {objectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-admin-card rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-ink mb-4">Object to Promotion</h2>
            <p className="text-sm text-ink-faint mb-4">
              Provide a reason for your objection. This will prevent further auto-promotion of this content.
            </p>
            <textarea
              value={objectReason}
              onChange={e => setObjectReason(e.target.value)}
              placeholder="Reason for objection..."
              className="w-full border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
              rows={3}
            />
            <div className="flex items-center justify-end gap-3 mt-4">
              <button
                onClick={() => { setObjectModal(null); setObjectReason(''); }}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-cream transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(objectModal)}
                disabled={!objectReason.trim() || actioning === objectModal}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {actioning === objectModal ? '...' : 'Submit Objection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}