import { defineConfig, type Plugin } from 'vite';
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
  plugins: [react(), csfaqBaseRedirect()],
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