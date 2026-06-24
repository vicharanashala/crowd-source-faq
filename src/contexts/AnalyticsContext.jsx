/**
 * AnalyticsContext.jsx — Aggregated analytics for admin dashboard
 * 
 * Computes overview cards, heatmap, top searches, panic detection,
 * self-healing suggestions from service data. Live-updates via state changes.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import * as searchService from '../services/searchService';
import * as faqService from '../services/faqService';
import * as queryService from '../services/queryService';
import * as feedbackService from '../services/feedbackService';
import * as analyticsService from '../services/analyticsService';
import * as userService from '../services/userService';
import { faqData, allQuestions } from '../data/faqData';

const AnalyticsContext = createContext({ analytics: {}, refreshAnalytics: () => {} });

export const useAnalytics = () => useContext(AnalyticsContext);

function computeAnalytics() {
  const totalCounts = faqService.getTotalCounts();
  const queryCounts = queryService.getQueryCounts();

  return {
    // Overview cards
    totalUsers: userService.getUserCount(),
    totalSearches: searchService.getTotalSearchCount(),
    todaySearches: searchService.getTodaySearchCount(),
    activeStudents: userService.getActiveUsers().length,
    totalFAQs: allQuestions.length,
    totalLikes: totalCounts.likes,
    totalDislikes: totalCounts.dislikes,
    totalBookmarks: totalCounts.bookmarks,
    totalQueries: queryCounts.total,
    pendingQueries: queryCounts.pending,
    resolvedQueries: queryCounts.resolved,
    totalFeedback: feedbackService.getFeedbackCount(),
    averageRating: feedbackService.getAverageRating(),

    // Heatmap
    heatmap: searchService.getSearchHeatmap().slice(0, 15),

    // Top searches
    topSearches: searchService.getTopSearches(10),

    // Panic detection
    panicSpikes: searchService.detectSearchSpikes(),

    // FAQ analytics
    faqAnalytics: faqService.getAllFAQAnalytics(),

    // Self-healing
    selfHealingSuggestions: computeSelfHealing(),

    // Recent activity
    recentActivities: analyticsService.getRecentActivities(20),

    // Peak hours
    peakHours: analyticsService.getPeakHours(),

    // Top active students
    topActiveStudents: analyticsService.getTopActiveStudents(10),

    // Most bookmarked
    mostBookmarked: faqService.getMostBookmarked(10),
  };
}

function computeSelfHealing() {
  const suggestions = [];
  const faqAnalytics = faqService.getAllFAQAnalytics();

  // FAQs with many dislikes → suggest rewrite
  Object.values(faqAnalytics).forEach(fa => {
    if (fa.dislikes >= 3) {
      const q = allQuestions.find(x => x.id === fa.faqId);
      if (q) {
        suggestions.push({
          type: 'rewrite',
          faqId: fa.faqId,
          question: q.question,
          reason: `${fa.dislikes} thumbs-down received`,
          action: 'Rewrite answer',
        });
      }
    }
  });

  // Searches with no results → suggest create FAQ
  const searches = searchService.getAllSearches();
  const noResultSearches = {};
  searches.forEach(s => {
    if (s.resultsCount === 0) {
      noResultSearches[s.query] = (noResultSearches[s.query] || 0) + 1;
    }
  });
  Object.entries(noResultSearches).forEach(([term, count]) => {
    if (count >= 2) {
      suggestions.push({
        type: 'create',
        query: term,
        reason: `"${term}" — ${count} searches, no matching FAQ`,
        action: 'Create new FAQ',
      });
    }
  });

  // Many repeated queries → suggest add document
  const queryCounts = {};
  queryService.getAllQueries().forEach(q => {
    const key = q.question.toLowerCase().trim();
    queryCounts[key] = (queryCounts[key] || 0) + 1;
  });
  Object.entries(queryCounts).forEach(([question, count]) => {
    if (count >= 3) {
      suggestions.push({
        type: 'document',
        query: question,
        reason: `"${question}" asked ${count} times`,
        action: 'Add document',
      });
    }
  });

  return suggestions.slice(0, 10);
}

export function AnalyticsProvider({ children }) {
  const [analytics, setAnalytics] = useState(() => computeAnalytics());
  const intervalRef = useRef(null);

  const refreshAnalytics = useCallback(() => {
    setAnalytics(computeAnalytics());
  }, []);

  // Auto-refresh every 3 seconds for live updates
  useEffect(() => {
    intervalRef.current = setInterval(refreshAnalytics, 3000);
    return () => clearInterval(intervalRef.current);
  }, [refreshAnalytics]);

  const value = { analytics, refreshAnalytics };

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
}
