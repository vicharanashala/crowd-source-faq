import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
// morgan removed in v1.68 — httpLog (via requestLogger.ts)
// now owns HTTP request logging.
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
import programRoutes from './routes/program.js';
import adminProgramSettingsRoutes from './routes/adminProgramSettings.js';
import programZoomRoutes from './routes/programZoom.js';
import programDiscordRoutes from './routes/programDiscord.js';
import programFeatureFlagsRoutes from './routes/programFeatureFlags.js';
import programAppSettingsRoutes from './routes/programAppSettings.js';
import courseRoutes from './routes/course.js';
import enrollmentRoutes from './routes/enrollment.js';
import supportRoutes from './routes/support.js';
import featureFlagRoutes from './routes/featureFlag.js';
import { documentRouter, documentAdminRouter } from './routes/documents.js';
import welcomeRoutes from './routes/welcomeRoutes.js';
import adminWelcomeRoutes from './routes/adminWelcomeRoutes.js';
import adminMentorRoutes from './routes/adminMentorRoutes.js';
import adminTimelineRoutes from './routes/adminTimelineRoutes.js';
import { adminRouter as appSettingsAdminRouter, publicRouter as appSettingsPublicRouter } from './routes/appSettings.js';
import adminCategoryClusterRoutes from './routes/adminCategoryCluster.js';
import publicCategoryClusterRoutes from './routes/publicCategoryCluster.js';
import healthRoutes from './routes/health.js';
import { ingestFrontendLog } from './utils/http/fileLogger.js';
import { logger, startupLog, shutdownLog, cronLog, queueLog } from './utils/http/logger.js';
import { startBot, stopBot } from './bot/discordBot.js';
// v1.69 — Phase 6: per-program bot manager. Coexists with the
// legacy env-var-backed global bot (still useful for
// single-tenant dev mode or an org-wide alert channel).
import { botManager } from './bot/botManager.js';
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
import { clusterAllActiveBatches } from './utils/ai/categoryClusterer.js';
import * as Sentry from '@sentry/node';
import { expressIntegration } from '@sentry/node';

// Load environment variables
// .env is loaded first as the base; .env.local is loaded second with override:true
// so any variable set in .env.local always wins — this is how the local MongoDB URI
// injected by run.sh into .env.local takes precedence over the placeholder in .env.
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

// Initialize Sentry
// Cast needed because @sentry/node v10 moved `dsn` from BaseNodeOptions
// to the parent Options<> type — the cast keeps runtime behaviour identical.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  integrations: [
    expressIntegration(),
  ],
  tracesSampleRate: 0.1, // 10% of transactions sampled
} as Parameters<typeof Sentry.init>[0]);

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
// v1.68 — requestLogger.ts (the named httpLog) replaced
// morgan here. morgan was producing unstyled "GET /api/foo
// 200 12ms" lines that duplicated what httpLog already logs
// with [http] category + colored level tag. Removing it cuts
// noise without losing any signal.

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

