/**
 * gcsTransform.ts — URL builder for GCS-backed images served via CDN +
 * Cloud Run image transform service. Replaces the Cloudinary-style
 * `buildTransformedUrl()` helper.
 *
 * Accepts the SAME transform string format the existing code passes
 * (`'w_200,h_200,c_fill,g_auto,q_auto,f_auto'`) so call sites don't have to
 * change. The string is parsed into the query params the img-transform
 * Cloud Run service expects:
 *
 *   ?w=200&h=200&fit=cover&gravity=auto&q=auto&fm=auto
 *
 * Old Cloudinary URLs (`res.cloudinary.com/...`) are passed through
 * unchanged so DB rows pointing at legacy assets keep rendering during the
 * migration window. They'll be bulk-re-uploaded to GCS in Phase 3.
 *
 * The Cloud Run transform service is responsible for actually interpreting
 * the params; this helper just builds the URL.
 */

export interface GcsTransformOpts {
  /** Output width in pixels. */
  w?: number;
  /** Output height in pixels. */
  h?: number;
  /**
   * Resize fit. Maps to Sharp's `fit` parameter:
   *   - `cover`: fill the box, crop excess (Cloudinary `c_fill`)
   *   - `inside`: fit within, never enlarge (Cloudinary `c_fit` / `c_limit`)
   *   - `contain`: fit within, may letterbox (Cloudinary `c_pad`)
   *   - `fill`: stretch (Cloudinary `c_scale`)
   */
  fit?: 'cover' | 'inside' | 'contain' | 'fill' | 'outside';
  /** Crop gravity. Cloudinary's `g_auto` → Sharp's attention-based crop. */
  gravity?: 'auto' | 'center' | 'north' | 'south' | 'east' | 'west' | 'attention' | 'entropy';
  /** Quality: 'auto' for the transform service to decide, or 1-100. */
  q?: 'auto' | number;
  /** Output format. 'auto' picks WebP/AVIF based on Accept header. */
  fm?: 'auto' | 'webp' | 'avif' | 'jpeg' | 'png';
  /** Device pixel ratio (for retina-aware sizes). */
  dpr?: number;
}

const TRANSFORM_KEY_MAP: Record<string, keyof GcsTransformOpts> = {
  // Dimensions
  w_: 'w',
  h_: 'h',
  // Crop modes → fit
  c_fill: 'fit',
  c_crop: 'fit',
  c_fit: 'fit',
  c_limit: 'fit',
  c_scale: 'fit',
  c_pad: 'fit',
  c_thumb: 'fit',
  // Gravity
  g_auto: 'gravity',
  g_face: 'gravity',
  g_center: 'gravity',
  g_north: 'gravity',
  g_south: 'gravity',
  g_east: 'gravity',
  g_west: 'gravity',
  g_attention: 'gravity',
  // Quality
  q_: 'q',
  // Format
  f_auto: 'fm',
  f_webp: 'fm',
  f_avif: 'fm',
  f_jpg: 'fm',
  f_jpeg: 'fm',
  f_png: 'fm',
  // DPR
  dpr_: 'dpr',
};

/**
 * Parse a Cloudinary-style transform string into a flat options object.
 * Examples:
 *   'w_200' → { w: 200 }
 *   'w_200,h_200' → { w: 200, h: 200 }
 *   'c_fill' → { fit: 'cover' }   (with the mapping below)
 *   'w_800,h_450,c_fill,q_auto,f_auto' → { w: 800, h: 450, fit: 'cover', q: 'auto', fm: 'auto' }
 */
