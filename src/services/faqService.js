/**
 * faqService.js — FAQ interaction tracking
 * 
 * Tracks likes, dislikes, bookmarks, views per FAQ per user.
 */

import { getItem, setItem, generateId } from './storageService';

const INTERACTIONS_KEY = 'faq_interactions';

function getInteractions() {
  return getItem(INTERACTIONS_KEY) || [];
}

function saveInteractions(interactions) {
  setItem(INTERACTIONS_KEY, interactions);
}

function addInteraction(record) {
  const interactions = getInteractions();
  interactions.push(record);
  if (interactions.length > 5000) {
    interactions.splice(0, interactions.length - 5000);
  }
  saveInteractions(interactions);
  return record;
}

/**
 * Record a like. Removes existing dislike for same user+faq.
 */
export function recordLike({ userId, userName, email, faqId, category, question }) {
  // Remove existing vote by this user for this FAQ
  removeUserVote(userId, faqId);
  return addInteraction({
    id: generateId('like_'),
    type: 'like',
    userId, userName, email, faqId, category, question,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Record a dislike. Removes existing like for same user+faq.
 */
export function recordDislike({ userId, userName, email, faqId, category, question }) {
  removeUserVote(userId, faqId);
  return addInteraction({
    id: generateId('dis_'),
    type: 'dislike',
    userId, userName, email, faqId, category, question,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Remove a user's vote (like or dislike) for a FAQ.
 */
function removeUserVote(userId, faqId) {
  const interactions = getInteractions();
  const filtered = interactions.filter(
    i => !(i.userId === userId && i.faqId === faqId && (i.type === 'like' || i.type === 'dislike'))
  );
  saveInteractions(filtered);
}

/**
 * Record a bookmark. No-op if already bookmarked.
 */
export function recordBookmark({ userId, userName, email, faqId, category, question }) {
  const existing = getInteractions().find(
    i => i.userId === userId && i.faqId === faqId && i.type === 'bookmark'
  );
  if (existing) return existing;
  return addInteraction({
    id: generateId('bk_'),
    type: 'bookmark',
    userId, userName, email, faqId, category, question,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Remove a bookmark.
 */
export function removeBookmark(userId, faqId) {
  const interactions = getInteractions();
  const filtered = interactions.filter(
    i => !(i.userId === userId && i.faqId === faqId && i.type === 'bookmark')
  );
  saveInteractions(filtered);
}

/**
 * Record a view.
 */
export function recordView({ userId, userName, email, faqId, category, question }) {
  return addInteraction({
    id: generateId('view_'),
    type: 'view',
    userId, userName, email, faqId, category, question,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get the current user's vote for a FAQ (null, 'like', or 'dislike').
 */
export function getUserVote(userId, faqId) {
  const interactions = getInteractions();
  const vote = interactions.find(
    i => i.userId === userId && i.faqId === faqId && (i.type === 'like' || i.type === 'dislike')
  );
  return vote ? vote.type : null;
}

/**
 * Check if user has bookmarked a FAQ.
 */
export function isBookmarked(userId, faqId) {
  return !!getInteractions().find(
    i => i.userId === userId && i.faqId === faqId && i.type === 'bookmark'
  );
}

/**
 * Get all bookmarks for a user.
 */
export function getUserBookmarks(userId) {
  return getInteractions().filter(i => i.userId === userId && i.type === 'bookmark');
}

/**
 * Get all likes for a user.
 */
export function getUserLikes(userId) {
  return getInteractions().filter(i => i.userId === userId && i.type === 'like');
}

/**
 * Get all dislikes for a user.
 */
export function getUserDislikes(userId) {
  return getInteractions().filter(i => i.userId === userId && i.type === 'dislike');
}

/**
 * Get analytics for a specific FAQ.
 */
export function getFAQAnalytics(faqId) {
  const interactions = getInteractions();
  const faqItems = interactions.filter(i => i.faqId === faqId);
  return {
    views: faqItems.filter(i => i.type === 'view').length,
    likes: faqItems.filter(i => i.type === 'like').length,
    dislikes: faqItems.filter(i => i.type === 'dislike').length,
    bookmarks: faqItems.filter(i => i.type === 'bookmark').length,
    lastViewed: faqItems.filter(i => i.type === 'view').slice(-1)[0]?.timestamp || null,
  };
}

/**
 * Get aggregated analytics for all FAQs.
 */
export function getAllFAQAnalytics() {
  const interactions = getInteractions();
  const analytics = {};
  interactions.forEach(i => {
    if (!analytics[i.faqId]) {
      analytics[i.faqId] = { faqId: i.faqId, views: 0, likes: 0, dislikes: 0, bookmarks: 0 };
    }
    if (i.type === 'view') analytics[i.faqId].views++;
    else if (i.type === 'like') analytics[i.faqId].likes++;
    else if (i.type === 'dislike') analytics[i.faqId].dislikes++;
    else if (i.type === 'bookmark') analytics[i.faqId].bookmarks++;
  });
  return analytics;
}

/**
 * Get total counts across all FAQs.
 */
export function getTotalCounts() {
  const interactions = getInteractions();
  return {
    likes: interactions.filter(i => i.type === 'like').length,
    dislikes: interactions.filter(i => i.type === 'dislike').length,
    bookmarks: interactions.filter(i => i.type === 'bookmark').length,
    views: interactions.filter(i => i.type === 'view').length,
  };
}

/**
 * Get most bookmarked FAQs.
 */
export function getMostBookmarked(limit = 10) {
  const analytics = getAllFAQAnalytics();
  return Object.values(analytics)
    .sort((a, b) => b.bookmarks - a.bookmarks)
    .slice(0, limit);
}
