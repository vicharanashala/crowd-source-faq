/**
 * searchService.js — Search history and analytics
 * 
 * Logs every search performed by logged-in users.
 * Provides heatmap data, top searches, and search history.
 */

import { getItem, setItem, generateId } from './storageService';

const SEARCHES_KEY = 'searches';

function getSearches() {
  return getItem(SEARCHES_KEY) || [];
}

function saveSearches(searches) {
  setItem(SEARCHES_KEY, searches);
}

/**
 * Log a search event.
 */
export function logSearch({ userId, userName, email, query, category = '', resultsCount = 0 }) {
  const record = {
    id: generateId('srch_'),
    userId,
    userName,
    email,
    query: query.trim().toLowerCase(),
    originalQuery: query.trim(),
    category,
    resultsCount,
    timestamp: new Date().toISOString(),
  };

  const searches = getSearches();
  searches.push(record);

  // Cap at 3000 entries
  if (searches.length > 3000) {
    searches.splice(0, searches.length - 3000);
  }

  saveSearches(searches);
  return record;
}

/**
 * Get search history for a specific user.
 */
export function getSearchHistory(userId) {
  return getSearches().filter(s => s.userId === userId).reverse();
}

/**
 * Get all searches.
 */
export function getAllSearches() {
  return getSearches();
}

/**
 * Get search heatmap: category/keyword → count, sorted descending.
 */
export function getSearchHeatmap() {
  const searches = getSearches();
  const counts = {};

  searches.forEach(s => {
    const key = s.query;
    counts[key] = (counts[key] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get top N searched terms with growth data.
 */
export function getTopSearches(limit = 10) {
  const searches = getSearches();
  const now = new Date();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

  const thisWeek = {};
  const lastWeek = {};

  searches.forEach(s => {
    const t = new Date(s.timestamp);
    const key = s.query;
    if (t >= weekAgo) {
      thisWeek[key] = (thisWeek[key] || 0) + 1;
    } else if (t >= twoWeeksAgo) {
      lastWeek[key] = (lastWeek[key] || 0) + 1;
    }
  });

  return Object.entries(thisWeek)
    .map(([term, count]) => {
      const prev = lastWeek[term] || 0;
      const growth = prev > 0 ? Math.round(((count - prev) / prev) * 100) : (count > 0 ? 100 : 0);
      return { term, count, growth, trend: growth > 0 ? 'up' : growth < 0 ? 'down' : 'flat' };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get today's search count.
 */
export function getTodaySearchCount() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const iso = today.toISOString();
  return getSearches().filter(s => s.timestamp >= iso).length;
}

/**
 * Get total search count.
 */
export function getTotalSearchCount() {
  return getSearches().length;
}

/**
 * Detect search spikes (panic mode).
 * Returns categories where today's searches are 3x+ yesterday's.
 */
export function detectSearchSpikes() {
  const searches = getSearches();
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart - 24 * 60 * 60 * 1000);

  const todayCounts = {};
  const yesterdayCounts = {};

  searches.forEach(s => {
    const t = new Date(s.timestamp);
    const key = s.query;
    if (t >= todayStart) {
      todayCounts[key] = (todayCounts[key] || 0) + 1;
    } else if (t >= yesterdayStart && t < todayStart) {
      yesterdayCounts[key] = (yesterdayCounts[key] || 0) + 1;
    }
  });

  const spikes = [];
  Object.entries(todayCounts).forEach(([term, todayCount]) => {
    const yesterdayCount = yesterdayCounts[term] || 0;
    if (todayCount >= 3 && (yesterdayCount === 0 || todayCount / yesterdayCount >= 3)) {
      spikes.push({
        term,
        today: todayCount,
        yesterday: yesterdayCount,
        multiplier: yesterdayCount > 0 ? Math.round(todayCount / yesterdayCount) : todayCount,
      });
    }
  });

  return spikes.sort((a, b) => b.multiplier - a.multiplier);
}
