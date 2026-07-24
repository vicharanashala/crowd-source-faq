/**
 * Cloudinary server-signed upload helper.
 *
 * The browser POSTs to Cloudinary directly using a signature we generate here.
 * The API secret never leaves the server. Flow:
 *
 *   1. Browser calls GET /api/upload/sign
 *   2. We return { cloudName, apiKey, timestamp, signature, folder, ... }
 *   3. Browser POSTs the file to https://api.cloudinary.com/v1_1/<cloud>/<resource>/upload
 *      with these fields + `file` (data URI or blob).
 *   4. Cloudinary returns { secure_url, public_id, width, height, ... }.
 *   5. Browser POSTs that metadata to the relevant model endpoint
 *      (e.g. /api/auth/profile for avatar, /api/community for post attachments).
 *
 * Signature: SHA1 of (sorted-key=value pairs joined by '&') + API secret.
 * Per Cloudinary docs: https://cloudinary.com/documentation/upload_images#generating_authentication_signatures
 */

import crypto from 'crypto';

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
}

export interface SignedUploadParams {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

/**
 * Read Cloudinary config from env. Throws on startup if creds are missing —
 * we don't want a partial deploy where uploads silently fail.
 */
export function getCloudinaryConfig(): CloudinaryConfig {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const folder = process.env.CLOUDINARY_FOLDER ?? 'yaksha';

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, ' +
      'and CLOUDINARY_API_SECRET in backend/.env. The /api/upload/sign endpoint will not ' +
      'work without these.'
    );
  }
  return { cloudName, apiKey, apiSecret, folder };
}

/**
 * Build a signature + the params the browser needs to upload.
 *
 * Per Cloudinary: only params you want to lock down (like `folder`) are
 * included in the signature. `timestamp` is always signed.
 *
 * The browser may add `tags`, `public_id`, etc. — those are NOT signed here
 * so the user can include them in their form post.
 */
export function signUploadParams(
  cfg: CloudinaryConfig,
  extra: Record<string, string | number> = {}
): SignedUploadParams {
  // Only `folder` and `timestamp` are locked server-side; everything else
  // (tags, public_id, etc.) is the browser's choice.
  const params: Record<string, string | number> = {
    folder: cfg.folder,
    timestamp: Math.floor(Date.now() / 1000),
    ...extra,
  };
  // If `extra` overrode timestamp, surface it for the caller so the
  // browser's POST uses the same value we signed.
  const timestamp = params.timestamp as number;

  // Build the signature: alphabetically-sorted `key=value` joined with `&`,
  // then SHA1 of the result with the API secret appended.
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  const signature = crypto.createHash('sha1').update(toSign + cfg.apiSecret).digest('hex');

  return {
    cloudName: cfg.cloudName,
    apiKey: cfg.apiKey,
    timestamp,
    signature,
    folder: params.folder as string,
  };
}

/**
 * Convenience: validate a Cloudinary public_id looks like one of ours.
 * Prevents the browser from tricking the backend into saving a URL to
 * someone else's Cloudinary account.
 */
export function isOurCloudinaryAsset(secureUrl: string, cloudName: string): boolean {
  // Cloudinary secure URLs look like: https://res.cloudinary.com/<cloud>/<resource>/upload/...
  try {
    const url = new URL(secureUrl);
    const [urlCloudName] = url.pathname.replace(/^\/+/, '').split('/');
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' && urlCloudName === cloudName;
  } catch {
    return false;
  }
}

/**
 * Upload a base64 signature image directly to Cloudinary.
 */
export async function uploadSignatureToCloudinary(
  ownerId: string,
  sigId: string,
  dataUrl: string,
): Promise<{ secure_url: string; public_id: string }> {
  const cfg = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${cfg.folder}/tee-signatures/${ownerId}`;
  const publicId = sigId;

  // Parameters to sign (alphabetical order)
  const params: Record<string, string | number> = {
    folder,
    public_id: publicId,
    timestamp,
  };

  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  const signature = crypto.createHash('sha1').update(toSign + cfg.apiSecret).digest('hex');

  const body = new URLSearchParams();
  body.append('file', dataUrl);
  body.append('folder', folder);
  body.append('public_id', publicId);
  body.append('timestamp', String(timestamp));
  body.append('api_key', cfg.apiKey);
  body.append('signature', signature);

  const url = `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`;
  const response = await fetch(url, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Cloudinary upload failed: ${response.status} - ${errText}`);
  }

  const data = (await response.json()) as { secure_url: string; public_id: string };
  return {
    secure_url: data.secure_url,
    public_id: data.public_id,
  };
}
