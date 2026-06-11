import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';
import faqRoutes from './routes/faq.js';
import communityRoutes from './routes/community.js';
import searchRoutes from './routes/search.js';
import adminRoutes from './routes/admin.js';
import adminAuditRoutes from './routes/adminAudit.js';
import adminAutoAnswerRoutes from './routes/adminAutoAnswer.js';
import analyticsRoutes from './routes/analytics.js';
import notificationRoutes from './routes/notification.js';
import teaRoutes from './routes/tea.js';
import reputationRoutes from './routes/reputation.js';
import moderationRoutes from './routes/moderation.js';
import zoomRoutes from './routes/zoom.js';
import knowledgeRoutes from './routes/knowledge.js';
import askAiRoutes from './routes/askAi.js';
import uploadRoutes from './routes/upload.js';
import publicFaqRoutes from './routes/publicFaq.js';
import batchRoutes from './routes/batch.js';
import supportRoutes from './routes/support.js';
import featureFlagRoutes from './routes/featureFlag.js';
import { documentRouter, documentAdminRouter } from './routes/documents.js';
import { adminRouter as appSettingsAdminRouter, publicRouter as appSettingsPublicRouter } from './routes/appSettings.js';
import { ingestFrontendLog } from './utils/http/fileLogger.js';
import { logger } from './utils/http/logger.js';
import { requestLogger } from './utils/http/requestLogger.js';
import { startEscalationScheduler, stopEscalationScheduler } from './controllers/escalationController.js';
import { runScheduledAutoAnswer, stopAutoAnswerScheduler } from './controllers/autoAnswerController.js';
import { runScheduledFAQAudit, stopFAQAuditScheduler } from './controllers/faqAuditController.js';
import { retryFailedMeetings } from './services/retryService.js';
import { runFreshnessCheck } from './controllers/freshnessController.js';
import { startDocumentWorker, stopDocumentWorker, isDocumentQueueEnabled } from './utils/jobs/documentQueue.js';
import { runPromotePopularDocumentInsights } from './controllers/documentPromotionController.js';
import { shutdownTesseract } from './utils/documentExtractor.js';
import { runPromotionCycle } from './services/promotionService.js';
import { getMetrics } from './utils/http/metrics.js';
import { runWithContext } from './utils/http/requestContext.js';
import { flushSearchLogs } from './controllers/searchController.js';
import { jobQueue } from './utils/http/jobQueue.js';
import { getCloudinaryConfig } from './utils/http/cloudinary.js';
import { recomputePopularity } from './controllers/publicFaqController.js';
import * as Sentry from '@sentry/node';
import { expressIntegration } from '@sentry/node';

// Load environment variables (.env + .env.local overrides)
dotenv.config();
dotenv.config({ path: '.env.local' });

// Initialize Sentry
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  integrations: [
    expressIntegration(),
  ],
  tracesSampleRate: 0.1, // 10% of transactions sampled
});

// Track unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  Sentry.captureException(reason);
});

const app = express();

// Trust the first proxy hop (Vite dev server, ngrok, Cloudflare,
// a single nginx in front, etc.). Without this, express-rate-limit
// throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every request that
// has X-Forwarded-For, AND can't accurately key by client IP. For
// production behind a multi-hop chain, override with
// `TRUST_PROXY_HOPS=2` etc., or set it to a specific IP / CIDR
// list per the Express docs:
//   https://expressjs.com/en/guide/behind-proxies.html
app.set('trust proxy', process.env.TRUST_PROXY_HOPS ?? '1');

// Database connection middleware to ensure connection on each request lazily
app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

// 2. Request ID + Context middleware — generates UUID and attaches AsyncLocalStorage context
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = uuidv4();
  (req as Request & { id: string }).id = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Propagate context into AsyncLocalStorage so getContext() works in any async operation
  const ctx = { requestId, userId: (req as Request & { user?: { id: string } }).user?.id };
  runWithContext(ctx, async () => { next(); });
});

// 2b. Request logging — full audit trail for every HTTP request
app.use(requestLogger);

