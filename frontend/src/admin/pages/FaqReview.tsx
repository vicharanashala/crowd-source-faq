import { useEffect, useState } from 'react';
import adminApi from '../utils/adminApi';
import { friendlyError } from '../../utils/api';

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
  open:               { label: 'Open',              class: 'bg-border/40 text-ink-faint border-border' },
  answered:           { label: 'Answered',           class: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  community_accepted: { label: 'Community Approved', class: 'bg-success/10 text-success border-success/20' },
  ai_validated:       { label: 'AI Validated',       class: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  admin_accepted:     { label: 'Admin Approved',     class: 'bg-[rgba(99,102,241,0.12)] text-[#a5b4fc] border-[rgba(99,102,241,0.2)]' },
  converted_to_faq:   { label: 'Official FAQ',       class: 'bg-accent/10 text-accent border-accent/20' },
  pending_review:     { label: 'Pending Review',     class: 'bg-warning/10 text-warning border-warning/20' },
  update_requested:   { label: 'Update Requested',   class: 'bg-danger/10 text-danger border-danger/20' },
};

const trustConfig: Record<string, { label: string; class: string }> = {
  high:   { label: 'Official',           class: 'bg-accent/10 text-accent border-accent/20' },
  expert: { label: 'Admin Approved',     class: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  medium: { label: 'Community Approved', class: 'bg-success/10 text-success border-success/20' },
  low:    { label: 'Community',          class: 'bg-warning/10 text-warning border-warning/20' },
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
    } catch (e) { console.warn(friendlyError(e, 'Batch review failed.')); }
    finally { setAiBatchLoading(false); }
  }

  async function handleApprove(item: QueueItem) {
    setActioning(item._id);
    try {
      if ((item as any).isReportedFAQ) {
        await adminApi.put(`/admin/faq/${item._id}`, {});
      } else {
        const faqId = item.existingFaq?._id;
        if (faqId) {
          await adminApi.post(`/admin/faqs/${faqId}/promote`, { targetLevel: 'expert' });
          await adminApi.post(`/admin/faqs/${faqId}/promote`, { targetLevel: 'high' });
        } else {
          await adminApi.post(`/admin/community-promotions/${item._id}/ai-review`);
        }
      }
      await loadQueue(page);
    } catch (e) { console.warn(friendlyError(e, 'Approve failed.')); }
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
    } catch (e) { console.warn(friendlyError(e, 'Reject failed.')); }
    finally { setActioning(null); }
  }

  async function handleMerge(item: QueueItem) {
    if (!mergeTarget.trim()) return;
    setActioning(item._id);
    try {
      await adminApi.patch(`/admin/faqs/${item.existingFaq?._id ?? item._id}`, {
        tags: item.aiGeneratedFaq?.tags ?? item.tags,
      });
      await loadQueue(page);
    } catch (e) { console.warn(friendlyError(e, 'Merge failed.')); }
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
    } catch (e) { console.warn(friendlyError(e, 'Edit save failed.')); }
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
          className="text-xs px-4 py-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 disabled:opacity-50 transition-colors"
        >
          {aiBatchLoading ? 'Running AI...' : 'Run AI Batch Review'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-ink-faint">Loading...</div>
      ) : queue.length === 0 ? (
        <div className="admin-empty border border-border rounded-xl">
          No community-promoted FAQs to review yet.
        </div>
      ) : (
        <>
          <div className="admin-table-wrap">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="admin-thead-row">
                    <th className="admin-th">Question</th>
                    <th className="admin-th">Stage</th>
                    <th className="admin-th">AI Confidence</th>
                    <th className="admin-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((item) => {
                    const lcCfg = lc[item.lifecycle?.status ?? 'community_accepted'] ?? lc['community_accepted'];
                    const ai = item.aiGeneratedFaq;
                    const hasDuplicate = !!ai?.duplicateOf;
                    return (
                      <tr key={item._id} className="admin-tr">
                        <td className="admin-td max-w-xs">
                          <div className="font-medium text-ink truncate" title={item.title}>{item.title}</div>
                          <div className="text-xs text-ink-faint mt-0.5 truncate">
                            by {item.author?.name ?? 'unknown'} · {(item as any).isReportedFAQ ? `${item.commentCount} report(s)` : `${item.upvotes} upvotes`}
                          </div>
                          {(item as any).isReportedFAQ && item.body && (
                            <div className="text-xs text-danger bg-danger/10 rounded-lg p-2 mt-1 border border-danger/20 break-words whitespace-pre-wrap">
                              <strong>Reason:</strong> {item.body}
                            </div>
                          )}
                          {ai && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {(ai.tags ?? []).map(tag => (
                                <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">{tag}</span>
                              ))}
                            </div>
                          )}
                          {hasDuplicate && (
                            <div className="text-[10px] text-warning mt-0.5">Duplicate flagged</div>
                          )}
                        </td>
                        <td className="admin-td">
                          {(item as any).isReportedFAQ ? (
                            <span className="text-xs text-ink-soft">Reported FAQ</span>
                          ) : (
                            <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${lcCfg.class}`}>
                              {lcCfg.label}
                            </span>
                          )}
                        </td>
                        <td className="admin-td">
                          {ai && (
                            <div className="flex items-center gap-1">
                              <div className="w-12 h-1.5 bg-border rounded-full overflow-hidden">
                                <div className="h-full bg-purple-400 rounded-full" style={{ width: `${ai.confidenceScore}%` }} />
                              </div>
                              <span className="text-xs text-ink-faint">{ai.confidenceScore}%</span>
                            </div>
                          )}
                          {(ai?.hallucinationFlags?.length ?? 0) > 0 && (
                            <div className="text-[10px] text-danger mt-0.5">{ai!.hallucinationFlags!.length} hallucination flags</div>
                          )}
                          {(ai?.grammarIssues?.length ?? 0) > 0 && (
                            <div className="text-[10px] text-warning mt-0.5">{ai!.grammarIssues!.length} grammar issues</div>
                          )}
                        </td>
                        <td className="admin-td">
                          <div className="flex items-center gap-2 flex-wrap">
                            {((item as any).isReportedFAQ || item.lifecycle?.status === 'ai_validated') && (
                              <>
                                <button
                                  onClick={() => handleApprove(item)}
                                  disabled={actioning === item._id}
                                  className="text-xs px-3 py-1 rounded-lg bg-success/10 text-success border border-success/20 hover:bg-success/20 disabled:opacity-50 transition-colors"
                                >
                                  {actioning === item._id ? '...' : (item as any).isReportedFAQ ? '✓ Verify' : '✓ Approve'}
                                </button>
                                <button
                                  onClick={() => { setViewItem(item); setEditData(ai ?? { question: item.title, answer: item.answer ?? '', category: (item as any).category || 'General', tags: item.tags || [], confidenceScore: 0, hallucinationFlags: [], grammarIssues: [] }); }}
                                  className="text-xs px-3 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                                >
                                  Edit
                                </button>
                              </>
                            )}
                            {item.lifecycle?.status === 'community_accepted' && hasDuplicate && (
                              <button
                                onClick={() => setMergeTarget(item._id)}
                                className="text-xs px-3 py-1 rounded-lg bg-warning/10 text-warning border border-warning/20 hover:bg-warning/20 transition-colors"
                              >
                                Merge
                              </button>
                            )}
                            {!(item as any).isReportedFAQ && (
                              <>
                                <button
                                  onClick={() => { setViewItem(item); setEditData(null); }}
                                  className="text-xs px-3 py-1 rounded-lg border border-border text-ink-soft hover:bg-mist transition-colors"
                                >
                                  View
                                </button>
                                <button
                                  onClick={() => setObjectModal(item._id)}
                                  className="text-xs px-3 py-1 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 transition-colors"
                                >
                                  Object
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="admin-pagination">
                <span>Page {page} of {totalPages} · {total} items</span>
                <div className="flex gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="admin-pagination-btn">← Prev</button>
                  <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} className="admin-pagination-btn">Next →</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* View / Edit Modal */}
      {viewItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-8">
          <div className="admin-modal-panel w-full max-w-2xl mx-4">
            <div className="admin-modal-header">
              <h2 className="text-lg font-semibold text-ink">Review Details</h2>
              <button onClick={() => { setViewItem(null); setEditData(null); }} className="text-ink-faint hover:text-ink transition-colors">✕</button>
            </div>

            <div className="admin-modal-body space-y-5">
              {/* Stage + badges */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded border font-medium ${lc[viewItem.lifecycle?.status ?? 'community_accepted']?.class ?? lc['community_accepted'].class}`}>
                  {lc[viewItem.lifecycle?.status ?? 'community_accepted']?.label}
                </span>
                {viewItem.aiGeneratedFaq?.duplicateOf && (
                  <span className="text-xs px-2 py-0.5 rounded border bg-warning/10 text-warning border-warning/20 font-medium">
                    Duplicate flagged
                  </span>
                )}
                {viewItem.existingFaq && (
                  <span className={`text-xs px-2 py-0.5 rounded border font-medium ${tc[viewItem.existingFaq.trustLevel]?.class ?? 'bg-border/40 text-ink-faint border-border'}`}>
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
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-mist text-ink-faint rounded border border-border">{tag}</span>
                  ))}
                </div>
              </div>

              {/* Accepted answer */}
              {viewItem.answer && (
                <div>
                  <div className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-1">Accepted Answer</div>
                  <div className="text-sm text-ink bg-success/10 rounded-xl p-3 border border-success/20">{viewItem.answer}</div>
                  <div className="text-xs text-ink-faint mt-1">by {viewItem.author?.name ?? 'unknown'} · {viewItem.upvotes} upvotes</div>
                </div>
              )}

              {/* AI generated FAQ */}
              {viewItem.aiGeneratedFaq ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-semibold text-ink-faint uppercase tracking-wide">AI Generated FAQ</div>
                    <div className="flex items-center gap-1">
                      <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-purple-400 rounded-full" style={{ width: `${viewItem.aiGeneratedFaq.confidenceScore}%` }} />
                      </div>
                      <span className="text-xs text-ink-faint">{viewItem.aiGeneratedFaq.confidenceScore}% conf.</span>
                    </div>
                  </div>
                  {editData ? (
                    <div className="space-y-2">
                      <input value={editData.question} onChange={e => setEditData({ ...editData, question: e.target.value })} className="admin-input" placeholder="Question..." />
                      <textarea value={editData.answer} onChange={e => setEditData({ ...editData, answer: e.target.value })} className="admin-textarea" rows={4} placeholder="Answer..." />
                      <select value={editData.category} onChange={e => setEditData({ ...editData, category: e.target.value })} className="admin-select w-full">
                        {VALID_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input value={editData.tags?.join(', ')} onChange={e => setEditData({ ...editData, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} className="admin-input" placeholder="Tags (comma separated)..." />
                      <div className="flex gap-2">
                        <button onClick={() => setEditData(null)} className="admin-btn-ghost text-xs px-3 py-1.5">Cancel</button>
                        <button onClick={() => handleEditSave(viewItem)} disabled={actioning === viewItem._id} className="admin-btn-primary text-xs px-3 py-1.5">
                          {actioning === viewItem._id ? '...' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-purple-500/10 rounded-xl p-3 border border-purple-500/20 space-y-2">
                      <div className="font-medium text-sm text-ink">{viewItem.aiGeneratedFaq.question}</div>
                      <div className="text-sm text-ink">{viewItem.aiGeneratedFaq.answer}</div>
                      <div className="text-xs text-ink-faint">{viewItem.aiGeneratedFaq.category} · {(viewItem.aiGeneratedFaq.tags ?? []).join(', ')}</div>
                      {(viewItem.aiGeneratedFaq.hallucinationFlags ?? []).length > 0 && (
                        <div className="mt-2">
                          <div className="text-[10px] font-semibold text-danger uppercase mb-1">Hallucination flags</div>
                          {(viewItem.aiGeneratedFaq.hallucinationFlags ?? []).map((f, i) => (
                            <div key={i} className="text-xs text-danger bg-danger/10 rounded px-2 py-1 mb-0.5">⚠ {f}</div>
                          ))}
                        </div>
                      )}
                      {(viewItem.aiGeneratedFaq.grammarIssues ?? []).length > 0 && (
                        <div className="mt-2">
                          <div className="text-[10px] font-semibold text-warning uppercase mb-1">Grammar issues</div>
                          {(viewItem.aiGeneratedFaq.grammarIssues ?? []).map((g, i) => (
                            <div key={i} className="text-xs text-warning bg-warning/10 rounded px-2 py-1 mb-0.5">✎ {g}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-warning bg-warning/10 rounded-xl p-3 border border-warning/20">
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
                          <div className="text-ink-faint/60">{new Date(h.changedAt).toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal actions */}
            <div className="admin-modal-footer justify-between">
              <div className="flex gap-2">
                {viewItem.lifecycle?.status === 'ai_validated' && !editData && (
                  <>
                    <button onClick={() => setEditData(viewItem.aiGeneratedFaq ?? { question: viewItem.title, answer: viewItem.answer ?? '', category: 'General', tags: viewItem.tags, confidenceScore: 0, hallucinationFlags: [], grammarIssues: [] })} className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors">Edit</button>
                    <button onClick={() => handleApprove(viewItem)} disabled={actioning === viewItem._id} className="text-xs px-3 py-1.5 rounded-lg bg-success/10 text-success border border-success/20 hover:bg-success/20 disabled:opacity-50 transition-colors">
                      {actioning === viewItem._id ? '...' : '✓ Approve'}
                    </button>
                    {viewItem.aiGeneratedFaq?.duplicateOf && (
                      <button onClick={() => setMergeTarget(viewItem._id)} className="text-xs px-3 py-1.5 rounded-lg bg-warning/10 text-warning border border-warning/20 hover:bg-warning/20 transition-colors">Merge</button>
                    )}
                  </>
                )}
              </div>
              <button onClick={() => { setViewItem(null); setEditData(null); }} className="admin-btn-ghost text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Modal */}
      {mergeTarget && (() => {
        const item = queue.find(q => q._id === mergeTarget);
        if (!item) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="admin-modal-panel w-full max-w-md mx-4">
              <div className="admin-modal-header">
                <h2 className="text-lg font-semibold text-ink">Merge Duplicate FAQ</h2>
                <button onClick={() => { setMergeTarget(''); setObjectReason(''); }} className="text-ink-faint hover:text-ink transition-colors">✕</button>
              </div>
              <div className="admin-modal-body space-y-4">
                <p className="text-sm text-ink-faint">
                  Merge <strong className="text-ink">{item.title}</strong> into an existing FAQ to avoid duplication.
                </p>
                {item.aiGeneratedFaq?.duplicateOf && (
                  <div className="text-xs bg-warning/10 text-warning rounded-lg px-3 py-2 border border-warning/20">
                    AI flagged this as duplicate of FAQ: <span className="font-mono">{item.aiGeneratedFaq.duplicateOf}</span>
                  </div>
                )}
                <div>
                  <div className="admin-label">Tags to merge</div>
                  <div className="flex flex-wrap gap-1">
                    {(item.aiGeneratedFaq?.tags ?? item.tags ?? []).map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">{tag}</span>
                    ))}
                  </div>
                </div>
                <textarea
                  value={objectReason}
                  onChange={e => setObjectReason(e.target.value)}
                  placeholder="Merge target FAQ ID (MongoDB ObjectId)..."
                  className="admin-textarea font-mono"
                  rows={2}
                />
              </div>
              <div className="admin-modal-footer justify-end">
                <button onClick={() => { setMergeTarget(''); setObjectReason(''); }} className="admin-btn-ghost">Cancel</button>
                <button onClick={() => handleMerge(item)} disabled={!objectReason.trim() || actioning === item._id} className="admin-btn-warn">
                  {actioning === item._id ? '...' : 'Merge'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Objection Modal */}
      {objectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="admin-modal-panel w-full max-w-md mx-4">
            <div className="admin-modal-header">
              <h2 className="text-lg font-semibold text-ink">Object to Promotion</h2>
              <button onClick={() => { setObjectModal(null); setObjectReason(''); }} className="text-ink-faint hover:text-ink transition-colors">✕</button>
            </div>
            <div className="admin-modal-body">
              <p className="text-sm text-ink-faint mb-4">
                Provide a reason for your objection. This will prevent further auto-promotion of this content.
              </p>
              <textarea
                value={objectReason}
                onChange={e => setObjectReason(e.target.value)}
                placeholder="Reason for objection..."
                className="admin-textarea"
                rows={3}
              />
            </div>
            <div className="admin-modal-footer justify-end">
              <button onClick={() => { setObjectModal(null); setObjectReason(''); }} className="admin-btn-ghost">Cancel</button>
              <button
                onClick={() => handleReject(objectModal)}
                disabled={!objectReason.trim() || actioning === objectModal}
                className="admin-btn-danger"
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
