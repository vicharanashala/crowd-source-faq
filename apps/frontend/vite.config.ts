import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/csfaq/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // API calls go to the backend
      '/csfaq/api': { target: 'http://localhost:6767', changeOrigin: true },
      // v1.69 — publicBasePath fix: onboarding resources (SVG, PDF, PPTX,
      // video, etc.) are stored at /csfaq/uploads/... in Mongo. In dev the
      // backend runs on port 6767, so asset fetches from the Vite dev server
      // need to be forwarded there. Without this rule the browser requests
      // /csfaq/uploads/... from Vite directly → 404. In production the backend
      // serves everything at /csfaq/ so no proxy is needed (the browser
      // requests go directly to the backend's static middleware).
      '/csfaq/uploads': { target: 'http://localhost:6767', changeOrigin: true },
      '/uploads': { target: 'http://localhost:6767', changeOrigin: true },
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