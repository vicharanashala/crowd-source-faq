/**
 * alertService.js — Admin alert/announcement management
 * 
 * Stores alerts created by admin. One alert can be "pinned"
 * to appear on the student-facing HomePage red bar.
 */

import { getItem, setItem, generateId } from './storageService';

const ALERTS_KEY = 'alerts';

function getAlertsList() {
  return getItem(ALERTS_KEY) || [];
}

function saveAlertsList(list) {
  setItem(ALERTS_KEY, list);
}

/**
 * Create a new alert.
 */
export function createAlert({ title, message, note = '', priority = 'normal' }) {
  const record = {
    id: generateId('alert_'),
    title,
    message,
    note,
    priority, // low | normal | high | critical
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const list = getAlertsList();
  list.push(record);
  saveAlertsList(list);
  return record;
}

/**
 * Pin an alert (unpin all others first).
 */
export function pinAlert(id) {
  const list = getAlertsList();
  list.forEach(a => { a.pinned = a.id === id; });
  saveAlertsList(list);
  return list.find(a => a.id === id);
}

/**
 * Unpin an alert.
 */
export function unpinAlert(id) {
  const list = getAlertsList();
  const alert = list.find(a => a.id === id);
  if (alert) {
    alert.pinned = false;
    saveAlertsList(list);
  }
  return alert;
}

/**
 * Edit an alert.
 */
export function editAlert(id, patch) {
  const list = getAlertsList();
  const idx = list.findIndex(a => a.id === id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    saveAlertsList(list);
    return list[idx];
  }
  return null;
}

/**
 * Delete an alert.
 */
export function deleteAlert(id) {
  const list = getAlertsList();
  const filtered = list.filter(a => a.id !== id);
  saveAlertsList(filtered);
}

/**
 * Get all alerts (newest first).
 */
export function getAlerts() {
  return getAlertsList().slice().reverse();
}

/**
 * Get the currently pinned alert (if any).
 */
export function getPinnedAlert() {
  return getAlertsList().find(a => a.pinned) || null;
}
