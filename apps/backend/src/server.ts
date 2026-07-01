import './env.js';
import { validateEnv } from './config/envValidator.js';
import { loadConfig } from './config/loader.js';
import { createApp } from './bootstrap/app.js';
import { startup, stopAllSchedulers } from './bootstrap/startup.js';
import { startupLog, shutdownLog, logger } from './utils/http/logger.js';
import * as Sentry from '@sentry/node';
import type { Server } from 'http';

// Validate environment variables first
validateEnv();

const config = loadConfig();
const app = createApp(config);
const PORT = parseInt(process.env.PORT || String(config.server.port), 10);

let server: Server | undefined;

if (config.server.env !== 'production' || !process.env.VERCEL) {
  server = app.listen(PORT, '0.0.0.0', async () => {
    startupLog.alert('backend listening', {
      port: PORT,
      env: config.server.env,
      nodeVersion: process.version,
    });
    startupLog.info(`Yaksha FAQ Portal backend running on port ${PORT}`);

    await startup(config);
  });
}

// Graceful shutdown handling
async function gracefulShutdown(signal: string): Promise<void> {
  shutdownLog.alert('shutdown initiated', { signal });

  if (server) {
    try {
      server.close(() => {
        shutdownLog.info('HTTP server closed');
      });
    } catch (err) {
      logger.warn(`[shutdown] HTTP server close error: ${(err as Error).message}`);
    }
  }

  Sentry.close(2000).catch((err) => {
    logger.warn(`[shutdown] Sentry flush failed: ${(err as Error).message}`);
  });

  const shutdownTimeout = config.server.env === 'production' ? 15000 : 2000;
  const shutdownPromise = stopAllSchedulers();

  await Promise.race([
    shutdownPromise,
    new Promise((resolve) => setTimeout(resolve, shutdownTimeout)),
  ]);

  shutdownLog.info('graceful shutdown complete');
}

process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM').finally(() => process.exit(0));
});
process.on('SIGINT', () => {
  gracefulShutdown('SIGINT').finally(() => process.exit(0));
});

export default app;