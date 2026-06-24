/**
 * storageService.js — Thin LocalStorage abstraction
 * 
 * Every function here can be swapped for a fetch() call later.
 * All data is JSON-serialized. Keys are namespaced with 'samagama_'.
 */

const PREFIX = 'samagama_';

export function getItem(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setItem(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn('Storage write failed:', e);
  }
}

export function removeItem(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {}
}

/**
 * Get all items whose key starts with a given prefix.
 * Returns an array of { key, value } objects.
 */
export function getAll(keyPrefix) {
  const results = [];
  const fullPrefix = PREFIX + keyPrefix;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(fullPrefix)) {
        const raw = localStorage.getItem(k);
        if (raw) {
          results.push({
            key: k.replace(PREFIX, ''),
            value: JSON.parse(raw),
          });
        }
      }
    }
  } catch {}
  return results;
}

/**
 * Append an item to an array stored at the given key.
 * Creates the array if it doesn't exist. Returns the updated array.
 */
export function appendToArray(key, item) {
  const arr = getItem(key) || [];
  arr.push(item);
  setItem(key, arr);
  return arr;
}

/**
 * Update an item in an array by id field.
 */
export function updateInArray(key, id, patch) {
  const arr = getItem(key) || [];
  const idx = arr.findIndex(item => item.id === id);
  if (idx !== -1) {
    arr[idx] = { ...arr[idx], ...patch };
    setItem(key, arr);
  }
  return arr;
}

/**
 * Remove an item from an array by id field.
 */
export function removeFromArray(key, id) {
  const arr = getItem(key) || [];
  const filtered = arr.filter(item => item.id !== id);
  setItem(key, filtered);
  return filtered;
}

/**
 * Generate a unique ID.
 */
export function generateId(prefix = '') {
  return prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}