function parseCloudinaryTransformString(transform: string): GcsTransformOpts {
  const opts: GcsTransformOpts = {};
  const parts = transform.split(',').map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    // The Cloudinary format is `key_value` where value can contain more
    // underscores (e.g. `q_auto:best`). Find the first underscore.
    const idx = part.indexOf('_');
    if (idx === -1) continue;
    const key = part.slice(0, idx + 1); // include trailing underscore
    const value = part.slice(idx + 1);

    // Try the full prefix-with-underscore first; if no mapping, try
    // without (for `w_200` where the underscore separates key from value).
    let mapped: keyof GcsTransformOpts | undefined;
    if (key in TRANSFORM_KEY_MAP) {
      mapped = TRANSFORM_KEY_MAP[key];
      applyOption(opts, mapped, value);
    } else if (key.slice(0, -1) in TRANSFORM_KEY_MAP) {
      // key without trailing underscore — shouldn't happen but be defensive
      mapped = TRANSFORM_KEY_MAP[key.slice(0, -1)];
      applyOption(opts, mapped, value);
    } else {
      // Unknown — silently ignore. Future transforms won't break old URLs.
    }
  }

  return opts;
}

function applyOption(opts: GcsTransformOpts, key: keyof GcsTransformOpts, value: string): void {
  switch (key) {
    case 'w':
    case 'h':
    case 'dpr':
      opts[key] = Number(value);
      break;
    case 'fit': {
      // Map Cloudinary fit modes → Sharp fit.
      const fitMap: Record<string, GcsTransformOpts['fit']> = {
        c_fill: 'cover',
        c_crop: 'cover',
        c_thumb: 'cover',
        c_fit: 'inside',
        c_limit: 'inside',
        c_scale: 'fill',
        c_pad: 'contain',
      };
      const fit = fitMap[value] ?? (value as GcsTransformOpts['fit']);
      if (fit) opts.fit = fit;
      break;
    }
    case 'gravity': {
      const map: Record<string, GcsTransformOpts['gravity']> = {
        g_auto: 'attention',  // Sharp's smart-crop equivalent of Cloudinary face-aware
        g_face: 'attention',
      };
      const g = map[value] ?? (value as GcsTransformOpts['gravity']);
      if (g) opts.gravity = g;
      break;
    }
    case 'q':
      opts.q = value === 'auto' ? 'auto' : Number(value);
      break;
    case 'fm':
      opts.fm = value as GcsTransformOpts['fm'];
      break;
  }
}

function optsToQuery(opts: GcsTransformOpts): URLSearchParams {
  const params = new URLSearchParams();
  if (opts.w !== undefined) params.set('w', String(opts.w));
  if (opts.h !== undefined) params.set('h', String(opts.h));
  if (opts.fit !== undefined) params.set('fit', opts.fit);
  if (opts.gravity !== undefined) params.set('gravity', opts.gravity);
  if (opts.q !== undefined) params.set('q', String(opts.q));
  if (opts.fm !== undefined) params.set('fm', opts.fm);
  if (opts.dpr !== undefined) params.set('dpr', String(opts.dpr));
  return params;
}

const CLOUDINARY_HOST = 'res.cloudinary.com';

/**
 * Build a CDN URL with the transform query params for the img-transform
 * service. If the input URL is a legacy Cloudinary URL, pass through
 * unchanged — the existing Cloudinary CDN still serves those during the
 * migration window.
 *
 * Sort the query params alphabetically before emitting them so CDN cache
 * keys are stable regardless of which order the caller wrote the options.
 */
export function buildGcsTransformedUrl(
  url: string,
  transform: GcsTransformOpts | string
): string {
  if (!url) return url;
  // Pass through Cloudinary URLs (legacy assets) until Phase 3 migration.
  if (url.includes(`${CLOUDINARY_HOST}/`)) return url;

  const opts = typeof transform === 'string'
    ? parseCloudinaryTransformString(transform)
    : transform;
  const params = optsToQuery(opts);

  const u = new URL(url);
  // Sort for stable cache keys.
  const sortedKeys = [...params.keys()].sort();
  for (const k of sortedKeys) {
    const all = params.getAll(k);
    u.searchParams.delete(k);
    for (const v of all) u.searchParams.append(k, v);
  }
  return u.toString();
}