# Cloudinary → GCP Cloud Storage + Cloud Run Migration

> **Status (v1.71):** Phase 1+2 shipped (new uploads go to GCS; old Cloudinary URLs still render via pass-through). Phases 0/3/4 below are not yet executed.

This document is the single source of truth for migrating image storage from Cloudinary to Google Cloud Storage. It covers architecture, phases, operations, and decommissioning.

---

## Why

- **Cost.** Cloudinary paid plans start at ~$89/month for ~50GB. GCP Storage + Cloud Run + Cloud CDN typically lands 30–50% cheaper at our scale and grows linearly with usage rather than plan-tier jumps.
- **Stack consolidation.** We're already on GCP (MongoDB Atlas runs there per memory). Image storage in the same cloud removes a vendor and a contract.
- **Custom transform pipeline.** The img-transform Cloud Run service gives us full control over the transform logic, format negotiation, and caching strategy. No more "Cloudinary does magic we can't audit".

## Architecture

```
                    ┌───────────────────────────────────────────────┐
                    │ GCP                                          │
                    │                                               │
Browser ──►  POST  │  GCS bucket (gs://yaksha-media)             │
   │              │    - avatars/<userId>/<uuid>-filename.ext    │
   │              │    - posts/<userId>/<uuid>-filename.ext      │
   │              │                                               │
   │              │  Cloud CDN ──► Cloud Run img-transform       │
   │              │     │           - Express + Sharp             │
   │              │     │           - on-demand transforms       │
   │              │     │           - Vary: Accept                │
   │              │     │                                       │
   │              │     ▼                                       │
   │              │   GCS (cache miss path)                      │
                    └───────────────────────────────────────────────┘
   │
   │
   ▼
  GET  https://media.mydomain.com/<path>?w=200&h=200&fit=cover&fm=auto
```

**Browser uploads**: The frontend `useGcsUpload` hook asks the backend for a V4-signed PUT URL (`GET /csfaq/api/upload/sign?subfolder=avatar&contentType=image/jpeg&filename=...`). The browser then `PUT`s the file bytes directly to GCS using that URL — bytes never traverse our backend.

**Browser reads**: `https://media.mydomain.com/avatars/<userId>/<uuid>-filename.jpg?w=64&h=64&fit=cover&fm=auto` is served by Cloud CDN. Cache miss → Cloud Run img-transform → downloads the original from GCS, applies Sharp transforms, returns the result with `Vary: Accept` so the CDN caches webp/avif/jpeg variants separately.

---

## Configuration

These env vars are read by the backend (`getGcsConfig()`) and the Cloud Run img-transform service:

| Var | Required | Default | Description |
|---|---|---|---|
| `GCS_BUCKET` | Yes | — | Name of the GCS bucket. e.g. `yaksha-media` |
| `GCS_PUBLIC_HOST` | Yes | `media.mydomain.com` | CDN hostname (without protocol). Used to build public URLs the frontend renders. |
| `GCS_ALLOWED_SUBFOLDERS` | No | `avatar,posts` | Comma-separated subfolders the browser may request signed uploads for. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Dev only | — | Path to service-account JSON. Not needed in production on Cloud Run (uses instance metadata). |

