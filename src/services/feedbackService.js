/**
 * feedbackService.js — Student feedback management
 */

import { getItem, setItem, generateId } from './storageService';

const FEEDBACK_KEY = 'feedback';

function getFeedbackList() {
  return getItem(FEEDBACK_KEY) || [];
}

function saveFeedbackList(list) {
  setItem(FEEDBACK_KEY, list);
}

/**
 * Submit feedback.
 */
export function submitFeedback({ userId, userName, email, feedback, rating }) {
  const record = {
    id: generateId('fb_'),
    userId,
    userName,
    email,
    feedback,
    rating, // 1-5
    timestamp: new Date().toISOString(),
  };

  const list = getFeedbackList();
  list.push(record);
  saveFeedbackList(list);
  return record;
}

/**
 * Get all feedback.
 */
export function getAllFeedback() {
  return getFeedbackList().slice().reverse();
}

/**
 * Get feedback for a specific user.
 */
export function getUserFeedback(userId) {
  return getFeedbackList().filter(f => f.userId === userId);
}

/**
 * Get feedback count.
 */
export function getFeedbackCount() {
  return getFeedbackList().length;
}

/**
 * Get average rating.
 */
export function getAverageRating() {
  const list = getFeedbackList();
  if (list.length === 0) return 0;
  const sum = list.reduce((a, f) => a + (f.rating || 0), 0);
  return Math.round((sum / list.length) * 10) / 10;
}
