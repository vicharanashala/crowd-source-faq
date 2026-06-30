import React, { useState, useEffect } from 'react';
import { FAQItem, getQuestionTitle, getAnswerText, formatDate, getCategoryIcon, formatCategoryName, TrustBadge } from './faqUtils';
import ReportFAQButton from './ReportFAQButton';
import FreshnessBadge from '../faq/FreshnessBadge';
import api from '../../utils/api';

interface QuestionDetailProps {
  item: FAQItem;
  relatedItems: FAQItem[];
  onBack: () => void;
  onSelectRelated: (item: FAQItem) => void;
  backLabel?: string;
}

export default function QuestionDetail({ item, relatedItems, onBack, onSelectRelated, backLabel }: QuestionDetailProps) {
  const title = getQuestionTitle(item);
  const prefix = item.questionNumber ? `${item.questionNumber}. ` : '';
  const answer = getAnswerText(item);
  const metaDate = formatDate(item?.updatedAt || item?.createdAt);
  const sourceLabel = item?.source ? (item.source === 'faq' ? 'FAQ' : 'Community') : '';
  const trustLevel = item?.trustLevel;
  const highlight = answer ? answer.split('. ').slice(0, 1).join('. ') : '';
  const [relatedData, setRelatedData] = useState<{
    relatedFAQs: FAQItem[];
    relatedSessions: any[];
    relatedDiscussions: any[];
    relatedResources: any[];
  } | null>(null);
  const [loadingRelated, setLoadingRelated] = useState(false);

  useEffect(() => {
    if (!item?._id) return;
    setLoadingRelated(true);
    api.get(`/faq/${item._id}/related`)
      .then((res) => {
        setRelatedData(res.data);
      })
      .catch((err) => {
        console.error('Failed to fetch related data:', err);
      })
      .finally(() => {
        setLoadingRelated(false);
      });
  }, [item?._id]);

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-6">
      <aside className="hidden lg:flex flex-col gap-4">
        <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">Category</p>
          <div className="mt-3 flex items-center gap-2 text-sm text-ink">
            <span className="w-8 h-8 rounded-xl bg-mist flex items-center justify-center text-ink-faint">
              {getCategoryIcon(item?.category || '')}
            </span>
            <span>{item?.categoryNumber ? `${item.categoryNumber}. ` : ''}{formatCategoryName(item?.category || 'General')}</span>
          </div>
        </div>

        {/* Smart Knowledge Graph Sidebar */}
        <div className="rounded-2xl border border-border/70 bg-card/80 p-4 flex flex-col gap-4">
          <div className="border-b border-border/50 pb-2">
            <h3 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent animate-pulse">
                <circle cx="12" cy="12" r="3"/>
                <circle cx="18" cy="18" r="3"/>
                <circle cx="6" cy="6" r="3"/>
                <line x1="12" y1="12" x2="18" y2="18"/>
                <line x1="12" y1="12" x2="6" y2="6"/>
              </svg>
              Smart Knowledge Graph
            </h3>
            <p className="text-[10px] text-ink-faint mt-0.5">Explore connected entries</p>
          </div>

          {loadingRelated ? (
            <div className="py-6 flex flex-col items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-accent/25 border-t-accent rounded-full animate-spin" />
              <span className="text-[10px] text-ink-faint">Traversing connections...</span>
            </div>
          ) : relatedData ? (
            <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
              {/* Related FAQs */}
              <div>
                <p className="text-[10px] font-bold text-accent uppercase tracking-wider mb-2">Connected Questions</p>
                {relatedData.relatedFAQs.length === 0 ? (
                  <p className="text-[11px] text-ink-faint">No connected questions.</p>
                ) : (
                  <div className="space-y-2">
                    {relatedData.relatedFAQs.map((rel) => (
                      <button
                        key={rel._id}
                        onClick={() => onSelectRelated(rel)}
                        className="w-full text-left text-xs text-ink hover:text-accent hover:bg-mist/30 p-2 rounded-lg border border-border/30 transition-all line-clamp-2 block"
                      >
                        {rel.questionNumber ? `${rel.questionNumber}. ` : ''}{getQuestionTitle(rel)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Related Sessions */}
              <div>
                <p className="text-[10px] font-bold text-accent uppercase tracking-wider mb-2">Connected Sessions</p>
                {relatedData.relatedSessions.length === 0 ? (
                  <p className="text-[11px] text-ink-faint">No matching sessions.</p>
                ) : (
                  <div className="space-y-2">
                    {relatedData.relatedSessions.map((session) => (
                      <div key={session._id} className="text-xs text-ink-soft bg-mist/40 p-2 rounded-lg border border-border/30">
                        <p className="font-semibold text-ink line-clamp-1">🎥 {session.topic}</p>
                        {session.summary && <p className="text-[10px] text-ink-faint line-clamp-2 mt-0.5">{session.summary}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Related Discussions */}
              <div>
                <p className="text-[10px] font-bold text-accent uppercase tracking-wider mb-2">Community Discussions</p>
                {relatedData.relatedDiscussions.length === 0 ? (
                  <p className="text-[11px] text-ink-faint">No matching community threads.</p>
                ) : (
                  <div className="space-y-2">
                    {relatedData.relatedDiscussions.map((disc) => (
                      <a
                        key={disc._id}
                        href={`/community?post=${disc._id}`}
                        className="block text-xs text-ink hover:text-accent hover:bg-mist/30 p-2 rounded-lg border border-border/30 transition-all"
                      >
                        <p className="font-medium line-clamp-1">💬 {disc.title}</p>
                        <p className="text-[10px] text-ink-faint mt-0.5 line-clamp-1">{disc.body}</p>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Related Resources */}
              <div>
                <p className="text-[10px] font-bold text-accent uppercase tracking-wider mb-2">Matching Resources</p>
                {relatedData.relatedResources.length === 0 ? (
                  <p className="text-[11px] text-ink-faint">No matching files.</p>
                ) : (
                  <div className="space-y-2">
                    {relatedData.relatedResources.map((res) => (
                      <div key={res._id} className="text-xs text-ink-soft bg-mist/40 p-2 rounded-lg border border-border/30">
                        <p className="font-medium text-ink line-clamp-1">📄 {res.title || res.fileName}</p>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-ink-faint">{res.fileType}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-ink-soft">Could not load graph connections.</p>
          )}
        </div>
      </aside>

      <div className="bg-card rounded-2xl border border-border shadow-subtle p-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {backLabel || 'Back'}
        </button>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {sourceLabel && (
            <span className="px-2.5 py-1 rounded-full bg-mist text-[11px] font-semibold text-ink-soft">
              {sourceLabel}
            </span>
          )}
          {metaDate && (
            <span className="text-[11px] text-ink-faint">Updated {metaDate}</span>
          )}
          {item?.source === 'faq' && (
            <FreshnessBadge
              reviewStatus={item.reviewStatus}
              lastVerifiedDate={item.lastVerifiedDate}
              reviewIntervalDays={item.reviewIntervalDays ?? 0}
              freshnessTier={item.freshnessTier}
            />
          )}
        </div>

        <h2 className="mt-4 text-xl font-semibold text-ink leading-snug">
          <span className="text-ink-faint mr-2 tabular-nums">{prefix}</span>
          {title}
          {trustLevel && <TrustBadge level={trustLevel} />}
        </h2>

        {answer ? (
          <div className="mt-4 space-y-4 text-sm text-ink-soft leading-relaxed whitespace-pre-wrap">
            {answer}
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-soft">No answer available yet.</p>
        )}

        {highlight && (
          <div className="mt-5 rounded-xl border border-accent/15 bg-accent-light p-4">
            <p className="text-[11px] font-semibold text-accent uppercase tracking-wide">Key takeaway</p>
            <p className="mt-2 text-sm text-ink/70">{highlight}.</p>
          </div>
        )}

        {relatedItems.length > 0 && (
          <div className="mt-6">
            <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">Related questions</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {relatedItems.map((rel) => (
                <button
                  key={rel._id}
                  onClick={() => onSelectRelated(rel)}
                  className="px-3 py-1.5 rounded-full border border-border/70 bg-card text-xs text-ink hover:border-accent/50 hover:text-accent transition-colors"
                >
                  {rel.questionNumber ? `${rel.questionNumber}. ` : ''}{getQuestionTitle(rel)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Report FAQ */}
        <ReportFAQButton item={item} />
      </div>
    </div>
  );
}