**Legacy Cloudinary vars** (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER`) remain in `.env.example` until all DB rows are migrated. The `/csfaq/api/upload/sign` endpoint no longer reads them; old DB rows still point at Cloudinary URLs until the Phase 3 migration script moves them.

---

## Phases

### Phase 0 — Stand up GCP infrastructure (NOT YET DONE)

The setup script automates the entire flow:

```bash
GCP_PROJECT_ID=my-project \
GCP_REGION=asia-south1 \
MEDIA_DOMAIN=media.mydomain.com \
bash infra/setup-gcp.sh
```

What it does:

1. Enables required GCP APIs (Artifact Registry, Cloud Build, Cloud Run, Compute, Cloud CDN)
2. Creates the `gs://yaksha-media` bucket with CORS for browser PUT
3. Sets a lifecycle rule (NEARLINE after 365 days) to control cold storage costs
4. Creates the Artifact Registry repo `yaksha-images`
5. Builds + pushes the `img-transform` Docker image
6. Deploys the Cloud Run service with appropriate memory/CPU/concurrency settings
7. Creates the HTTPS load balancer (serverless NEG → backend bucket) with Cloud CDN enabled
8. Reserves a global static IP

After the script completes, point your DNS A record for `media.mydomain.com` at the reserved IP. SSL cert provisions automatically (~15 min).

**Why `asia-south1`?** User is in India. `asia-south1` (Mumbai) is the closest GCP region.

### Phase 1+2 — Backend + frontend (SHIPPED)

- New: `apps/backend/src/integrations/gcs/gcs.ts` — V4-signed URL helper, validator, `getGcsConfig()`
- Modified: `apps/backend/src/modules/upload/upload.routes.ts` — `/csfaq/api/upload/sign` now returns a GCS signed URL with locked content-type
- Modified: `apps/backend/src/modules/auth/{user.model,auth.controller}.ts` — avatar schema gains `gcsUri`/`objectPath`; validation branches on URL host
- Modified: `apps/backend/src/modules/community/{community-post.model,post-mutations.controller}.ts` — same for attachments
- Modified: `apps/backend/src/config/{schema,envValidator}.ts` — Cloudinary hard check → GCS soft warn (production-only hard error)
- Modified: `apps/backend/.env.example` — added `GCS_*` vars
- Modified: `apps/backend/package.json` — `@google-cloud/storage@^7.21.0` added
- New: `apps/frontend/src/hooks/useGcsUpload.ts` — V4-signed PUT upload hook
- New: `apps/frontend/src/utils/gcsTransform.ts` — Cloudinary-compatible transform string parser → query-param URL builder; passes through old `res.cloudinary.com/...` URLs
- Modified: 6 frontend files (`ProfileCard`, `CreatePostDialog`, `CommunityPostCard`, `ThreadDetail`, `PostDetailDialog`, `Navbar`) — swap `useCloudinaryUpload` → `useGcsUpload`, `buildTransformedUrl` → `buildGcsTransformedUrl`

**Verification:**
```
backend tests      38/38 passed   (existing Cloudinary tests + new GCS tests)
backend typecheck  0 errors
frontend typecheck 0 errors
```

### Phase 3 — Migrate existing DB rows (READY TO RUN, NOT YET EXECUTED)

The migration script at `apps/backend/scripts/migrate-cloudinary-to-gcs.ts`:

1. Scans `User.avatar` rows where `publicId` exists but `gcsUri` doesn't
2. Scans `CommunityPost.attachments[]` entries with the same shape
3. For each, downloads from Cloudinary, uploads to GCS, updates the DB row

**Always run `--dry-run` first:**
```bash
cd apps/backend
npx tsx scripts/migrate-cloudinary-to-gcs.ts --dry-run
npx tsx scripts/migrate-cloudinary-to-gcs.ts             # actual run
npx tsx scripts/migrate-cloudinary-to-gcs.ts --batch=50   # custom batch
```

Re-runs are safe: only migrates rows where `gcsUri` is missing. Already-migrated assets are skipped.

**Order matters:** run Phase 0 first (so GCS bucket exists and CDN serves `media.mydomain.com`), THEN run the migration script. Otherwise newly-migrated rows will point at URLs that don't resolve.

### Phase 4 — Decommission Cloudinary (LATER)

Once Phase 3 reports 0 errors and you've spot-checked that old URLs still render:

1. Delete `apps/backend/src/integrations/cloudinary/`
2. Delete `apps/frontend/src/hooks/useCloudinaryUpload.ts`
3. Remove `CLOUDINARY_*` vars from `.env.example`
4. Remove the Cloudinary branch from `auth.controller.ts` and `post-mutations.controller.ts`
5. Drop the `cloudinary` field from the GCS config schema
6. Update `envValidator.ts` — make GCS a hard error in production (no more soft-warn)
7. Remove the `publicId` field from `User.avatar` and `CommunityPost.attachments[]` schemas (after a 30-day soak to confirm no stragglers)
8. Cancel the Cloudinary subscription

---

## img-transform Cloud Run service

Source: `infra/img-transform/`. Standalone service, deployed independently of the main backend.

### Query params

All params are optional. Default behavior: serve the original untouched.

| Param | Type | Maps to Sharp |
|---|---|---|
| `w` | number | `width` |
| `h` | number | `height` |
| `fit` | `cover \| inside \| contain \| fill \| outside` | `fit` |
| `gravity` | `attention \| center \| north \| south \| east \| west \| entropy` | `position` |
| `q` | `auto` or 1..100 | quality |
| `fm` | `auto \| webp \| avif \| jpeg \| png` | output format |
| `dpr` | number | (not yet applied) |
| `blur` | 0..2000 | `blur` |
| `rotate` | 0 \| 90 \| 180 \| 270 | `rotate` |

### Caching

- `Cache-Control: public, max-age=31536000, immutable` (1 year)
- `Vary: Accept` — so CDN caches webp/avif/jpeg variants separately per browser

### URL format compatibility

The query-param shape matches the most common Cloudinary transform parameters. Example: `?w_200,h_200,c_fill,q_auto,f_auto` is what `buildGcsTransformedUrl` translates to `?w=200&h=200&fit=cover&q=auto&fm=auto`. Both forms work because `buildGcsTransformedUrl` accepts the Cloudinary-style string and emits query params.

---

## Verification checklist (before Phase 4)

```
[ ] Phase 0 setup script completed; DNS A record points at the LB IP
[ ] SSL cert for media.mydomain.com is active (gcloud compute ssl-certificates describe)
[ ] Phase 3 migration script reports 0 errors and 0 rows in the "not Cloudinary, skipping" bucket
[ ] Spot-check: visit /csfaq/ in a browser, confirm avatars + post thumbnails render
[ ] Confirm f_auto: same URL, different Accept headers return different formats
[ ] Confirm CDN caching: same URL with same Accept returns X-Cache: HIT after first request
[ ] Confirm direct GCS upload works: upload a test image via the UI
[ ] Confirm old Cloudinary URLs in DB still render (legacy pass-through)
[ ] Cancel Cloudinary subscription (after 30-day soak post-migration)
```

---

## Cost expectations

| Component | Pricing (per GB / per op) | Expected monthly (1k users, 50GB total) |
|---|---|---|
| GCS Standard | $0.020/GB/month + $0.05/GB egress (US) or $0.04 (Asia) | ~$3 storage + ~$2 egress = $5 |
| Cloud Run | $0.00002400/vCPU-sec + $0.0000025/GiB-sec | ~$2 (with min-instances=0, mostly cold) |
| Cloud CDN | $0.08/GB cache egress after 1TB free | $0 (under free tier) |
| **Total** | | **~$7/month** |

vs Cloudinary Plus plan: ~$89/month. ~92% cheaper at this scale.

---

## Rollback

If Phase 3 causes widespread breakage:

1. The frontend `buildGcsTransformedUrl` still passes through `res.cloudinary.com/...` URLs
2. As long as the migration script is idempotent (it is — `gcsUri exists` check), you can re-run `npx tsx scripts/migrate-cloudinary-to-gcs.ts` to retry failed rows
3. To roll back fully, write a reverse script that swaps `gcsUri` ↔ `publicId` per row (not yet written; only do if needed)

---

## Out of scope

- **Video uploads** — Cloud Run + transcoder is a separate workstream if needed.
- **PDF/document storage** — currently uploaded directly via `/csfaq/api/upload`. Migration to GCS would mirror this image path but is not started.
- **Image moderation on bytes** — `moderationEngine` runs on text only. NSFW/safe-search detection on uploaded image bytes would use Cloud Vision API. Not started.
- **Signed-URL read access** — bucket is currently public-read via Cloud CDN. If you ever need private assets, swap to V4-signed read URLs with expiration.

---

## References

- Cloud Storage CORS: https://cloud.google.com/storage/docs/configuring-cors
- V4 signed URLs: https://cloud.google.com/storage/docs/access-control/signed-urls
- Cloud CDN with GCS: https://cloud.google.com/cdn/docs/setting-up-cdn-with-bucket
- Sharp docs: https://sharp.pixelplumbing.com/
- Image format negotiation: https://developer.mozilla.org/en-US/docs/Web/HTTP/Content_negotiation/List_of_default_Accept_values