import express, { Express, Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { setupExpressErrorHandler } from '@sentry/node';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerMiddleware } from './middleware.js';
import { registerRoutes } from './routes.js';
import { getMetrics } from '../utils/http/metrics.js';
import { logger } from '../utils/http/logger.js';
import { getContext } from '../utils/http/requestContext.js';
import { sentryRequestTagsMiddleware } from '../utils/sentryTags.js';
import matchProjectsRouter from '../routes/match-projects.js';
import { publicBasePath } from '../utils/publicBasePath.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(config: any): Express {
  const sentryEnabled = config.observability.sentry.enabled;
  const sentryDsn = process.env.SENTRY_DSN;

  process.on('unhandledRejection', (reason) => {
    Sentry.captureException(reason);
  });

  // Register Mongoose Global Program Scoping Plugin
  mongoose.plugin((schema) => {
    if (schema.path('batchId')) {
      const queryMethods = [
        'find', 'findOne', 'countDocuments', 'updateOne', 'updateMany', 
        'deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndReplace', 
        'findOneAndUpdate', 'replaceOne',
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

  // Sentry request-context tagger
  app.use(sentryRequestTagsMiddleware);

  // NOTE: bridge-cookie auth on the backend is intentionally NOT installed.
  
  // Register all routes (auth, faq, … under /csfaq/api)
  registerRoutes(app);

  // Intern project-match API. Mounted here (not only in registerRoutes) so it
  // is guaranteed to exist even if route registration order changes.
  app.use('/csfaq/api/projects', matchProjectsRouter);

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

  // Redirect root '/' and bare '/csfaq' (no trailing slash) to '/csfaq/'.
  // With Express default non-strict routing, a plain '/csfaq' string path also
  // matches '/csfaq/' — which would redirect /csfaq/ to itself forever. Use a
  // regex anchored to exactly '/csfaq' so '/csfaq/' passes through to the SPA.
  app.get('/', (req, res) => res.redirect('/csfaq/'));
  app.get(/^\/csfaq$/, (req, res) => res.redirect('/csfaq/'));

  // Unmatched /csfaq/api/* must never fall through to the SPA HTML shell.
  // That was serving index.html for GET /csfaq/api/auth/login and GET /csfaq/api/projects.
  app.use('/csfaq/api', (req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next();
      return;
    }
    res.status(404).json({
      message: `Cannot ${req.method} ${req.originalUrl}`,
    });
  });

  // Serve the built SPA after every API route so static + HTML fallback
  // cannot intercept /csfaq/api/*.
  const frontendDistPath = path.resolve(__dirname, '../../../frontend/dist');
  const spaIndex = path.join(frontendDistPath, 'index.html');
  const base = publicBasePath() || '/csfaq';
  if (fs.existsSync(spaIndex)) {
    app.use(base, express.static(frontendDistPath, { index: false }));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      const apiPrefix = `${base}/api`;
      if (req.path === apiPrefix || req.path.startsWith(`${apiPrefix}/`)) {
        next();
        return;
      }
      if (req.path === base || req.path.startsWith(`${base}/`)) {
        res.sendFile(spaIndex, (err) => {
          if (err) next(err);
        });
        return;
      }
      next();
    });
  }

  // Global Error Handler
  if (sentryEnabled && sentryDsn) {
    setupExpressErrorHandler(app, {
      shouldHandleError: (error) => {
        const status = (error as { status?: number; statusCode?: number }).status
          ?? (error as { statusCode?: number }).statusCode
          ?? 500;
        return status >= 400;
      },
    });
  }
  
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