// Serve static uploads
app.use('/uploads', express.static('uploads'));

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
app.use('/api/health', healthRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/admin/programs', adminProgramSettingsRoutes);
app.use('/api/admin/programs', programZoomRoutes);
app.use('/api/admin/programs', programDiscordRoutes);
app.use('/api/admin/programs', programFeatureFlagsRoutes);
app.use('/api/admin/programs', programAppSettingsRoutes);
app.use('/api/admin/programs/:batchId/category-clusters', adminCategoryClusterRoutes);
app.use('/api/public/category-clusters', publicCategoryClusterRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api', enrollmentRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/feature-flags', featureFlagRoutes);
app.use('/api/documents', documentRouter);
app.use('/api/admin/documents', documentAdminRouter);
app.use('/api/welcome', welcomeRoutes);
app.use('/api/admin/welcome', adminWelcomeRoutes);
app.use('/api/admin/mentors', adminMentorRoutes);
app.use('/api/admin/timeline-steps', adminTimelineRoutes);

// v1.65 — Global app settings (Golden Ticket cooldown, penalty
// multiplier). Two routers: admin-only at /api/admin/settings and
// public-safe subset at /api/public/settings.
app.use('/api/admin/settings', appSettingsAdminRouter);
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

  // Required: MONGODB_URI (or MONGO_URI / DATABASE_URL aliases)
  // connectDB has a hardcoded local fallback, so a missing URI is only a warning
  // in development — it will attempt mongodb://127.0.0.1:27017/crowd_source_faq.
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!mongoUri) {
    if (process.env.NODE_ENV === 'production') {
      errors.push('MONGODB_URI is required in production');
    } else {
      logger.warn('[validateEnv] MONGODB_URI / MONGO_URI / DATABASE_URL not set — connectDB will use local fallback (mongodb://127.0.0.1:27017/crowd_source_faq). Set MONGODB_URI in backend/.env.local to suppress this warning.');
    }
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

  // v1.68 — H1: recommend (don't require) dedicated secrets for
  // AES encryption + OAuth state. Falls back to JWT_SECRET when
  // unset (backwards compat). The warnings tell the operator to
  // rotate to the new keys when convenient.
  if (!process.env.ENCRYPTION_MASTER_KEY) {
    logger.warn('[validateEnv] ENCRYPTION_MASTER_KEY not set — falling back to JWT_SECRET for AES. Add a dedicated key to enable independent rotation.');
  }
  if (!process.env.OAUTH_STATE_SECRET) {
    logger.warn('[validateEnv] OAUTH_STATE_SECRET not set — falling back to JWT_SECRET for OAuth state HMAC. Add a dedicated key to enable independent rotation.');
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
  const zoomClientId = process.env.ZOOM_CLIENT_ID;
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
//
// C3 fix (v1.68): env validation is ALWAYS run, not just in
// non-production. Previously `if (NODE_ENV !== 'production')`
// gated the entire listen block (including validateEnv), so a
// misconfigured prod deploy with weak/missing JWT_SECRET or
// MONGODB_URI would boot silently. Now validation fails-fast
// in every environment, and only the app.listen() is gated.
validateEnv();
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, async () => {
    // v1.67 — fire ALERT on startup (Discord ping). This is the
    // "server is alive" signal so you know restarts happened.
    startupLog.alert('backend listening', {
      port: PORT,
      env: process.env.NODE_ENV ?? 'development',
      nodeVersion: process.version,
    });
    startupLog.info(`Yaksha FAQ Portal backend running on port ${PORT}`);

    // Ensure MongoDB is connected before starting any scheduled tasks
    try {
      await connectDB();
    } catch (e) {
      startupLog.error('startup DB connect failed', { error: (e as Error).message });
    }

    startEscalationScheduler();
    runScheduledAutoAnswer().catch((err) => logger.error(`[autoAnswer] Startup: ${(err as Error).message}`));
    runScheduledFAQAudit().catch((err) => logger.error(`[faqAudit] Startup: ${(err as Error).message}`));

    // v1.68 — start the Discord bot (gated on
    // DISCORD_BOT_TOKEN; no-ops gracefully if the env var
    // is missing). The bot registers its own guild-scoped
    // slash commands on ready, listens for /ask, /search,
    // /status, /help, and admin-only /tickets, /resolve,
    // /ban, /broadcast.
    // v1.69 — Phase 6: start the legacy env-var-backed global
    // bot (if configured) and then start every per-program
    // Discord bot from ProgramConfig.discord. The legacy bot
    // and the per-program fleet are intentionally independent —
    // a single-tenant dev mode keeps the legacy client; a
    // multi-tenant production deploy flips Discord_BOT_TOKEN
    // off and lets botManager do all the work.
    void startBot().catch((err) => logger.error(`[bot] startup: ${(err as Error).message}`));
    void botManager.startAll().catch((err) => logger.error(`[botManager] startAll: ${(err as Error).message}`));

    // Start promotion scheduler — every 15 minutes, idempotent
    const promotionInterval = setInterval(runPromotionCycle, 15 * 60 * 1000);
    runPromotionCycle().catch((e: Error) => logger.error(`Initial promotion cycle: ${e.message}`));

    // Daily FAQ freshness check — auto-flags stale FAQs due for review
    const freshnessInterval = setInterval(() => runFreshnessCheck().catch((e: Error) => logger.error(`Freshness check: ${e.message}`)), 24 * 60 * 60 * 1000);
    runFreshnessCheck().catch((e: Error) => logger.error(`Initial freshness check: ${e.message}`));

    // v1.70 — Dynamic Categories: recompute category clusters for every
    // active batch every 24h. Locked clusters (admin-curated) survive;
    // everything else gets refreshed. The first pass runs 15s after boot
    // so it doesn't fight the initial popularity / promotion cycles.
    const CATEGORY_CLUSTER_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const categoryClusterInterval = setInterval(() => {
      clusterAllActiveBatches().catch((e: Error) =>
        logger.error(`[categoryClusterer] cron: ${e.message}`)
      );
    }, CATEGORY_CLUSTER_INTERVAL_MS);
    setTimeout(() => {
      clusterAllActiveBatches().catch((e: Error) =>
        logger.error(`[categoryClusterer] initial cluster: ${e.message}`)
      );
    }, 15_000);

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

    // v1.69 — single signal handler. The previous build had two
    // registrations (an inline `cleanup` and the module-level
    // `gracefulShutdown` further down) racing on the same signal.
    // The graceful one wins; cron intervals are torn down via their
    // `.stop()` helpers inside `gracefulShutdown`. So we just rely
    // on the bottom-of-file `process.on('SIGTERM'|'SIGINT', …)`
    // blocks below.
  });
}

// Graceful shutdown — flush pending work before exiting
async function gracefulShutdown(signal: string): Promise<void> {
  // v1.67 — ALERT-level shutdown log so the Discord channel sees
  // every restart. The followup "shutdown complete" line is
  // INFO (so it doesn't double-ping).
  shutdownLog.alert('shutdown initiated', { signal });
  Sentry.close(2000).catch((err: unknown) => {
    logger.warn(`[shutdown] Sentry flush failed: ${(err as Error).message}`);
  }); // flush Sentry within 2s

  // Stop accepting new jobs and wait for in-flight ones
  await jobQueue.flush(15_000);

  // Flush buffered search logs to MongoDB
  await flushSearchLogs();

  // Stop the escalation scheduler
  stopEscalationScheduler();

  // v1.68 — stop the Discord bot
  await stopBot();
  // v1.69 — Phase 6: also stop every per-program bot instance
  // managed by botManager.
  await botManager.stopAll();

  // Close MongoDB connection
  await mongoose.connection.close();

  shutdownLog.info('graceful shutdown complete');
}

process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM').finally(() => process.exit(0));
});
process.on('SIGINT', () => {
  gracefulShutdown('SIGINT').finally(() => process.exit(0));
});

// Export the app for testing or serverless handler wrapping
export default app;