// 3. Dynamic CORS Configuration (Must be first to handle preflight requests!)
// Defines which frontend domains are allowed to communicate with this API
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'https://yaksha-faq-frontend.vercel.app'
];
if (process.env.CLIENT_URL) allowedOrigins.push(process.env.CLIENT_URL);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    // Check if the origin is in our whitelist or is a dynamic Vercel preview branch
    // Vercel preview deployments — only in non-production
  const isVercelPreview = process.env.NODE_ENV !== 'production' && origin.endsWith('.vercel.app');
  if (allowedOrigins.indexOf(origin) !== -1 || isVercelPreview) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Required to allow cookies/auth headers
}));

// 4. Security & Logging Middleware
app.use(helmet({
  crossOriginResourcePolicy: false, // Adjusted to allow secure cross-origin API requests
}));
app.use(morgan('dev')); // Logs incoming HTTP requests to the console

// 4. Body Parsing
app.use(express.json()); // Parses incoming JSON payloads in the request body

// 4b. Minimal cookie parser — only needed for the public FAQ page's
// guest-id cookie. Avoids adding cookie-parser as a runtime dep.
app.use((req: Request, _res: Response, next: (e?: unknown) => void) => {
  const header = req.headers.cookie;
  if (!header) { next(); return; }
  const jar: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (!k) continue;
    try { jar[k] = decodeURIComponent(v); } catch { /* malformed — skip */ }
  }
  (req as Request & { cookies: Record<string, string> }).cookies = jar;
  next();
});

// Route to receive frontend logs and write them to main_log.txt
app.post('/api/log', ingestFrontendLog);

// 5. Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/faq', faqRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminAutoAnswerRoutes);
app.use('/api/admin', adminAuditRoutes);
app.use('/api/reputation', reputationRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/notifications/tea', teaRoutes);
app.use('/api/zoom', zoomRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/ask-ai', askAiRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/public', publicFaqRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/feature-flags', featureFlagRoutes);
app.use('/api/documents',       documentRouter);
app.use('/api/admin/documents', documentAdminRouter);

// v1.65 — Global app settings (Golden Ticket cooldown, penalty
// multiplier). Two routers: admin-only at /api/admin/settings and
// public-safe subset at /api/public/settings.
app.use('/api/admin/settings',  appSettingsAdminRouter);
app.use('/api/public/settings', appSettingsPublicRouter);

// 6. Health Check Endpoint
// Useful for deployment platforms (like Vercel/AWS) to verify the server is alive
app.get('/api/health', async (req: Request, res: Response) => {
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
  res.json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    db: dbStatus,
    version: '0.1.0',
  });
});

// 6b. Warm-up endpoint — pre-loads the ML embedding model so first real request isn't slow
app.post('/api/warm', async (_req: Request, res: Response) => {
  try {
    await import('./utils/ai/embeddings.js').then(m => m.warmEmbedder());
    res.json({ status: 'warmed' });
  } catch {
    res.status(500).json({ status: 'warm failed' });
  }
});

// 8. Prometheus-compatible metrics endpoint
app.get('/api/metrics', async (_req: Request, res: Response) => {
  try {
    const metrics = getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (err) {
    res.status(500).json({ message: 'metrics unavailable' });
  }
});

// 7. Global Error Handler
// Catches unhandled errors across the app and standardizes the JSON response
app.use((err: { status?: number; message?: string; stack?: string }, req: Request, res: Response, next: NextFunction) => {
  const requestId: string = (req as Request & { id: string }).id || '-';
  Sentry.captureException(err);
  logger.error(err.stack || err.message || 'Unknown error', { status: err.status }, requestId);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    // Only expose detailed stack traces in development mode for security
    ...(process.env.NODE_ENV === 'development' && { error: err.message, stack: err.stack })
  });
});

const PORT = process.env.PORT || 6767;

