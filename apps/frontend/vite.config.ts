import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DEV_PORT = frontend port (defaults to 5173 — change with FE_PORT=...).
// DEV_BACKEND = backend origin (defaults to http://localhost:6767 — change
//                with FE_BACKEND=http://localhost:3767 when running alongside
//                another project that owns 6767).
const DEV_PORT = parseInt(process.env.FE_PORT || '5173', 10);
const DEV_BACKEND = process.env.FE_BACKEND || 'http://localhost:6767';

// v1.87.7 — redirect `/csfaq` (no trailing slash) to `/csfaq/` so users
// who type the app URL without the trailing slash land on the SPA
// instead of Vite's plain-text "did you mean to visit /csfaq/"
// 404. The proxy rules in `server.proxy` (matched by path prefix)
// still win for /csfaq/api/*, /csfaq/uploads/*, etc. — this only
// fires for the bare /csfaq route, which has no API or static
// counterpart.
function csfaqBaseRedirect(): Plugin {
  return {
    name: 'csfaq-base-redirect',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/csfaq') {
          res.writeHead(308, { Location: '/csfaq/' });
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: '/csfaq/',
  plugins: [
    react(),
    csfaqBaseRedirect(),
    // Offline Mode (PWA) — v1 addition. Registration is manual and
    // gated behind the `offlineMode` feature flag (see
    // src/utils/registerServiceWorker.ts), so injectRegister: null
    // stops the plugin from auto-injecting a registration script.
    // When the flag is off, the service worker file is generated at
    // build time but never registered — zero behavioural change for
    // users with the flag off.
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      strategies: 'generateSW',
      // Without this, vite-plugin-pwa only builds sw.js on `vite build` —
      // `vite dev` serves index.html for any unknown path (SPA fallback),
      // so /csfaq/sw.js 404s into an HTML response with the wrong MIME
      // type. devOptions makes it generate + serve a real dev-mode
      // service worker so Offline Mode can be tested locally without a
      // production build every time.
      devOptions: {
        enabled: true,
        type: 'module',
        // The plugin auto-injects its own registration script in dev
        // regardless of the top-level injectRegister setting above —
        // this sub-option is what actually suppresses it, so our
        // manual, flag-gated registerServiceWorker.ts stays the only
        // thing that calls registerSW().
        injectRegister: false,
      },
      manifest: {
        id: '/csfaq/',
        name: 'Yaksha FAQ Portal',
        short_name: 'Yaksha FAQ',
        description: 'Ask. Discover. Get Solved. Search your doubt or explore solved questions from the community.',
        start_url: '/csfaq/',
        scope: '/csfaq/',
        display: 'standalone',
        background_color: '#fdf6ec',
        theme_color: '#b98a5e',
        icons: [
          { src: '/csfaq/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/csfaq/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/csfaq/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/csfaq/index.html',
        navigateFallbackDenylist: [/^\/csfaq\/api\//, /^\/csfaq\/uploads\//],
        runtimeCaching: [
          {
            // Public FAQ list + detail reads — the core of Offline Mode.
            // Matches GET /csfaq/api/faq (list) and /csfaq/api/faq/:id
            // (detail) — the actual endpoints used by FAQPage.tsx via
            // api.get('/faq') / api.get(`/faq/${id}`), where `api`'s
            // baseURL is VITE_API_URL || '/csfaq/api'.
            //
            // IMPORTANT: workbox tests urlPattern against the full
            // request URL (e.g. http://localhost:5174/csfaq/api/faq?...),
            // not just the path — a ^-anchored regex expecting a
            // leading "/csfaq" never matches a string starting with
            // "http://" and silently fails to intercept anything. A
            // match callback checking url.pathname avoids that trap
            // entirely and is unaffected by host/port/protocol.
            urlPattern: ({ url }) => url.pathname.startsWith('/csfaq/api/faq'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'faq-api-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
              // The backend returns 304 Not Modified for conditional
              // (ETag) requests, which have no body and are rejected
              // by cacheableResponse above. fetchOptions forces the
              // browser to skip its own HTTP cache and always request
              // a fresh 200 so Workbox has something to actually cache.
              fetchOptions: { cache: 'no-store' },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: DEV_PORT,
    proxy: {
      // API calls go to the backend
      '/csfaq/api':     { target: DEV_BACKEND, changeOrigin: true },
      // v1.69 — publicBasePath fix: onboarding resources (SVG, PDF, PPTX,
      // video, etc.) are stored at /csfaq/uploads/... in Mongo. In dev the
      // backend runs on DEV_BACKEND, so asset fetches from the Vite dev
      // server need to be forwarded there. Without this rule the browser
      // requests /csfaq/uploads/... from Vite directly → 404. In production
      // the backend serves everything at /csfaq/ so no proxy is needed.
      '/csfaq/uploads': { target: DEV_BACKEND, changeOrigin: true },
      '/uploads':       { target: DEV_BACKEND, changeOrigin: true },
    },
  },
  optimizeDeps: {
    exclude: ['@xenova/transformers'],
  },
  worker: {
    format: 'es',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    isolate: true,
  },
});