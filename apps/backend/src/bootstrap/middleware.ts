import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';
import connectDB from '../config/db.js';
import { runWithContext } from '../utils/http/requestContext.js';
import { requestLogger } from '../utils/http/requestLogger.js';
import { ingestFrontendLog } from '../utils/http/fileLogger.js';
import { programScope } from '../middleware/programScope.js';

export function registerMiddleware(app: Express, config: any): void {
  // 1. Trust the proxy hops
  app.set('trust proxy', config.server.trustProxyHops);

  // 2. Database connection middleware (lazy DB check)
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      await connectDB();
      next();
    } catch (err) {
      next(err);
    }
  });

  // 3. Request ID + Context tracking context propagation
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = uuidv4();
    (req as Request & { id: string }).id = requestId;
    res.setHeader('X-Request-ID', requestId);

    const ctx = { requestId, userId: (req as Request & { user?: { id: string } }).user?.id };
    runWithContext(ctx, async () => { next(); });
  });

  // 4. Request logging
  app.use(requestLogger);

  // CORS. Default deployment is single-container / same-origin, so we keep
  // the permissive reflect-origin behaviour as the backward-compatible
  // default. Operators who serve the SPA from a different origin can set
  // CORS_ALLOWED_ORIGINS (comma-separated) to lock credentialed CORS down to
  // an explicit allowlist instead of reflecting any origin — recommended for
  // any cross-origin or cookie-bearing setup. Requests with no Origin header
  // (same-origin, curl, server-to-server) are always allowed.
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (allowedOrigins.length > 0) {
    app.use(
      cors({
        origin(origin, callback) {
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
          }
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        },
        credentials: true,
      }),
    );
  } else {
    app.use(cors({ origin: true, credentials: true }));
  }

  // 6. Security headers via Helmet
  app.use(helmet({
    crossOriginResourcePolicy: false,
  }));

  // 7. Body Parsing
  app.use(express.json());

  // 7.5. Global Program Scoping (soft)
  app.use(programScope({ required: false }));

  // 8. Minimal Cookie parser
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
      try { jar[k] = decodeURIComponent(v); } catch { /* malformed */ }
    }
    (req as Request & { cookies: Record<string, string> }).cookies = jar;
    next();
  });

  // Serve static uploads
  app.use('/uploads', express.static('uploads'));

  // Frontend log endpoint
  app.post('/csfaq/api/log', ingestFrontendLog);
}