// Environment Validation
function validateEnv(): void {
  const errors: string[] = [];

  // Required: MONGODB_URI
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    errors.push('MONGODB_URI is required');
  } else if (!/^mongodb(\+srv)?:\/\/.+/.test(mongoUri)) {
    errors.push('MONGODB_URI must be a mongodb:// or mongodb+srv:// URL');
  }

  // Required: JWT_SECRET
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    errors.push('JWT_SECRET is required');
  } else if (jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters');
  }

  // Optional: PORT
  const port = process.env.PORT;
  if (port !== undefined && !/^\d+$/.test(port)) {
    errors.push('PORT must be numeric');
  }

  // Optional: CLIENT_URL
  const clientUrl = process.env.CLIENT_URL;
  if (clientUrl !== undefined && !/^https?:\/\/.+/.test(clientUrl)) {
    errors.push('CLIENT_URL must be a valid http:// or https:// URL');
  }

  // Optional: REDIS_URL
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl !== undefined) {
    if (!/^https?:\/\/.+/.test(redisUrl)) {
      errors.push('REDIS_URL must be a valid URL');
    }
    // REDIS_TOKEN required if REDIS_URL is provided
    if (!process.env.REDIS_TOKEN) {
      errors.push('REDIS_TOKEN is required when REDIS_URL is provided');
    }
  }

  // Optional: Zoom OAuth (lazy — only validated when Zoom routes are first used)
  const zoomClientId     = process.env.ZOOM_CLIENT_ID;
  const zoomClientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (zoomClientId !== undefined && zoomClientSecret === undefined) {
    errors.push('ZOOM_CLIENT_SECRET is required when ZOOM_CLIENT_ID is provided');
  }
  if (zoomClientSecret !== undefined && zoomClientId === undefined) {
    errors.push('ZOOM_CLIENT_ID is required when ZOOM_CLIENT_SECRET is provided');
  }
  const redirectUri = process.env.ZOOM_REDIRECT_URI;
  if (redirectUri !== undefined && !/^https?:\/\/.+/.test(redirectUri)) {
    errors.push('ZOOM_REDIRECT_URI must be a valid URL');
  }

  if (process.env.NODE_ENV !== 'development' && !process.env.ZOOM_WEBHOOK_SECRET_TOKEN) {
    errors.push('ZOOM_WEBHOOK_SECRET_TOKEN is required in non-development environments');
  }

  try {
    getCloudinaryConfig();
  } catch (e: any) {
    errors.push(e.message);
  }

  if (errors.length > 0) {
    logger.error('Environment validation failed:');
    errors.forEach(e => logger.error(`  - ${e}`));
    process.exit(1);
  }
}

