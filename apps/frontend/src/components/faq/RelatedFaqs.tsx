// RelatedFaqs — "People Also Ask" section at the bottom of QuestionDetail
// Shows related FAQs based on: same category + keyword overlap + recency

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useBatch } from '../../context/BatchContext';
import { FAQItem, getCategoryIcon } from './faqUtils';

const STOPWORDS = new Set([
  'this','that','these','those','with','from','have','has','had','been',
  'being','will','would','could','should','their','there','where','when',
  'what','which','your','also','more','into','out','about','than','then',
  'only','other','some','such','very','just','like','over','after',
  'before','between','under','above','through','during','each','every',
  'both','most','once','here','where','while','same','than','been','being',
  'does','doing','done','make','made','take','took','give','gave','find',
  'know','think','seem','feel','become','keep','let','put','call','used',
]);

interface RelatedFaqsProps {
  currentFaqId: string;
  currentCategory: string;
  /** Words extracted from current FAQ answer for overlap scoring */
  keywords: string[];
  limit?: number;
}

interface GroupedResponse {
  grouped: Record<string, FAQItem[]>;
}

export default function RelatedFaqs({ currentFaqId, currentCategory, keywords, limit = 5 }: RelatedFaqsProps) {
  const { currentBatch } = useBatch();
  const batchId = currentBatch?._id ?? null;
  const navigate = useNavigate();
  const [related, setRelated] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;

    api.get<GroupedResponse>('/faq', { params: { batchId, limit: 30 } })
      .then((res) => {
        if (cancelled) return;
        const all: FAQItem[] = Object.values(res.data.grouped ?? {}).flat() as FAQItem[];

        // Score each FAQ:
        // +2 points = same category
        // +1 point per matching keyword (4+ letter words only)
        const scored = all
          .filter((f) => f._id !== currentFaqId)
          .map((f) => {
            let score = 0;
            if (f.category === currentCategory) score += 2;
            const faqText = `${f.question} ${f.answer}`.toLowerCase();
            for (const kw of keywords) {
              if (kw.trim().length > 3 && faqText.includes(kw.trim().toLowerCase())) {
                score += 1;
              }
            }
            return { faq: f, score };
          })
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map(({ faq }) => faq);

        setRelated(scored);
      })
      .catch(() => {
        // Silently fail — not critical
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [currentFaqId, currentCategory, keywords.join(','), batchId, limit]);

  if (loading || related.length === 0) return null;

  return (
    <div className="mt-10 pt-8 border-t border-border/40">
      <div className="flex items-center gap-2 mb-4">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <h3 className="text-base font-semibold text-ink">People Also Ask</h3>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {related.map((faq) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Icon = getCategoryIcon(faq.category) as unknown as React.ComponentType<{ className?: string }>;
          return (
            <button
              key={faq._id}
              onClick={() => navigate(`/faq/${faq._id}`)}
              className="group flex items-start gap-3 p-4 rounded-xl border border-border/50 bg-mist/40 hover:bg-accent-light hover:border-accent/30 transition-all duration-200 text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-card border border-border/50 flex items-center justify-center shrink-0 mt-0.5 group-hover:border-accent/30 transition-colors">
                {Icon && <Icon className="w-4 h-4 text-ink-soft group-hover:text-accent transition-colors" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink leading-snug line-clamp-2 group-hover:text-accent transition-colors">
                  {faq.question}
                </p>
                <p className="text-xs text-ink-faint mt-1">{faq.category}</p>
              </div>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" className="shrink-0 mt-1 text-ink-faint group-hover:text-accent group-hover:translate-x-0.5 transition-all"
              >
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}