import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import connectDB from '../config/db.js';
import { runWithContext } from '../utils/http/requestContext.js';
import { requestLogger } from '../utils/http/requestLogger.js';
import { ingestFrontendLog } from '../utils/http/fileLogger.js';
import { publicBasePath } from '../utils/publicBasePath.js';
import { programScope } from '../middleware/programScope.js';

// Absolute path to the `uploads/` directory.
// Resolved from the source file location so it works regardless of
// process.cwd() — which may not be the backend root (e.g. on a
// compiled-dist server run via `node dist/server.js`).
//
// Depth calculation (same in dev src/ and prod dist/ because
// rootDir=src outDir=dist preserves the folder structure):
//   dist/bootstrap/middleware.js → 2 levels up → apps/backend/
//   so: ../../uploads → apps/backend/uploads ✔
const __dirname_mw = path.dirname(fileURLToPath(import.meta.url));
const uploadsStaticPath = path.resolve(__dirname_mw, '../../uploads');

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
    runWithContext(ctx, async () => {
      next();
    });
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
      })
    );
  } else {
    app.use(cors({ origin: true, credentials: true }));
  }

  // 6. Security headers via Helmet
  //
  // CSP fix for the Cloudinary signed-upload flow: the browser POSTs
  // files DIRECTLY to https://api.cloudinary.com/v1_1/<cloud>/auto/upload
  // (see apps/frontend/src/hooks/useCloudinarySvgUpload.ts). Helmet 8's
  // default CSP sets `default-src 'self'` which silently blocks that
  // cross-origin POST and surfaces as "Failed to create resource." in
  // the admin UI.
  //
  // We set the CSP ourselves in a final response middleware (below) —
  // NOT via helmet's contentSecurityPolicy option. That gives us a
  // single source of truth and makes the policy survive a reverse
  // proxy (nginx, Cloudflare) silently stripping or replacing the
  // upstream header. We still keep helmet for the OTHER security
  // headers (X-Frame-Options, X-Content-Type-Options, Strict-Transport-
  // Security, Referrer-Policy, etc.).
  //
  // See infra/nginx/csfaq.conf for the matching nginx snippet.
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      // Disable helmet's CSP entirely — we set it ourselves below
      // so that no proxy can accidentally re-introduce helmet's
      // default `default-src 'self'` and block Cloudinary again.
      contentSecurityPolicy: false,
    })
  );

  // Single source of truth for the CSP. This runs LAST in the
  // middleware chain (well, after helmet and the static mounts —
  // none of them touch CSP) and unconditionally emits the header,
  // guaranteeing the browser sees EXACTLY one Content-Security-Policy
  // header with the directives we want. If a proxy upstream added a
  // second CSP, the browser would enforce the intersection — i.e.
  // the most restrictive combination — which is exactly the failure
  // mode that produced the production bug report (`img-src 'self'
  // data:` from helmet, while the Cloudinary hosts were also listed
  // in our CSP, but the browser still blocked them because the
  // intersect of `img-src 'self' data:` and `img-src https://res.
  // cloudinary.com` is `img-src 'self' data:`).
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'self'",
        // img-src + media-src: needed for SVG previews, image
        // attachments, and any other media served from Cloudinary.
        "img-src 'self' data: blob: https://res.cloudinary.com",
        "media-src 'self' data: blob: https://res.cloudinary.com",
        "font-src 'self' https: data:",
        "style-src 'self' https: 'unsafe-inline'",
        "script-src 'self' https://fonts.googleapis.com",
        // connect-src: needed for the browser→Cloudinary signed
        // upload (api.cloudinary.com) and for HuggingFace Inference
        // (RAG / embeddings). Zoom endpoints included for symmetry
        // since the server may proxy to them too.
        "connect-src 'self' https://api.cloudinary.com https://res.cloudinary.com https://api-inference.huggingface.co https://zoom.us https://api.zoom.us",
        "frame-ancestors 'self'",
        "form-action 'self'",
        "object-src 'none'",
        'upgrade-insecure-requests',
      ].join('; ')
    );
    next();
  });

  // 7. Body Parsing
  app.use(express.json());

  // 7.5. Global Program Scoping (soft)
  app.use(programScope({ required: false }));

  // 8. Minimal Cookie parser
  app.use((req: Request, _res: Response, next: (e?: unknown) => void) => {
    const header = req.headers.cookie;
    if (!header) {
      next();
      return;
    }
    const jar: Record<string, string> = {};
    for (const part of header.split(';')) {
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      const k = part.slice(0, eq).trim();
      const v = part.slice(eq + 1).trim();
      if (!k) continue;
      try {
        jar[k] = decodeURIComponent(v);
      } catch {
        /* malformed */
      }
    }
    (req as Request & { cookies: Record<string, string> }).cookies = jar;
    next();
  });

  // Serve static uploads.
  //
  // v1.69 — publicBasePath fix: previously this mounted at
  // `/uploads` only. When the app is hosted under `/csfaq/`
  // (the only current deployment), browsers request asset URLs at
  // `/csfaq/uploads/...` but the server only served `/uploads/...`,
  // causing 404s on every uploaded SVG/PDF/etc. We now mount under
  // BOTH paths: the public-base-prefixed one (canonical, matches
  // the URLs the backend stores in Mongo) and the bare `/uploads`
  // (kept as a safety net for any client still hitting the old
  // path — e.g. a stale localStorage entry from before this fix).
  // The `publicBasePath()` helper reads `PUBLIC_BASE_PATH` env
  // (default `/csfaq`) so this works under any deployment prefix.
  //
  // v1.70 — absolute path fix: use the path anchored to import.meta.url
  // (see uploadsStaticPath at top of file) instead of bare 'uploads'
  // so Vercel's /var/task CWD doesn't cause a 404.
  app.use(`${publicBasePath()}/uploads`, express.static(uploadsStaticPath));
  app.use('/uploads', express.static(uploadsStaticPath));

  // Frontend log endpoint
  app.post('/csfaq/api/log', ingestFrontendLog);
}
