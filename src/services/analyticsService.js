/**
 * analyticsService.js — Universal activity logger
 * 
 * Every user interaction creates a record here.
 * Schema: { id, userId, userName, email, timestamp, action, page,
 *           faqId, category, question, interactionType }
 */

import { getItem, setItem, generateId } from './storageService';

const ACTIVITIES_KEY = 'activities';

function getActivitiesRaw() {
  return getItem(ACTIVITIES_KEY) || [];
}

function saveActivities(activities) {
  setItem(ACTIVITIES_KEY, activities);
}

/**
 * Log an activity record.
 */
export function logActivity({
  userId, userName, email, action, page = '',
  faqId = '', category = '', question = '', interactionType = '',
}) {
  const record = {
    id: generateId('act_'),
    userId,
    userName,
    email,
    timestamp: new Date().toISOString(),
    action,
    page,
    faqId,
    category,
    question,
    interactionType,
  };

  const activities = getActivitiesRaw();
  activities.push(record);

  // Keep last 2000 activities to prevent localStorage bloat
  if (activities.length > 2000) {
    activities.splice(0, activities.length - 2000);
  }

  saveActivities(activities);
  return record;
}

/**
 * Get all activities, optionally filtered.
 */
export function getActivities(filters = {}) {
  let activities = getActivitiesRaw();

  if (filters.userId) {
    activities = activities.filter(a => a.userId === filters.userId);
  }
  if (filters.action) {
    activities = activities.filter(a => a.action === filters.action);
  }
  if (filters.category) {
    activities = activities.filter(a => a.category === filters.category);
  }
  if (filters.since) {
    activities = activities.filter(a => a.timestamp >= filters.since);
  }

  return activities;
}

/**
 * Get the most recent N activities.
 */
export function getRecentActivities(limit = 20) {
  const activities = getActivitiesRaw();
  return activities.slice(-limit).reverse();
}

/**
 * Get activities for today.
 */
export function getTodayActivities() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return getActivities({ since: today.toISOString() });
}

/**
 * Get activity count by action type.
 */
export function getActionCounts() {
  const activities = getActivitiesRaw();
  return activities.reduce((acc, a) => {
    acc[a.action] = (acc[a.action] || 0) + 1;
    return acc;
  }, {});
}

/**
 * Get peak hours (hour of day → count).
 */
export function getPeakHours() {
  const activities = getActivitiesRaw();
  const hours = {};
  activities.forEach(a => {
    const hour = new Date(a.timestamp).getHours();
    hours[hour] = (hours[hour] || 0) + 1;
  });
  return hours;
}

/**
 * Get top active students by activity count.
 */
export function getTopActiveStudents(limit = 10) {
  const activities = getActivitiesRaw();
  const userCounts = {};
  activities.forEach(a => {
    if (!a.userId || a.userId.startsWith('admin')) return;
    if (!userCounts[a.userId]) {
      userCounts[a.userId] = { userId: a.userId, userName: a.userName, email: a.email, count: 0 };
    }
    userCounts[a.userId].count++;
  });
  return Object.values(userCounts).sort((a, b) => b.count - a.count).slice(0, limit);
}
