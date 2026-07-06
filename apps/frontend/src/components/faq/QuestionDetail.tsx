import React, { useEffect } from 'react';
import api from '../../utils/api';
import { FAQItem, getQuestionTitle, getAnswerText, formatDate, getCategoryIcon, formatCategoryName, TrustBadge } from './faqUtils';
import ReportFAQButton from './ReportFAQButton';
import FreshnessBadge from './FreshnessBadge';
import RelatedFaqs from './RelatedFaqs';
import { useBatch } from '../../context/BatchContext';

interface QuestionDetailProps {
  item: FAQItem;
  relatedItems: FAQItem[];
  onBack: () => void;
  onSelectRelated: (item: FAQItem) => void;
  backLabel?: string;
}

const STOPWORDS = new Set([
  'this','that','these','those','with','from','have','has','had','been',
  'being','will','would','could','should','their','there','where','when',
  'what','which','your','also','more','some','into','out','about','than',
  'then','only','other','some','such','very','just','like','over','after',
  'before','between','under','above','through','during','each','every',
  'both','most','once','here','where','while','same','than','been','being',
  'does','doing','done','make','made','take','took','give','gave','find',
  'know','think','seem','feel','become','keep','let','put','call','used',
]);

function getOrCreateSessionId(): string {
  const stored = sessionStorage.getItem('yaksha_faq_session');
  if (stored && stored.length >= 4) return stored;
  const sid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem('yaksha_faq_session', sid);
  return sid;
}

export default function QuestionDetail({ item, relatedItems, onBack, onSelectRelated, backLabel }: QuestionDetailProps) {
  const { currentBatch } = useBatch();
  const batchId: string | null = currentBatch?._id ?? null;

  // v1.72 — fire-and-forget track-view so Popular FAQs ranking actually works.
  // Backend deduplicates within VIEW_DEDUP_WINDOW_MS (30 min) per (guestId, faqId)
  // so back/forward navigation won't inflate counts. batchId is required by the
  // backend (400 if missing); silently skip if no program is selected.
  useEffect(() => {
    if (!item._id || !batchId) return;
    const faqId: string = item._id;
    const sessionId: string = getOrCreateSessionId();
    api.post('/public/track-view', { faqId, sessionId, batchId }).catch(() => {});
  }, [item._id, batchId]);

  const title = getQuestionTitle(item);
  const prefix = item.questionNumber ? `${item.questionNumber}. ` : '';
  const answer = getAnswerText(item);
  const metaDate = formatDate(item.updatedAt || item.createdAt);
  const sourceLabel = item.source === 'faq' ? 'FAQ' : item.source === 'community' ? 'Community' : '';
  const trustLevel = item.trustLevel;
  const highlight = answer ? answer.split('. ').slice(0, 1).join('. ') : '';

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-6">
      <aside className="hidden lg:flex flex-col gap-4">
        <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">Category</p>
          <div className="mt-3 flex items-center gap-2 text-sm text-ink">
            <span className="w-8 h-8 rounded-xl bg-mist flex items-center justify-center text-ink-faint">
              {getCategoryIcon(item.category || '')}
            </span>
            <span>{item.categoryNumber ? `${item.categoryNumber}. ` : ''}{formatCategoryName(item.category || 'General')}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">Related questions</p>
          <div className="mt-3 space-y-2">
            {relatedItems.length === 0 && (
              <p className="text-xs text-ink-soft">No related questions yet.</p>
            )}
            {relatedItems.map((rel) => (
              <button
                key={rel._id}
                onClick={() => onSelectRelated(rel)}
                className="w-full text-left text-xs text-ink hover:text-accent transition-colors line-clamp-2"
              >
                {rel.questionNumber ? `${rel.questionNumber}. ` : ''}{getQuestionTitle(rel)}
              </button>
            ))}
          </div>
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
          {item.source === 'faq' && (
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

        {/* Related FAQs — "People Also Ask" */}
        <RelatedFaqs
          currentFaqId={item._id}
          currentCategory={item.category || ''}
          keywords={answer ? answer.toLowerCase().match(/\b[a-z]{4,}\b/g)?.filter(w => !STOPWORDS.has(w)) ?? [] : []}
        />

        {/* Report FAQ */}
        <ReportFAQButton item={item} />
      </div>
    </div>
  );
}