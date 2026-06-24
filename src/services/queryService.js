/**
 * queryService.js — Student query management
 * 
 * Stores queries raised by students. Admin can view and resolve.
 */

import { getItem, setItem, generateId } from './storageService';

const QUERIES_KEY = 'queries';

function getQueries() {
  return getItem(QUERIES_KEY) || [];
}

function saveQueries(queries) {
  setItem(QUERIES_KEY, queries);
}

/**
 * Submit a new query.
 */
export function submitQuery({ userId, userName, email, question, category }) {
  const record = {
    id: generateId('qry_'),
    userId,
    userName,
    email,
    question,
    category,
    status: 'pending', // pending | resolved
    timestamp: new Date().toISOString(),
    resolvedAt: null,
  };

  const queries = getQueries();
  queries.push(record);
  saveQueries(queries);
  return record;
}

/**
 * Get all queries, optionally filtered by status.
 */
export function getAllQueries(status = null) {
  const queries = getQueries();
  if (status) return queries.filter(q => q.status === status);
  return queries;
}

/**
 * Get queries for a specific user.
 */
export function getUserQueries(userId) {
  return getQueries().filter(q => q.userId === userId);
}

/**
 * Update query status (resolve/reopen).
 */
export function updateQueryStatus(queryId, status) {
  const queries = getQueries();
  const idx = queries.findIndex(q => q.id === queryId);
  if (idx !== -1) {
    queries[idx].status = status;
    queries[idx].resolvedAt = status === 'resolved' ? new Date().toISOString() : null;
    saveQueries(queries);
    return queries[idx];
  }
  return null;
}

/**
 * Get query counts.
 */
export function getQueryCounts() {
  const queries = getQueries();
  return {
    total: queries.length,
    pending: queries.filter(q => q.status === 'pending').length,
    resolved: queries.filter(q => q.status === 'resolved').length,
  };
}

/**
 * Get newest queries (most recent first).
 */
export function getNewestQueries(limit = 10) {
  return getQueries().slice().reverse().slice(0, limit);
}
