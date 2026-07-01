/**
 * gcs.ts — Google Cloud Storage signed-upload helper + URL validator.
 *
 * Replaces the Cloudinary signed-upload flow. The browser asks the backend
 * for a short-lived V4 signed PUT URL, then uploads the file DIRECTLY to
 * GCS — the file bytes never traverse our backend.
 *
 * Flow:
 *   1. Browser calls GET /csfaq/api/upload/sign?subfolder=avatar
 *   2. We return { uploadUrl, publicUrl, gcsUri, objectPath, expiresAt }
 *      - uploadUrl is a V4-signed PUT URL on the bucket, scoped to a
 *        server-controlled object path under <userId>/<subfolder>/, with
 *        Content-Type locked in the signature so the browser can't upload
 *        a JPEG to a slot we signed for a PNG.
 *   3. Browser PUTs the file to that URL (Content-Type header MUST match).
 *   4. GCS returns 200; the browser then POSTs the metadata to the relevant
 *      model endpoint (e.g. /csfaq/api/auth/profile for avatar, /csfaq/api/community
 *      for post attachments).
 *
 * The object path is server-controlled — the browser can never write to a
 * sibling user's space, even though it's uploading directly to GCS.
 *
 * V4 signed URLs default to 15-minute TTL. Tight enough that a leaked URL
 * has minimal blast radius; long enough that a slow browser upload still
 * finishes.
 */

import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'node:crypto';

export interface GcsConfig {
  bucket: string;
  /** CDN host that serves the public URLs (e.g. "media.mydomain.com"). */
  publicHost: string;
  /** Subfolder names the browser may request. Tight whitelist. */
  allowedSubfolders: ReadonlyArray<string>;
  /** MIME types we'll sign PUT URLs for. */
  allowedMimeTypes: ReadonlyArray<string>;
  /** Per-file size cap, enforced client-side; we surface it for docs/UI. */
  maxFileSizeMb: number;
  /** TTL for the V4 signed URL in seconds. */
  signedUrlTtlSeconds: number;
}

export interface GcsSignedUpload {
  /** PUT target. The browser uploads the file bytes here. */
  uploadUrl: string;
  /** Public CDN URL the model stores and the UI renders. */
  publicUrl: string;
  /** gs:// scheme URI for ops scripts that need to act on the object. */
  gcsUri: string;
  /** Path inside the bucket: avatars/<userId>/<uuid>-<filename>. */
  objectPath: string;
  /** Content-Type that MUST be sent on the PUT. Locked into the signature. */
  contentType: string;
  /** When the signed URL stops working (ms epoch). */
  expiresAt: number;
  /** TTL in seconds — convenience for the browser's own UI. */
  ttlSeconds: number;
}

/**
 * Read GCS config from env. Throws if anything critical is missing.
 * Caller (validateEnv) decides what to do with the throw — we want a loud
 * failure at boot rather than silent runtime errors.
 */
export function getGcsConfig(): GcsConfig {
  const bucket = (process.env.GCS_BUCKET ?? '').trim();
  const publicHost = (process.env.GCS_PUBLIC_HOST ?? '').trim();
  const subfoldersRaw = (process.env.GCS_ALLOWED_SUBFOLDERS ?? 'avatar,posts').trim();

  if (!bucket) {
    throw new Error(
      'GCS_BUCKET is not configured. Set GCS_BUCKET in backend/.env. The ' +
      '/csfaq/api/upload/sign endpoint will not work without it.'
    );
  }
  if (!publicHost) {
    throw new Error(
      'GCS_PUBLIC_HOST is not configured. Set it to your CDN host (e.g. ' +
      'media.mydomain.com) so signed uploads produce correct public URLs.'
    );
  }

  return {
    bucket,
    publicHost: publicHost.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    allowedSubfolders: subfoldersRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxFileSizeMb: 8,
    signedUrlTtlSeconds: 15 * 60,
  };
}

// ── Storage client ────────────────────────────────────────────────────────────
//
// We construct the Storage client per call (not a singleton) for two reasons:
//   1. Tests can mock @google-cloud/storage cleanly without worrying about
//      stale cached state across test cases.
//   2. The @google-cloud/storage client lazily initializes its connection
//      pool on first use; per-call construction is cheap and avoids the
//      "stuck connection pool" failure mode where a long-running process
//      accumulates broken sockets.
//
// Auth: credentials auto-detected from environment:
//   - On GCP (Cloud Run, GCE, App Engine): instance metadata server
//   - Locally: GOOGLE_APPLICATION_CREDENTIALS=<path-to-sa-json>
//   - Anywhere: pass credentials explicitly to the Storage constructor
function getStorageClient(): Storage {
  return new Storage();
}

