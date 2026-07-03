import express, { Express, Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { expressIntegration } from '@sentry/node';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerMiddleware } from './middleware.js';
import { registerRoutes } from './routes.js';
import { getMetrics } from '../utils/http/metrics.js';
import { logger } from '../utils/http/logger.js';
import { internalApiKeyOrAdmin } from '../middleware/internalApiKeyOrAdmin.js';
import { getContext } from '../utils/http/requestContext.js';

export function createApp(config: any): Express {
  // Initialize Sentry
  if (config.observability.sentry.enabled) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: config.server.env,
      integrations: [
        expressIntegration(),
      ],
      tracesSampleRate: config.observability.sentry.tracesSampleRate,
    });
  }

  // Track unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    Sentry.captureException(reason);
  });

  // Register Mongoose Global Program Scoping Plugin
  mongoose.plugin((schema) => {
    if (schema.path('batchId')) {
      const queryMethods = [
        'find',
        'findOne',
        'countDocuments',
        'updateOne',
        'updateMany',
        'deleteOne',
        'deleteMany',
        'findOneAndDelete',
        'findOneAndReplace',
        'findOneAndUpdate',
        'replaceOne',
      ];

      queryMethods.forEach((method) => {
        schema.pre(method as any, function (this: any, next: any) {
          const batchId = getContext()?.batchId;
          if (batchId) {
            const filter = this.getFilter();
            if (!Object.prototype.hasOwnProperty.call(filter, 'batchId')) {
              this.where({ batchId: new mongoose.Types.ObjectId(batchId) });
            }
          }
          next();
        });
      });

      schema.pre('save', function (this: any, next: any) {
        const batchId = getContext()?.batchId;
        if (batchId && !this.batchId) {
          this.batchId = new mongoose.Types.ObjectId(batchId);
        }
        next();
      });

      schema.pre('aggregate', function (this: any, next: any) {
        const batchId = getContext()?.batchId;
        if (batchId) {
          const pipeline = this.pipeline();
          const hasBatchIdFilter = pipeline.some((stage: any) => 
            stage.$match && Object.prototype.hasOwnProperty.call(stage.$match, 'batchId')
          );
          if (!hasBatchIdFilter) {
            pipeline.unshift({ $match: { batchId: new mongoose.Types.ObjectId(batchId) } });
          }
        }
        next();
      });
    }
  });

  const app = express();

  // Register all middlewares
  registerMiddleware(app, config);

  // Register all routes
  registerRoutes(app);

  app.get('/csfaq/api/health', async (req: Request, res: Response) => {
    let dbStatus = 'disconnected';
    try {
      const conn = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
      if (conn === 'connected') {
        await mongoose.connection.db!.admin().ping();
        dbStatus = 'connected';
      }
    } catch (err) {
      logger.warn(`[server] Health check DB ping failed: ${(err as Error).message}`);
      dbStatus = 'error';
    }
    // v1.71 — surface queue/cache state too, so the deploy script (and
    // humans) can distinguish "backend up, queue down" from "backend down".
    // Lazy-imported to avoid pulling queue code into the boot path.
    let cacheStatus = 'unknown';
    try {
      const { cacheAvailable } = await import('../utils/http/cache.js');
      cacheStatus = cacheAvailable() ? 'connected' : 'unavailable';
    } catch {
      cacheStatus = 'error';
    }
    res.json({
      status: dbStatus === 'connected' ? 'ok' : 'degraded',
      db: dbStatus,
      cache: cacheStatus,
      version: '0.1.0',
    });
  });

  app.post('/csfaq/api/warm', async (_req: Request, res: Response) => {
    try {
      await import('../utils/ai/embeddings.js').then(m => m.warmEmbedder());
      res.json({ status: 'warmed' });
    } catch {
      res.status(500).json({ status: 'warm failed' });
    }
  });

  app.get('/csfaq/api/metrics', async (_req: Request, res: Response) => {
    try {
      const metrics = getMetrics();
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(metrics);
    } catch (err) {
      res.status(500).json({ message: 'metrics unavailable' });
    }
  });

  // Serve static assets and SPA fallback
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDistPath = path.resolve(__dirname, '../../../frontend/dist');

  // Serve static files under /csfaq base path
  app.use('/csfaq', express.static(frontendDistPath));

  // SPA fallback for all sub-routes under /csfaq
  app.get('/csfaq/*', (req, res) => {
    res.sendFile(path.resolve(frontendDistPath, 'index.html'));
  });

  // Redirect root '/' and bare '/csfaq' to '/csfaq/'
  app.get('/', (req, res) => res.redirect('/csfaq/'));
  app.get('/csfaq', (req, res) => res.redirect('/csfaq/'));

  // Global Error Handler
  app.use((err: { status?: number; message?: string; stack?: string }, req: Request, res: Response, next: NextFunction) => {
    const requestId: string = (req as Request & { id: string }).id || '-';
    Sentry.captureException(err);
    logger.error(err.stack || err.message || 'Unknown error', { status: err.status }, requestId);
    res.status(err.status || 500).json({
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { error: err.message, stack: err.stack })
    });
  });

  return app;
}
