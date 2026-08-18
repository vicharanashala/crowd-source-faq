import './env.js';
import { validateEnv, EnvValidationError } from './config/envValidator.js';
import { loadConfig } from './config/loader.js';
import { createApp } from './bootstrap/app.js';
import { startup, stopAllSchedulers } from './bootstrap/startup.js';
import { startupLog, shutdownLog, logger } from './utils/http/logger.js';
import * as Sentry from '@sentry/node';
import type { Server } from 'http';

// Validate environment variables first. validateEnv() throws a typed
// EnvValidationError on failure (M7) — the decision to terminate the
// process belongs here at the boot boundary, not inside the validator.
try {
  validateEnv();
} catch (err) {
  // The name check guards against dual module instances (ESM/CJS interop
  // or bundler duplication), where `instanceof` can fail across copies.
  if (err instanceof EnvValidationError || (err as Error)?.name === 'EnvValidationError') {
    logger.error('Environment validation failed:');
    ((err as EnvValidationError).errors ?? []).forEach((e) => logger.error(`  - ${e}`));
    process.exit(1);
  }
  throw err;
}

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