// 8. Server Initialization
// Prevents direct listening in production if deployed as a serverless function (e.g., Vercel)
if (process.env.NODE_ENV !== 'production') {
  validateEnv();
  app.listen(PORT, async () => {
    logger.info(`Yaksha FAQ Portal backend running on port ${PORT}`);

    // Ensure MongoDB is connected before starting any scheduled tasks
    try {
      await connectDB();
    } catch (e) {
      logger.error(`Startup DB connect failed: ${(e as Error).message}`);
    }

    startEscalationScheduler();
    runScheduledAutoAnswer().catch((err) => logger.error(`[autoAnswer] Startup: ${(err as Error).message}`));
    runScheduledFAQAudit().catch((err) => logger.error(`[faqAudit] Startup: ${(err as Error).message}`));

    // Start promotion scheduler — every 15 minutes, idempotent
    const promotionInterval = setInterval(runPromotionCycle, 15 * 60 * 1000);
    runPromotionCycle().catch((e: Error) => logger.error(`Initial promotion cycle: ${e.message}`));

    // Daily FAQ freshness check — auto-flags stale FAQs due for review
    const freshnessInterval = setInterval(() => runFreshnessCheck().catch((e: Error) => logger.error(`Freshness check: ${e.message}`)), 24 * 60 * 60 * 1000);
    runFreshnessCheck().catch((e: Error) => logger.error(`Initial freshness check: ${e.message}`));

    // Public FAQ popularity recompute — every 5 min, idempotent. Aggregates
    // GuestEvent metrics into the FAQ document and re-derives popularityScore
    // for any FAQ whose score is older than the tick.
    const PUBLIC_RECOMPUTE_MS = 5 * 60 * 1000;
    const popularityInterval = setInterval(() => {
      recomputePopularity().catch((e: Error) => logger.error(`[publicFaq] recompute: ${e.message}`));
    }, PUBLIC_RECOMPUTE_MS);
    // First pass 15s after boot — let MongoDB connect, don't fight the
    // initial auto-answer / promotion cycles.
    setTimeout(() => {
      recomputePopularity().catch((e: Error) => logger.error(`[publicFaq] initial recompute: ${e.message}`));
    }, 15_000);

    // Daily retention policy — cleans old SearchLog, Notification, FreshReviewLog, ModerationLog, AdminLog records
    const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const runRetention = async () => {
      try {
        const { cleanSearchLogs, cleanNotifications, cleanFreshReviewLogs, cleanModerationLogs, cleanAdminLogs } = await import('./scripts/retentionPolicy.js');
        await cleanSearchLogs();
        await cleanNotifications();
        await cleanFreshReviewLogs();
        await cleanModerationLogs();
        await cleanAdminLogs();
      } catch (e: unknown) {
        logger.error(`Retention policy: ${(e as Error).message}`);
      }
    };
    const retentionInterval = setInterval(runRetention, RETENTION_INTERVAL_MS);
    runRetention().catch((e: Error) => logger.error(`Initial retention policy: ${e.message}`));

    // Zoom retry scheduler — picks up failed meetings whose nextRetryAt has elapsed
    const ZOOM_RETRY_INTERVAL_MS = parseInt(process.env.ZOOM_RETRY_INTERVAL_MS ?? '300000', 10); // 5 min default
    const retryInterval = setInterval(() => {
      retryFailedMeetings().catch((e: Error) => logger.error(`[retry] ${e.message}`));
    }, ZOOM_RETRY_INTERVAL_MS);

    // Document processing — BullMQ worker + auto-promote cron.
    // Both are no-ops if REDIS_TCP_URL is unset, so the rest of
    // the app boots cleanly without a Redis. The upload controller
    // returns 503 in that case.
    const documentWorkerStarted = startDocumentWorker();
    let documentPromoteInterval: NodeJS.Timeout | null = null;
    if (documentWorkerStarted) {
      const DOC_PROMOTE_INTERVAL_MS = parseInt(process.env.DOCUMENT_INSIGHT_AUTO_PROMOTE_INTERVAL_MS ?? '900000', 10); // 15 min default
      documentPromoteInterval = setInterval(() => {
        runPromotePopularDocumentInsights().catch((e: Error) =>
          logger.error(`[documentPromotion] cron: ${e.message}`),
        );
      }, DOC_PROMOTE_INTERVAL_MS);
      logger.info(`[server] document pipeline online (worker + auto-promote every ${DOC_PROMOTE_INTERVAL_MS / 1000}s)`);
    } else {
      logger.info('[server] document pipeline offline — set REDIS_TCP_URL to enable');
    }

    // Clean up on shutdown
    const cleanup = () => {
      clearInterval(promotionInterval);
      clearInterval(freshnessInterval);
      clearInterval(retentionInterval);
      clearInterval(retryInterval);
      clearInterval(popularityInterval);
      if (documentPromoteInterval) clearInterval(documentPromoteInterval);
      stopEscalationScheduler();
      stopAutoAnswerScheduler();
      stopFAQAuditScheduler();
      void stopDocumentWorker();
      void shutdownTesseract();
    };
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  });
}

// Graceful shutdown — flush pending work before exiting
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`[shutdown] Received ${signal}, starting graceful shutdown`);
  Sentry.close(2000).catch((err) => {
    logger.warn(`[shutdown] Sentry flush failed: ${(err as Error).message}`);
  }); // flush Sentry within 2s

  // Stop accepting new jobs and wait for in-flight ones
  await jobQueue.flush(15_000);

  // Flush buffered search logs to MongoDB
  await flushSearchLogs();

  // Stop the escalation scheduler
  stopEscalationScheduler();

  // Close MongoDB connection
  await mongoose.connection.close();

  logger.info('[shutdown] Graceful shutdown complete');
}

process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM').finally(() => process.exit(0));
});
process.on('SIGINT', () => {
  gracefulShutdown('SIGINT').finally(() => process.exit(0));
});

// Export the app for testing or serverless handler wrapping
export default app;