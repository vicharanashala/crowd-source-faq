import React, { useEffect, useState } from 'react';
import adminApi from '../utils/adminApi';

interface CommunityFAQ {
  _id: string;
  question: string;
  answer: string;
  category: string;
  trustLevel: string;
  promotedAt: string;
  sourceCommunityPostId?: { _id: string; title: string; upvotes: string[] };
}

const trustConfig: Record<string, { label: string; class: string }> = {
  high:   { label: 'Official', class: 'bg-stone-100 text-stone-700 border-stone-300' },
  expert: { label: 'Admin Approved', class: 'bg-blue-50 text-blue-700 border-blue-200' },
  medium: { label: 'Community Approved', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  low:    { label: 'Community', class: 'bg-amber-50 text-amber-700 border-amber-200' },
};

export default function FaqReview() {
  const [faqs, setFaqs] = useState<CommunityFAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actioning, setActioning] = useState<string | null>(null);
  const [objectModal, setObjectModal] = useState<string | null>(null);
  const [objectReason, setObjectReason] = useState('');

  const limit = 20;

  useEffect(() => {
    loadFAQs(page);
  }, [page]);

  async function loadFAQs(p: number) {
    setLoading(true);
    try {
      const res = await adminApi.get(`/admin/faqs/community-pending?page=${p}&limit=${limit}`);
      setFaqs(res.data.faqs ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      setFaqs([]);
    } finally {
      setLoading(false);
    }
  }

  async function handlePromote(faqId: string, currentLevel: string) {
    setActioning(faqId);
    try {
      const targetLevel = currentLevel === 'medium' ? 'expert' : 'high';
      await adminApi.post(`/admin/faqs/${faqId}/promote`, { targetLevel });
      await loadFAQs(page);
    } catch (e) {
      console.warn(e);
    } finally {
      setActioning(null);
    }
  }

  async function handleObject(faqId: string) {
    if (!objectReason.trim()) return;
    setActioning(faqId);
    try {
      await adminApi.post(`/admin/faqs/${faqId}/object`, { reason: objectReason.trim() });
      setObjectModal(null);
      setObjectReason('');
      await loadFAQs(page);
    } catch (e) {
      console.warn(e);
    } finally {
      setActioning(null);
    }
  }

  const totalPages = Math.ceil(total / limit);
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
      </div>

      {loading ? (
        <div className="text-center py-12 text-ink-faint">Loading...</div>
      ) : faqs.length === 0 ? (
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
                  <th className="text-left py-3 px-4 font-semibold text-ink-faint">Category</th>
                  <th className="text-left py-3 px-4 font-semibold text-ink-faint">Trust</th>
                  <th className="text-left py-3 px-4 font-semibold text-ink-faint">Promoted</th>
                  <th className="text-left py-3 px-4 font-semibold text-ink-faint">Actions</th>
                </tr>
              </thead>
              <tbody>
                {faqs.map((faq) => {
                  const cfg = tc[faq.trustLevel] ?? tc['medium'];
                  const canPromote = faq.trustLevel === 'medium' || faq.trustLevel === 'expert';
                  return (
                    <tr key={faq._id} className="border-b border-border/50 hover:bg-cream/50 transition-colors">
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-medium text-ink truncate">{faq.question}</div>
                        {faq.sourceCommunityPostId && (
                          <div className="text-xs text-ink-faint mt-0.5 truncate">
                            from: {faq.sourceCommunityPostId.title}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-ink-faint">{faq.category}</td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${cfg.class}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-ink-faint text-xs">
                        {faq.promotedAt ? new Date(faq.promotedAt).toLocaleDateString() : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {faq.trustLevel === 'medium' && (
                            <button
                              onClick={() => handlePromote(faq._id, 'medium')}
                              disabled={actioning === faq._id}
                              className="text-xs px-3 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                            >
                              {actioning === faq._id ? '...' : '→ Admin Approved'}
                            </button>
                          )}
                          {faq.trustLevel === 'expert' && (
                            <button
                              onClick={() => handlePromote(faq._id, 'expert')}
                              disabled={actioning === faq._id}
                              className="text-xs px-3 py-1 rounded-lg bg-stone-100 text-stone-700 border border-stone-200 hover:bg-stone-200 disabled:opacity-50 transition-colors"
                            >
                              {actioning === faq._id ? '...' : '→ Official'}
                            </button>
                          )}
                          <button
                            onClick={() => setObjectModal(faq._id)}
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

      {/* Objection Modal */}
      {objectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
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
                onClick={() => handleObject(objectModal)}
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