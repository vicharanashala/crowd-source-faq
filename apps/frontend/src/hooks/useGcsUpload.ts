import { useState, useCallback, useRef } from 'react';
import api from '../utils/api';

/**
 * GCS upload result — matches the shape we save onto User.avatar and
 * CommunityPost.attachments. The backend stores `publicUrl` (the CDN URL
 * the UI renders) and `objectPath` (for future deletion / ops scripts).
 *
 * `gcsUri` is the `gs://...` form, useful for admin tooling that talks
 * directly to GCS (e.g. the migration script for Phase 3).
 */
export interface GcsAsset {
  url: string;            // https://media.mydomain.com/avatars/<userId>/<uuid>-filename.jpg
  publicUrl: string;      // alias for url — kept for readability next to CloudinaryAsset's secureUrl
  gcsUri: string;          // gs://yaksha-media/avatars/<userId>/<uuid>-filename.jpg
  objectPath: string;     // avatars/<userId>/<uuid>-filename.jpg
  /** Legacy Cloudinary publicId — present on attachments uploaded before the GCS migration. */
  publicId?: string;
  contentType: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
}

export interface GcsSignResponse {
  uploadUrl: string;
  publicUrl: string;
  gcsUri: string;
  objectPath: string;
  contentType: string;
  expiresAt: number;
  ttlSeconds: number;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * useGcsUpload — direct browser → GCS upload via V4-signed PUT URL.
 *
 * Flow:
 *   1. Ask the backend for a signed PUT URL via GET /csfaq/api/upload/sign
 *      with subfolder + contentType + filename.
 *   2. PUT the file DIRECTLY to the GCS-signed URL with the matching
 *      Content-Type header. The file bytes never traverse our backend.
 *   3. Return the asset metadata so the caller can save it on a model.
 *
 * `subfolder` is the logical bucket:
 *   - 'avatar' — for profile pictures
 *   - 'posts'  — for community post attachments
 */
export function useGcsUpload(subfolder: 'avatar' | 'posts' = 'posts') {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks the latest in-flight request so a quick re-click can't submit
  // a stale file against a new signed URL.
  const inFlight = useRef(0);

  const upload = useCallback(async (file: File): Promise<GcsAsset> => {
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
      // 1. Get a signed PUT URL from the backend.
      const params = new URLSearchParams({
        subfolder,
        contentType: file.type,
        filename: file.name,
      });
      const { data: sign } = await api.get<GcsSignResponse>(
        `/upload/sign?${params.toString()}`
      );

      // 2. PUT the file directly to GCS. The Content-Type MUST match the
      //    one in the signed URL or GCS rejects with a signature mismatch.
      const putRes = await fetch(sign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': sign.contentType },
        body: file,
      });
      if (!putRes.ok) {
        const text = await putRes.text().catch(() => '');
        throw new Error(`GCS upload failed (${putRes.status}): ${text.slice(0, 200)}`);
      }

      // 3. Guard against a newer request having started mid-upload.
      if (token !== inFlight.current) {
        throw new Error('A newer upload is in progress.');
      }

      return {
        url: sign.publicUrl,
        publicUrl: sign.publicUrl,
        gcsUri: sign.gcsUri,
        objectPath: sign.objectPath,
        contentType: sign.contentType,
      };
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      throw e;
    } finally {
      if (token === inFlight.current) {
        setUploading(false);
      }
    }
  }, [subfolder]);

  return { upload, uploading, error };
}