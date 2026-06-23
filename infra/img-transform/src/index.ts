/**
 * img-transform — Cloud Run service that serves transformed images.
 *
 * Sits behind Cloud CDN. The browser hits `https://media.mydomain.com/...`
 * which routes through CDN → (cache miss) → this service → GCS.
 *
 * Query params this service understands (Cloudinary-compatible mapping):
 *   w, h            — pixel dimensions
 *   fit             — cover | inside | contain | fill | outside (Sharp `fit`)
 *   gravity         — attention | center | north | south | east | west | entropy
 *   q               — auto | 1..100
 *   fm              — auto | webp | avif | jpeg | png
 *   dpr             — device pixel ratio (1.0 | 2.0 | 3.0)
 *   blur            — 0..2000
 *   rotate          — 0 | 90 | 180 | 270
 *
 * Format auto (`fm=auto`) uses the Accept header to pick webp/avif/jpeg.
 * The Vary: Accept response header is what makes Cloud CDN cache webp
 * and jpeg variants separately for the same URL.
 *
 * Caching: Cache-Control: public, max-age=31536000, immutable (1 year).
 * Cloudinary URLs (res.cloudinary.com/...) are passed through unchanged
 * — this service handles only our GCS assets.
 */
import express, { type Request, type Response } from 'express';
import sharp from 'sharp';
import { Storage } from '@google-cloud/storage';

const PORT = parseInt(process.env.PORT ?? '8080', 10);
const BUCKET = process.env.GCS_BUCKET;
if (!BUCKET) {
  console.error('GCS_BUCKET is required');
  process.exit(1);
}

const storage = new Storage();
const bucket = storage.bucket(BUCKET);

const app = express();
app.disable('x-powered-by');

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', bucket: BUCKET });
});

// Liveness probe
app.get('/liveness', (_req, res) => {
  res.status(200).send('ok');
});

interface TransformOpts {
  w?: number;
  h?: number;
  fit?: SharpFit;
  gravity?: SharpPosition;
  q?: 'auto' | number;
  fm?: 'auto' | 'webp' | 'avif' | 'jpeg' | 'png';
  dpr?: number;
  blur?: number;
  rotate?: number;
}

type SharpFit = NonNullable<sharp.ResizeOptions['fit']>;
type SharpPosition = NonNullable<sharp.ResizeOptions['position']>;

function parseQuery(q: Request['query']): TransformOpts {
  const get = (k: string) => (typeof q[k] === 'string' ? q[k] : undefined);
  const num = (s: string | undefined): number | undefined => {
    if (s === undefined) return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };
  const fit = get('fit');
  const gravity = get('gravity');
  const fm = get('fm');
  const qStr = get('q');
  const fitValues: SharpFit[] = ['cover', 'contain', 'fill', 'inside', 'outside'];
  const positionValues: SharpPosition[] = ['attention', 'center', 'entropy', 'top', 'right top', 'right', 'right bottom', 'bottom', 'left bottom', 'left', 'left top'];
  const fmValues: Array<TransformOpts['fm']> = ['auto', 'webp', 'avif', 'jpeg', 'png'];
  return {
    w: num(get('w')),
    h: num(get('h')),
    fit: (fitValues as string[]).includes(fit ?? '') ? (fit as SharpFit) : undefined,
    gravity: (positionValues as string[]).includes(gravity ?? '') ? (gravity as SharpPosition) : undefined,
    q: qStr === 'auto' ? 'auto' : (qStr !== undefined ? num(qStr) : undefined),
    fm: (fmValues as string[]).includes(fm ?? '') ? (fm as NonNullable<TransformOpts['fm']>) : undefined,
    dpr: num(get('dpr')),
    blur: num(get('blur')),
    rotate: num(get('rotate')),
  };
}