/**
 * Build a V4 signed PUT URL for direct browser upload.
 *
 * `subfolder` MUST be in the configured allowlist — the browser can't talk
 * us into writing to a path we don't expect. `userId` and `filename` are
 * server-controlled in the sense that `userId` comes from the auth session
 * and `filename` is sanitised (path-traversal chars stripped, length capped).
 *
 * `storage` is an optional dependency-injection seam for tests. In production
 * it defaults to a freshly-constructed Storage client; tests pass a mock
 * that implements the `bucket(...).file(...).getSignedUrl(...)` chain.
 */
export async function signGcsUpload(opts: {
  userId: string;
  subfolder: string;
  filename: string;
  contentType: string;
  storage?: Storage;
}): Promise<GcsSignedUpload> {
  const cfg = getGcsConfig();

  if (!cfg.allowedSubfolders.includes(opts.subfolder)) {
    throw new Error(
      `subfolder '${opts.subfolder}' is not allowed. ` +
      `Whitelist: ${cfg.allowedSubfolders.join(', ')}`
    );
  }
  if (!cfg.allowedMimeTypes.includes(opts.contentType)) {
    throw new Error(
      `contentType '${opts.contentType}' is not allowed. ` +
      `Whitelist: ${cfg.allowedMimeTypes.join(', ')}`
    );
  }
  if (!/^[a-f0-9]{20,32}$/i.test(opts.userId)) {
    // Mongoose ObjectId.toString() — 24 hex chars. Anything else is suspect.
    throw new Error('userId must be a valid ObjectId.');
  }

  // Sanitise filename:
  //   1. Replace unsafe chars (incl. `/`) with underscore.
  //   2. Strip leading dots (no hidden files).
  //   3. Collapse `..` or longer dot-runs to a single dot — prevents the
  //      sanitised path from accidentally containing a `..` traversal
  //      sequence (e.g. `../../../etc/passwd.exe` → `_._._etc_passwd.exe`
  //      then collapsed to `_._.etc_passwd.exe` which has no `..`).
  //   4. Preserve the file extension (substring after the LAST dot).
  //   5. Cap at 80 chars; fallback to 'file' if the result is empty.
  const sanitised = opts.filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .replace(/\.{2,}/g, '.');
  const lastDot = sanitised.lastIndexOf('.');
  const base = lastDot >= 0 ? sanitised.slice(0, lastDot).replace(/\./g, '_') : sanitised.replace(/\./g, '_');
  const ext = lastDot >= 0 ? sanitised.slice(lastDot) : '';
  const safeName = (base + ext).slice(0, 80) || 'file';

  const uuid = randomUUID().replace(/-/g, '').slice(0, 12);
  const objectPath = `${opts.subfolder}/${opts.userId}/${uuid}-${safeName}`;

  const file = (opts.storage ?? getStorageClient()).bucket(cfg.bucket).file(objectPath);

  const expiresAt = Date.now() + cfg.signedUrlTtlSeconds * 1000;
  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: expiresAt,
    contentType: opts.contentType,
  });

  return {
    uploadUrl,
    publicUrl: `https://${cfg.publicHost}/${objectPath}`,
    gcsUri: `gs://${cfg.bucket}/${objectPath}`,
    objectPath,
    contentType: opts.contentType,
    expiresAt,
    ttlSeconds: cfg.signedUrlTtlSeconds,
  };
}

/**
 * Validate that a URL the browser gave us is actually one of our assets.
 * Same purpose as the old `isOurCloudinaryAsset()` — prevents a user from
 * saving a URL pointing at someone else's GCS bucket.
 *
 * Defends against:
 *   - Different bucket (host swapped)
 *   - Different protocol (http vs https)
 *   - Path traversal attempts (must be a clean path under our publicHost)
 */
export function isOurGcsAsset(publicUrl: string): boolean {
  const cfg = getGcsConfig();
  try {
    const u = new URL(publicUrl);
    if (u.host !== cfg.publicHost) return false;
    if (u.protocol !== 'https:') return false;
    // Object path must start with one of our allowed subfolders.
    const path = u.pathname.replace(/^\/+/, '');
    return cfg.allowedSubfolders.some((sf) => path === sf || path.startsWith(`${sf}/`));
  } catch {
    return false;
  }
}