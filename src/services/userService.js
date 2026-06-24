/**
 * userService.js — User profile persistence
 * 
 * Manages the collection of registered users (students).
 * Admin is not stored here (handled separately in auth).
 */

import { getItem, setItem, generateId } from './storageService';

const USERS_KEY = 'users';

function getUsers() {
  return getItem(USERS_KEY) || [];
}

function saveUsers(users) {
  setItem(USERS_KEY, users);
}

/**
 * Register a new user. Returns the enriched user object.
 */
export function registerUser(userData) {
  const users = getUsers();
  
  // Check if user already exists by email
  const existing = users.find(u => u.email === userData.email);
  if (existing) return existing;

  const user = {
    id: userData.id || generateId('usr_'),
    name: userData.name,
    email: userData.email,
    role: userData.role || 'student',
    avatar: userData.avatar || null,
    createdAt: userData.createdAt || new Date().toISOString(),
    lastActive: new Date().toISOString(),
    status: 'active', // active | disabled
  };

  users.push(user);
  saveUsers(users);
  return user;
}

/**
 * Get a user by ID.
 */
export function getUser(id) {
  const users = getUsers();
  return users.find(u => u.id === id) || null;
}

/**
 * Get a user by email.
 */
export function getUserByEmail(email) {
  const users = getUsers();
  return users.find(u => u.email === email) || null;
}

/**
 * Get all registered users.
 */
export function getAllUsers() {
  return getUsers().filter(u => u.role !== 'admin');
}

/**
 * Update a user by ID with a patch object.
 */
export function updateUser(id, patch) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx !== -1) {
    users[idx] = { ...users[idx], ...patch };
    saveUsers(users);
    return users[idx];
  }
  return null;
}

/**
 * Update lastActive timestamp for a user.
 */
export function updateLastActive(userId) {
  return updateUser(userId, { lastActive: new Date().toISOString() });
}

/**
 * Toggle user status (active/disabled).
 */
export function toggleUserStatus(userId) {
  const user = getUser(userId);
  if (!user) return null;
  const newStatus = user.status === 'active' ? 'disabled' : 'active';
  return updateUser(userId, { status: newStatus });
}

/**
 * Get count of all student users.
 */
export function getUserCount() {
  return getAllUsers().length;
}

/**
 * Get active users (active in last 7 days).
 */
export function getActiveUsers() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return getAllUsers().filter(u => u.lastActive && u.lastActive >= sevenDaysAgo);
}
