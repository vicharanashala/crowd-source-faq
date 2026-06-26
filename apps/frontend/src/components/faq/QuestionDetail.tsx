import React, { useState } from 'react';
import { FAQItem, getQuestionTitle, getAnswerText, formatDate, getCategoryIcon, formatCategoryName, TrustBadge } from './faqUtils';
import ReportFAQButton from './ReportFAQButton';
import FreshnessBadge from '../faq/FreshnessBadge';

interface QuestionDetailProps {
  item: FAQItem;
  relatedItems: FAQItem[];
  onBack: () => void;
  onSelectRelated: (item: FAQItem) => void;
  backLabel?: string;
}

function getIntentLabel(title: string): string {
  const q = title.toLowerCase();
  if (/\b(when|date|deadline|timeline|schedule|last date)\b/.test(q)) return 'Timeline';
  if (/\b(how|apply|submit|process|steps|procedure)\b/.test(q)) return 'Process';
  if (/\b(who|contact|mentor|admin|coordinator)\b/.test(q)) return 'Contact';
  if (/\b(what|which|where|why)\b/.test(q)) return 'Information';
  return 'General';
}

function getPriorityLabel(item: FAQItem): string {
  const title = getQuestionTitle(item).toLowerCase();
  const answer = getAnswerText(item).toLowerCase();
  const text = `${title} ${answer}`;
  let score = 0;

  if (/\b(deadline|urgent|last date|noc|certificate|registration|submit|approval)\b/.test(text)) score += 3;
  if (/\b(when|how|required|missing|issue|problem|error|delay)\b/.test(text)) score += 2;
  if ((item as any)?.reviewStatus === 'pending_review') score += 2;
  if ((item as any)?.freshnessTier === 'volatile') score += 1;

  if (score >= 5) return 'Critical';
  if (score >= 3) return 'High';
  if (score >= 1) return 'Medium';
  return 'Low';
}

export default function QuestionDetail({ item, relatedItems, onBack, onSelectRelated, backLabel }: QuestionDetailProps) {
  const [feedback, setFeedback] = useState<'yes' | 'no' | null>(null);
  const title = getQuestionTitle(item);
  const prefix = item.questionNumber ? `${item.questionNumber}. ` : '';
  const answer = getAnswerText(item);
  const metaDate = formatDate(item?.updatedAt || item?.createdAt);
  const sourceLabel = item?.source ? (item.source === 'faq' ? 'FAQ' : 'Community') : '';
  const trustLevel = item?.trustLevel;
  const highlight = answer ? answer.split('. ').slice(0, 1).join('. ') : '';
  const intentLabel = getIntentLabel(title);
  const priorityLabel = getPriorityLabel(item);

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

        <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">You may also need</p>
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
          <span className="px-2.5 py-1 rounded-full bg-mist text-[11px] font-semibold text-ink-soft">
            Priority: {priorityLabel}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-mist text-[11px] font-semibold text-ink-soft">
            Intent: {intentLabel}
          </span>
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

        <div className="mt-6 rounded-xl border border-border/70 bg-mist/40 p-4">
          <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">
            Was this helpful?
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFeedback('yes')}
              className="px-3 py-1.5 rounded-full border border-border/70 bg-card text-xs text-ink hover:border-accent/50 hover:text-accent transition-colors"
            >
              👍 Yes
            </button>
            <button
              type="button"
              onClick={() => setFeedback('no')}
              className="px-3 py-1.5 rounded-full border border-border/70 bg-card text-xs text-ink hover:border-accent/50 hover:text-accent transition-colors"
            >
              👎 Needs update
            </button>
          </div>
          {feedback && (
            <p className="mt-2 text-xs text-ink-soft">
              Thanks — this feedback will help admins identify FAQs that need improvement.
            </p>
          )}
        </div>

        {relatedItems.length > 0 && (
          <div className="mt-6">
            <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">You may also need</p>
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
