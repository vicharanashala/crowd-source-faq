import { useState, useCallback, useEffect, useMemo } from 'react';
import { faqData, urgencyOrder } from '../data/faqData';
import * as faqService from '../services/faqService';

const PROGRESS_KEY = 'samagama_faq_progress';

function loadStorage(key, fallback) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function useFAQState() {
  const [readSections, setReadSections] = useState(() => loadStorage(PROGRESS_KEY, []));
  // A counter to force re-computation when interactions change
  const [tick, setTick] = useState(0);

  useEffect(() => { saveStorage(PROGRESS_KEY, readSections); }, [readSections]);

  const refreshData = useCallback(() => setTick(t => t + 1), []);

  const markSectionRead = useCallback((sectionId) => {
    setReadSections(prev => prev.includes(sectionId) ? prev : [...prev, sectionId]);
  }, []);

  const trackClick = useCallback(() => {
    // View tracking now handled by FAQInteractionContext
    setTick(t => t + 1);
  }, []);

  // Placeholder vote — actual voting is handled by FAQInteractionContext
  // This is kept for backward compatibility with FAQPage props
  const vote = useCallback(() => {
    setTick(t => t + 1);
  }, []);

  // Build enriched data with real analytics from faqService
  const enrichedData = useMemo(() => {
    const realAnalytics = faqService.getAllFAQAnalytics();

    return faqData.map(cat => ({
      ...cat,
      questions: cat.questions
        .map(q => {
          const analytics = realAnalytics[q.id] || { views: 0, likes: 0, dislikes: 0, bookmarks: 0 };
          return {
            ...q,
            // Base values from faqData + real interaction counts
            clicks: q.clicks + analytics.views,
            thumbsUp: q.thumbsUp + analytics.likes,
            thumbsDown: q.thumbsDown + analytics.dislikes,
            bookmarkCount: analytics.bookmarks,
            urgency: analytics.dislikes >= 5
              ? escalateUrgency(q.urgency)
              : q.urgency,
          };
        })
        .sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]),
    }));
  }, [tick]); // eslint-disable-line

  const totalSections = faqData.length;
  const readCount = readSections.length;

  return {
    enrichedData,
    vote,
    markSectionRead,
    trackClick,
    readSections,
    readCount,
    totalSections,
    refreshData,
  };
}

function escalateUrgency(current) {
  const levels = ['low', 'medium', 'high', 'critical'];
  const idx = levels.indexOf(current);
  return levels[Math.min(idx + 1, levels.length - 1)];
}
