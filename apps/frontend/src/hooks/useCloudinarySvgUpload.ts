/**
 * useCloudinarySvgUpload — signed upload flow for SVG flowcharts.
 *
 * v1.70 — Welcome Package Cloudinary migration: SVG flowcharts are
 * uploaded directly to Cloudinary by the browser using a server-signed
 * payload. The resulting secure_url + public_id are sent to the
 * backend as JSON body fields (not multipart).
 *
 * Flow:
 *   1. Call upload(file) → requests a signature from
 *      GET /csfaq/api/upload/sign/cloudinary/svg
 *   2. Browser POSTs the SVG to Cloudinary using the signature
 *   3. Returns { url, publicId } — these are sent to the backend
 *      as { url, publicId } in the resource creation payload.
 */

import { useState, useCallback, useRef } from 'react';
import api from '../utils/api';

export interface CloudinarySvgAsset {
  url: string; // Cloudinary secure_url
  publicId: string; // Cloudinary public_id
}

interface CloudinarySvgSignResponse {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  uploadUrl: string;
}

const ALLOWED_MIME = 'image/svg+xml';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB — SVG flowcharts can be large

export function useCloudinarySvgUpload() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(0);

  const upload = useCallback(async (file: File): Promise<CloudinarySvgAsset> => {
    if (file.type !== ALLOWED_MIME) {
      throw new Error('Only SVG files are allowed.');
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`SVG too large (max ${Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)}MB).`);
    }

    const token = ++inFlight.current;
    setUploading(true);
    setError(null);

    try {
      // 1. Get signed upload params from our backend.
      const { data: sign } = await api.get<CloudinarySvgSignResponse>(
        '/upload/sign/cloudinary/svg'
      );

      // 2. POST the SVG directly to Cloudinary.
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
      // TypeError: Failed to fetch — almost always a CSP block, mixed-content
      // (http page → https upload), network partition, or DNS failure. The
      // most common case in this codebase is CSP `connect-src` not allowing
      // api.cloudinary.com; the fix lives in
      // apps/backend/src/bootstrap/middleware.ts (helmet CSP directives).
      const cloud = (await cloudRes.json()) as {
        secure_url: string;
        public_id: string;
      };

      if (token !== inFlight.current) {
        throw new Error('A newer upload is in progress.');
      }

      return {
        url: cloud.secure_url,
        publicId: cloud.public_id,
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
  }, []);

  return { upload, uploading, error };
}
