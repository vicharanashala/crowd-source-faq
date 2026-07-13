import { useMemo } from 'react';
import type { FAQItem } from '../components/faq/faqUtils';

/**
 * Derives a stable deduplication key for an FAQ item.
 * Handles items from different sources (Zoom, generated, local)
 * where `_id` may not always be present.
 */
function stableKey(faq: FAQItem): string {
  if (faq._id) return faq._id;
  const id = (faq as { id?: string }).id;
  if (id) return id;
  return `${faq.category ?? ''}:${faq.question ?? ''}`;
}

/**
 * Merges FAQs from all selected categories into a single list.
 * When no categories are selected, returns the full flat list.
 * Deduplicates items that appear in multiple categories.
 */
export function useMergedCategoryFaqs(
  grouped: Record<string, FAQItem[]>,
  selectedCategories: string[],
  flatQuestions: FAQItem[],
): FAQItem[] {
  return useMemo(() => {
    if (selectedCategories.length === 0) return flatQuestions;

    const seen = new Set<string>();
    return selectedCategories.flatMap((cat) =>
      (grouped[cat] ?? [])
        .filter((faq) => {
          const key = stableKey(faq);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((faq) => ({
          ...faq,
          category: faq.category || cat,
          source: faq.source || 'faq',
        })),
    );
  }, [grouped, selectedCategories, flatQuestions]);
}
