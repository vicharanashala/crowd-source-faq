import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import { getGcsConfig, signGcsUpload, isOurGcsAsset } from '../../integrations/gcs/gcs.js';
import { getCloudinaryConfig, signUploadParams } from '../../integrations/cloudinary/cloudinary.js';

const router = Router();

/**
 * GET /csfaq/api/upload/sign/cloudinary/svg
 *
 * Returns a Cloudinary signed upload payload for SVG flowcharts.
 * The browser uploads the SVG DIRECTLY to Cloudinary using these
 * signed params — file bytes never traverse our backend.
 *
 * After upload, the browser POSTs the returned metadata to
 * POST /admin/welcome/resources with kind=svg and the Cloudinary
 * secure_url + public_id.
 *
 * Params:
 *   - subfolder: defaults to 'onboarding-svgs'; Cloudinary folder under
 *     which the asset will be stored (CLOUDINARY_FOLDER env var scopes
 *     the top level).
 */
router.get('/sign/cloudinary/svg', protect, (req, res) => {
  try {
    const cfg = getCloudinaryConfig();
    const subfolder = String(req.query.subfolder ?? 'onboarding-svgs');
    const params = signUploadParams(cfg, { folder: `${cfg.folder}/${subfolder}` });
    res.json({
      cloudName: params.cloudName,
      apiKey: params.apiKey,
      timestamp: params.timestamp,
      signature: params.signature,
      folder: params.folder,
      // The browser POSTs to this URL.
      uploadUrl: `https://api.cloudinary.com/v1_1/${params.cloudName}/auto/upload`,
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('Cloudinary is not configured')) {
      res.status(503).json({ message: msg });
      return;
    }
    res.status(500).json({ message: 'Failed to sign upload params.' });
  }
});

/**
 * GET /csfaq/api/upload/sign
 *
 * Returns a V4-signed GCS PUT URL. The browser uploads the file DIRECTLY
 * to GCS using that URL — the file bytes never traverse our backend. The
 * server controls the object path (userId + subfolder) so the browser
 * can't write into a sibling user's space or to a different prefix.
 *
 * The signed URL has:
 *   - 15-minute TTL (configurable via gcs.signedUrlTtlSeconds)
 *   - Content-Type locked into the signature so a browser can't swap a
 *     PNG for a JS payload
 *   - action: 'write' — read-only access is not granted by this URL
 *
 * After upload, the browser sends the resulting `publicUrl` + `gcsUri` to
 * the relevant model endpoint (e.g. /csfaq/api/auth/profile for avatar,
 * /csfaq/api/community for post attachments).
 */
router.get('/sign', protect, async (req, res) => {
  try {
    const cfg = getGcsConfig();
    const subfolder = String(req.query.subfolder ?? '');
    if (!subfolder) {
      res.status(400).json({ message: 'subfolder query param is required.' });
      return;
    }
    if (!cfg.allowedSubfolders.includes(subfolder)) {
      res.status(400).json({
        message: `subfolder '${subfolder}' is not allowed.`,
        allowed: cfg.allowedSubfolders,
      });
      return;
    }
    // Content-Type from query so the URL is signed with the right MIME.
    // The browser PUTs the file with the same Content-Type.
    const contentType = String(req.query.contentType ?? '');
    if (!cfg.allowedMimeTypes.includes(contentType)) {
      res.status(400).json({
        message: `contentType '${contentType}' is not allowed.`,
        allowed: cfg.allowedMimeTypes,
      });
      return;
    }
    const userId = (req.user as { _id: { toString: () => string } })._id.toString();

    // Generate a suggested filename so the bucket layout is consistent.
    // The browser may override by passing ?filename= but we still sanitise.
    const filename = String(req.query.filename ?? 'image');
    const signed = await signGcsUpload({ userId, subfolder, filename, contentType });

    res.json(signed);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('GCS_BUCKET') || msg.includes('GCS_PUBLIC_HOST')) {
      // Misconfiguration — surface clearly so the operator can fix it.
      res.status(503).json({ message: msg });
      return;
    }
    res.status(500).json({ message: 'Failed to sign upload params.' });
  }
});

/**
 * GET /csfaq/api/upload/config
 *
 * Public — returns the upload limits so the client can validate before
 * requesting a signed URL. No secrets, no auth needed.
 */
router.get('/config', (_req, res) => {
  try {
    const cfg = getGcsConfig();
    res.json({
      publicHost: cfg.publicHost,
      bucket: cfg.bucket,
      allowedMimeTypes: cfg.allowedMimeTypes,
      maxFileSizeMb: cfg.maxFileSizeMb,
      signedUrlTtlSeconds: cfg.signedUrlTtlSeconds,
      allowedSubfolders: cfg.allowedSubfolders,
    });
  } catch (err) {
    res.status(503).json({ message: (err as Error).message });
  }
});

/**
 * Lightweight validator: returns true if a given publicUrl points at our
 * GCS bucket via the CDN host. Use this server-side before saving a URL
 * onto a model — prevents the browser from slipping in a URL to a
 * different bucket.
 */
export function assertOurGcsUrl(publicUrl: string): void {
  if (!isOurGcsAsset(publicUrl)) {
    throw new Error('URL is not a valid GCS asset for this deployment.');
  }
}

export default router;