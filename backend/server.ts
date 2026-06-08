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
import { ingestFrontendLog } from './utils/fileLogger.js';
import { logger } from './utils/logger.js';
import { requestLogger } from './utils/requestLogger.js';
import { startEscalationScheduler, stopEscalationScheduler } from './controllers/escalationController.js';
import { runScheduledAutoAnswer, stopAutoAnswerScheduler } from './controllers/autoAnswerController.js';
import { runScheduledFAQAudit, stopFAQAuditScheduler } from './controllers/faqAuditController.js';
import { runFreshnessCheck } from './controllers/freshnessController.js';
import { runPromotionCycle } from './services/promotionService.js';
import { getMetrics } from './utils/metrics.js';
import { runWithContext } from './utils/requestContext.js';
import { flushSearchLogs } from './controllers/searchController.js';
import { jobQueue } from './utils/jobQueue.js';
import { getCloudinaryConfig } from './utils/cloudinary.js';
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
  } catch {
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
    await import('./utils/embeddings.js').then(m => m.warmEmbedder());
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

    // Clean up on shutdown
    const cleanup = () => {
      clearInterval(promotionInterval);
      clearInterval(freshnessInterval);
      clearInterval(retentionInterval);
      stopEscalationScheduler();
      stopAutoAnswerScheduler();
      stopFAQAuditScheduler();
    };
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  });
}

// Graceful shutdown — flush pending work before exiting
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`[shutdown] Received ${signal}, starting graceful shutdown`);
  Sentry.close(2000).catch(() => {}); // flush Sentry within 2s

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