function chooseFormat(acceptHeader: string, fmHint?: string): { format: keyof sharp.FormatEnum; contentType: string } {
  const accept = acceptHeader.toLowerCase();
  if (fmHint === 'webp') return { format: 'webp', contentType: 'image/webp' };
  if (fmHint === 'avif') return { format: 'avif', contentType: 'image/avif' };
  if (fmHint === 'png') return { format: 'png', contentType: 'image/png' };
  if (fmHint === 'jpeg') return { format: 'jpeg', contentType: 'image/jpeg' };
  if (fmHint && fmHint !== 'auto') return { format: 'jpeg', contentType: 'image/jpeg' };

  // fm=auto: pick best supported format from Accept header
  if (accept.includes('image/avif')) return { format: 'avif', contentType: 'image/avif' };
  if (accept.includes('image/webp')) return { format: 'webp', contentType: 'image/webp' };
  return { format: 'jpeg', contentType: 'image/jpeg' };
}

function applyTransforms(input: sharp.Sharp, opts: TransformOpts, format: keyof sharp.FormatEnum, quality: number | undefined): sharp.Sharp {
  let pipeline = input;

  if (opts.rotate !== undefined && opts.rotate > 0) {
    pipeline = pipeline.rotate(opts.rotate as 0 | 90 | 180 | 270);
  }

  if (opts.w !== undefined || opts.h !== undefined) {
    pipeline = pipeline.resize({
      width: opts.w,
      height: opts.h,
      fit: opts.fit ?? 'cover',
      position: opts.gravity,
      withoutEnlargement: opts.fit === 'inside',
    });
  }

  if (opts.blur !== undefined && opts.blur > 0) {
    pipeline = pipeline.blur(opts.blur);
  }

  // Encode in target format with quality
  if (format === 'webp') {
    pipeline = pipeline.webp({ quality: quality ?? 82 });
  } else if (format === 'avif') {
    pipeline = pipeline.avif({ quality: quality ?? 60 });
  } else if (format === 'png') {
    pipeline = pipeline.png();
  } else {
    pipeline = pipeline.jpeg({ quality: quality ?? 82, mozjpeg: true });
  }

  return pipeline;
}

// ── Main route ────────────────────────────────────────────────────────────────
//
// Captures anything after / and treats it as an object path inside the bucket.
// Example: GET /avatar/abc123/photo.jpg?w=200&h=200&fit=cover
//
// Note: Express doesn't auto-decode the path; we decode it ourselves.
app.get(/^\/(.+)$/, async (req, res) => {
  const match = req.params[0] as string | undefined;
  if (!match) {
    res.status(400).json({ error: 'missing object path' });
    return;
  }
  // Express URL-decodes once; ensure we decode again in case of nested encoding.
  const objectPath = decodeURIComponent(match);

  // Reject obvious traversal attempts at the route layer too.
  if (objectPath.includes('..') || objectPath.startsWith('/')) {
    res.status(400).json({ error: 'invalid object path' });
    return;
  }

  const opts = parseQuery(req.query);

  try {
    // 1. Download the original from GCS.
    const file = bucket.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).json({ error: 'not found', object: objectPath });
      return;
    }
    const [originalBuffer] = await file.download();

    // 2. Pick output format.
    const accept = req.headers['accept'] ?? '';
    const { format, contentType } = chooseFormat(accept, opts.fm);

    // 3. Apply transforms.
    const pipeline = applyTransforms(sharp(originalBuffer), opts, format, opts.q === 'auto' ? undefined : opts.q);
    const transformed = await pipeline.toBuffer();

    // 4. Send response with the right headers for CDN caching.
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    // CRITICAL: Vary on Accept so CDN caches webp and jpeg separately per browser.
    res.set('Vary', 'Accept');
    res.set('Content-Length', String(transformed.length));
    res.status(200).send(transformed);
  } catch (err) {
    console.error(`[img-transform] error for ${objectPath}:`, (err as Error).message);
    res.status(500).json({ error: 'transform failed', message: (err as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`[img-transform] listening on :${PORT}, bucket=${BUCKET}`);
});