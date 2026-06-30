import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getBackendPort(): number {
  if (process.env.BACKEND_PORT) {
    return parseInt(process.env.BACKEND_PORT, 10);
  }
  let port = 6767;
  try {
    const envPaths = [
      path.resolve(__dirname, '../backend/.env'),
      path.resolve(__dirname, '../backend/.env.local')
    ];
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/^PORT\s*=\s*(\d+)/m);
        if (match) {
          port = parseInt(match[1], 10);
        }
      }
    }
  } catch (e) {
    // fallback to 6767
  }
  return port;
}

const backendPort = getBackendPort();

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
      '/uploads': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
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
    isolate: false,
  },
});