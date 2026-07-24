import React from 'react';
import { FAQItem, getQuestionTitle, getAnswerText, formatDate, getCategoryIcon, formatCategoryName, TrustBadge } from './faqUtils';
import ReportFAQButton from './ReportFAQButton';
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
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {backLabel || 'Back'}
        </button>

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