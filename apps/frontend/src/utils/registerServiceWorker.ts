// Manual, feature-flag-gated service worker registration for Offline
// Mode. Uses vite-plugin-pwa's `virtual:pwa-register` helper, which
// resolves the correct service worker URL in both `vite dev`
// (devOptions.enabled) and production builds — hardcoding a path
// like `/csfaq/sw.js` breaks in dev mode, where the plugin serves a
// virtual dev-sw module instead.
//
// devOptions.injectRegister is set to `false` in vite.config.ts so
// the plugin never auto-registers on its own — this file is the
// single place that decides whether the service worker is active,
// based on the `offlineMode` feature flag.
import { registerSW } from 'virtual:pwa-register';

let registered = false;

export async function registerOfflineServiceWorker(): Promise<void> {
  if (registered) return;
  if (!('serviceWorker' in navigator)) return;

  try {
    registerSW({ immediate: true });
    registered = true;
  } catch (err) {
    // Non-fatal — offline caching just won't be available this session.
    // eslint-disable-next-line no-console
    console.warn('[offlineMode] service worker registration failed:', err);
  }
}

/** Unregisters the service worker — used when an admin flips the
 *  flag off, or from the Offline Mode settings page. */
export async function unregisterOfflineServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  registered = false;
}

/** Returns the count of FAQ-related entries currently cached, or
 *  null if the Cache Storage API is unavailable. Used by the
 *  Offline Mode settings page to show "N FAQs available offline". */
export async function getCachedFaqCount(): Promise<number | null> {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open('faq-api-cache');
    const keys = await cache.keys();
    return keys.length;
  } catch {
    return null;
  }
}
