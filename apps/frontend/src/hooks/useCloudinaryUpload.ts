import { useState, useCallback, useRef } from 'react';
import api from '../utils/api';

/**
 * Cloudinary upload result — matches the shape we save onto User.avatar
 * and CommunityPost.attachments. The full Cloudinary response is also
 * returned in case callers need extra fields (eager transforms, etc.).
 */
export interface CloudinaryAsset {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  secureUrl: string;
}

export interface CloudinarySignResponse {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  uploadUrl: string;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * useCloudinaryUpload — handles the full signed-upload flow.
 *
 * 1. Ask the backend for a signature via GET /api/upload/sign
 * 2. POST the file to Cloudinary directly with FormData
 * 3. Return the asset metadata so the caller can save it on a model
 *
 * `subfolder` is the logical bucket under the user's space:
 * - 'avatar'   — for profile pictures
 * - 'posts'    — for community post attachments
 */
export function useCloudinaryUpload(subfolder: 'avatar' | 'posts' = 'posts') {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks the latest in-flight request so a quick re-click can't submit
  // a stale file against a new signature.
  const inFlight = useRef(0);

  const upload = useCallback(async (file: File): Promise<CloudinaryAsset> => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      throw new Error('Only JPEG, PNG, WebP, and GIF images are allowed.');
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`Image too large (max ${Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)}MB).`);
    }

    const token = ++inFlight.current;
    setUploading(true);
    setError(null);
    try {
      // 1. Get a signed payload from the backend.
      const { data: sign } = await api.get<CloudinarySignResponse>(
        `/upload/sign?subfolder=${encodeURIComponent(subfolder)}`
      );

      // 2. Build FormData and POST to Cloudinary. The browser uploads
      //    directly to Cloudinary — the file never traverses our backend.
      //    Note: we do NOT send `public_id` here. Anything in the form
      //    post that wasn't in the signed string breaks signature
      //    validation. Cloudinary auto-assigns a public_id and returns
      //    it — we save that to the model.
      const form = new FormData();
      form.append('file', file);
      form.append('api_key', sign.apiKey);
      form.append('timestamp', String(sign.timestamp));
      form.append('signature', sign.signature);
      form.append('folder', sign.folder);

      const cloudRes = await fetch(sign.uploadUrl, { method: 'POST', body: form });
      if (!cloudRes.ok) {
        const text = await cloudRes.text().catch(() => '');
        throw new Error(`Cloudinary upload failed (${cloudRes.status}): ${text.slice(0, 200)}`);
      }
      const cloud = (await cloudRes.json()) as {
        secure_url: string;
        public_id: string;
        width?: number;
        height?: number;
        format?: string;
        bytes?: number;
      };

      // Guard against the in-flight counter advancing (user uploaded again).
      if (token !== inFlight.current) {
        throw new Error('A newer upload is in progress.');
      }

      return {
        url: cloud.secure_url,
        publicId: cloud.public_id,
        width: cloud.width,
        height: cloud.height,
        format: cloud.format,
        bytes: cloud.bytes,
        secureUrl: cloud.secure_url,
      };
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      throw e;
    } finally {
      // Only clear the spinner if we're still the latest request.
      if (token === inFlight.current) {
        setUploading(false);
      }
    }
  }, [subfolder]);

  return { upload, uploading, error };
}

/**
 * buildTransformedUrl — append Cloudinary transformation flags to a stored
 * asset URL. Use this for thumbnails / responsive sizes so we don't
 * download the full original for every card.
 *
 * Example:
 *   buildTransformedUrl(avatar.url, 'w_200,h_200,c_fill,g_auto,q_auto,f_auto')
 * → https://res.cloudinary.com/<cloud>/image/upload/w_200,h_200,c_fill,.../v123/foo.jpg
 */
export function buildTransformedUrl(secureUrl: string, transform: string): string {
  // Cloudinary URLs look like:
  //   https://res.cloudinary.com/<cloud>/<resource>/upload/<version>/<path>
  // We need to inject the transform between `/upload/` and the next path.
  // The simplest correct splice: split on `/upload/` and append.
  const marker = '/upload/';
  const idx = secureUrl.indexOf(marker);
  if (idx === -1) return secureUrl;
  return `${secureUrl.slice(0, idx + marker.length)}${transform}/${secureUrl.slice(idx + marker.length)}`;
}
