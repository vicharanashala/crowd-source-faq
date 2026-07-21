/**
 * OfflineModePage — Offline Mode (PWA) settings page.
 *
 * Lets a user see whether offline caching is active, manually
 * trigger a cache refresh of the current FAQ list, see how many
 * FAQs are available offline, and install the site as an app via
 * the browser's `beforeinstallprompt` event.
 *
 * Wrapped in <FeatureGate featureKey="offlineMode"> at the route
 * level (see AppRoutes.tsx) — this page assumes the flag is ON.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  registerOfflineServiceWorker,
  getCachedFaqCount,
} from '../utils/registerServiceWorker';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function OfflineModePage(): React.ReactElement {
  const [swActive, setSwActive] = useState(false);
  const [cachedCount, setCachedCount] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  const refreshStatus = useCallback(async () => {
    if ('serviceWorker' in navigator) {
      // navigator.serviceWorker.ready resolves once a service worker
      // is active and controlling this scope — more reliable than
      // getRegistration() right after calling register(), which can
      // race the async activation step and read stale state.
      try {
        const reg = await navigator.serviceWorker.ready;
        setSwActive(!!reg?.active);
      } catch {
        setSwActive(false);
      }
    }
    setCachedCount(await getCachedFaqCount());
  }, []);

  useEffect(() => {
    // Registration is gated by the offlineMode flag already (this page
    // only renders when the flag is on, via FeatureGate), so it's safe
    // to register here as soon as the user opens this page.
    registerOfflineServiceWorker().then(refreshStatus);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [refreshStatus]);

  const handleRefreshCache = useCallback(async () => {
    setRefreshing(true);
    try {
      // Warm the cache by hitting the public FAQ endpoints — the
      // NetworkFirst runtime caching rule in vite.config.ts stores
      // the responses as a side effect of these requests.
      await fetch('/csfaq/api/faq', { cache: 'no-store' }).catch(() => null);
      await refreshStatus();
    } finally {
      setRefreshing(false);
    }
  }, [refreshStatus]);

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }, [installPrompt]);

  return (
    <div className="min-h-[70vh] px-4 py-10 max-w-2xl mx-auto">
      <Link to="/" className="text-sm text-ink-soft hover:text-accent transition-colors">
        ← Back home
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mt-6 p-8 rounded-3xl border border-border bg-card/70 backdrop-blur-xl shadow-xl"
      >
        <h1 className="font-serif text-2xl font-bold text-ink">Offline Mode</h1>
        <p className="text-sm text-ink-soft mt-2 leading-relaxed">
          Once enabled, previously-loaded FAQs stay available even without an
          internet connection. Browse the FAQ page while online first — those
          pages will keep working offline afterward.
        </p>

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-mist border border-border/50">
            <div>
              <div className="font-semibold text-ink text-sm">Service worker</div>
              <div className="text-xs text-ink-soft mt-0.5">
                {swActive ? 'Active — offline caching is running' : 'Not yet active'}
              </div>
            </div>
            <span
              className={`w-2.5 h-2.5 rounded-full ${swActive ? 'bg-green-500' : 'bg-warning/70'}`}
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-2xl bg-mist border border-border/50">
            <div>
              <div className="font-semibold text-ink text-sm">FAQs available offline</div>
              <div className="text-xs text-ink-soft mt-0.5">
                {cachedCount === null ? 'Unavailable in this browser' : `${cachedCount} cached response(s)`}
              </div>
            </div>
            <button
              onClick={handleRefreshCache}
              disabled={refreshing}
              className="px-3 py-1.5 text-xs font-semibold rounded-full bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-50"
            >
              {refreshing ? 'Refreshing…' : 'Refresh now'}
            </button>
          </div>

          <div className="flex items-center justify-between p-4 rounded-2xl bg-mist border border-border/50">
            <div>
              <div className="font-semibold text-ink text-sm">Install as app</div>
              <div className="text-xs text-ink-soft mt-0.5">
                {installed
                  ? 'Installed'
                  : installPrompt
                    ? 'Add this site to your home screen or desktop'
                    : 'Install prompt not available in this browser yet'}
              </div>
            </div>
            <button
              onClick={handleInstall}
              disabled={!installPrompt || installed}
              className="px-3 py-1.5 text-xs font-semibold rounded-full bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {installed ? 'Installed' : 'Install'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
