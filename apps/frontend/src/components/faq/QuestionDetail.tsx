import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { FAQItem, getQuestionTitle, getAnswerText, formatDate, getCategoryIcon, formatCategoryName, TrustBadge } from './faqUtils';
import ReportFAQButton from './ReportFAQButton';
import TagChips from './TagChips';
import FreshnessBadge from '../faq/FreshnessBadge';
import {
  avatarPlaceholder,
  flexCol,
  flexRow,
  flexRowBetween,
  flexRowWrap,
  surfaceCard,
  surfaceCardHover,
  surfaceCardPadded,
  textBody,
  textBodyFaint,
  textBodySoft,
  textLabelBold,
  textLabelXsBold,
  textXs,
  textXsFaint,
  textXsLabel,
  textNumeric,
  stackXs,
  stackSm,
} from '../../styles/style_config';

interface QuestionDetailProps {
  item: FAQItem;
  relatedItems: FAQItem[];
  onBack: () => void;
  onSelectRelated: (item: FAQItem) => void;
  onTagClick?: (tag: string) => void;
  backLabel?: string;
}

export default function QuestionDetail({
  item,
  relatedItems,
  onBack,
  onSelectRelated,
  onTagClick,
  backLabel,
}: QuestionDetailProps) {
  const [copied, setCopied] = useState(false);
  const title = getQuestionTitle(item);
  const prefix = item.questionNumber ? `${item.questionNumber}. ` : '';
  const answer = getAnswerText(item);
  const metaDate = formatDate(item?.updatedAt || item?.createdAt);
  const sourceLabel = item?.source ? (item.source === 'faq' ? 'FAQ' : 'Community') : '';
  const trustLevel = item?.trustLevel;
  const highlight = answer ? answer.split('. ').slice(0, 1).join('. ') : '';
  const handleCopyLink = async () => {
    const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    const url = `${window.location.origin}${basePath}/faq/${item._id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-6">
      <aside className={`hidden lg:flex ${flexCol} gap-4`}>
        <div className={surfaceCardHover}>
          <p className={textLabelXsBold}>Category</p>
          <div className={`mt-3 ${flexRow} gap-2 ${textBody}`}>
            <span className={avatarPlaceholder + ' w-8 h-8 rounded-xl'}>
              {getCategoryIcon(item?.category || '')}
            </span>
            <span>{item?.categoryNumber ? `${item.categoryNumber}. ` : ''}{formatCategoryName(item?.category || 'General')}</span>
          </div>
        </div>

        <div className={surfaceCardHover}>
          <p className={textLabelXsBold}>Related questions</p>
          <div className={`mt-3 ${stackXs}`}>
            {relatedItems.length === 0 && (
              <p className={textXs + ' text-ink-soft'}>No related questions yet.</p>
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

      <div className={surfaceCardPadded + ' border-border shadow-subtle'}>
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {backLabel || 'Back'}
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:border-accent/40 hover:text-accent transition-colors"
            title="Copy link"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>

        <div className={`mt-4 ${flexRowWrap} gap-2`}>
          {sourceLabel && (
            <span className="px-2.5 py-1 rounded-full bg-mist text-[11px] font-semibold text-ink-soft">
              {sourceLabel}
            </span>
          )}
          {metaDate && (
            <span className={textXsFaint}>Updated {metaDate}</span>
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

        {/* NEW — tag chips, placed right after the meta row, before the title */}
        {item.tags && item.tags.length > 0 && (
          <div className="mt-3">
            <TagChips tags={item.tags} onTagClick={onTagClick} size="sm" />
          </div>
        )}

        <h2 className={`mt-4 text-xl font-semibold text-ink leading-snug`}>
          <span className={`${textBodyFaint} mr-2 ${textNumeric}`}>{prefix}</span>
          {title}
          {trustLevel && <TrustBadge level={trustLevel} />}
        </h2>

        {answer ? (
          <div className={`mt-4 ${stackSm} ${textBodySoft} leading-relaxed whitespace-pre-wrap`}>
            {answer}
          </div>
        ) : (
          <p className={`mt-4 ${textBodySoft}`}>No answer available yet.</p>
        )}

        {highlight && (
          <div className="mt-5 rounded-xl border border-accent/15 bg-accent-light p-4">
            <p className={textLabelXsBold}>Key takeaway</p>
            <p className={`mt-2 text-sm text-ink/70`}>{highlight}.</p>
          </div>
        )}

        {relatedItems.length > 0 && (
          <div className="mt-6">
            <p className={textLabelXsBold}>Related questions</p>
            <div className={`mt-2 ${flexRowWrap} gap-2`}>
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
