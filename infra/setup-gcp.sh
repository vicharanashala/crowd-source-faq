# ─────────────────────────────────────────────────────────────────────────────
# GCP infrastructure setup for the Cloudinary → GCS migration.
#
# Run this AFTER you have:
#   1. Installed gcloud CLI: https://cloud.google.com/sdk/docs/install
#   2. Authenticated: gcloud auth login
#   3. Created or selected a GCP project: gcloud config set project <PROJECT_ID>
#   4. Enabled billing on that project
#
# Usage:
#   GCP_PROJECT_ID=my-project GCP_REGION=asia-south1 MEDIA_DOMAIN=media.mydomain.com \
#     bash infra/setup-gcp.sh
#
# The script is idempotent — re-runs are safe (will skip resources that
# already exist with the same configuration).
# ─────────────────────────────────────────────────────────────────────────────
#!/usr/bin/env bash
set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
PROJECT="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
REGION="${GCP_REGION:-asia-south1}"
BUCKET="${GCS_BUCKET:-yaksha-media}"
MEDIA_DOMAIN="${MEDIA_DOMAIN:-media.mydomain.com}"
SERVICE_NAME="img-transform"
AR_REPO="yaksha-images"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"

# Bucket CORS — allows the browser to PUT files directly to GCS.
CORS_FILE="$(mktemp)"
trap "rm -f $CORS_FILE" EXIT
cat > "$CORS_FILE" <<EOF
[{
  "origin": ["https://app.${MEDIA_DOMAIN#media.}", "http://localhost:5173", "http://localhost:6767"],
  "method": ["GET", "PUT", "POST", "HEAD"],
  "responseHeader": ["Content-Type", "Content-Length", "x-goog-resumable"],
  "maxAgeSeconds": 3600
}]
EOF

echo "── Configuration ──"
echo "PROJECT=$PROJECT"
echo "REGION=$REGION"
echo "BUCKET=$BUCKET"
echo "MEDIA_DOMAIN=$MEDIA_DOMAIN"
echo "SERVICE=$SERVICE_NAME"
echo "REPO=$AR_REPO"
echo "IMAGE_TAG=$IMAGE_TAG"
echo

# ── 1. Enable required GCP APIs ──────────────────────────────────────────────
echo "── 1/7 Enabling required APIs ──"
gcloud services enable \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    sqladmin.googleapis.com \
    compute.googleapis.com \
    cloudcdn.googleapis.com \
    --project="$PROJECT"

# ── 2. Create the GCS bucket ─────────────────────────────────────────────────
echo
echo "── 2/7 Creating GCS bucket gs://$BUCKET ──"
if gsutil ls -b "gs://$BUCKET" 2>/dev/null; then
    echo "  → bucket exists, skipping"
else
    gsutil mb -p "$PROJECT" -c STANDARD -l "$REGION" -b on "gs://$BUCKET"
    echo "  → created"
fi

# Set CORS so the browser can PUT directly
gsutil cors set "$CORS_FILE" "gs://$BUCKET"
echo "  → CORS set"

# Lifecycle: move cold assets to Nearline after 365 days
LIFECYCLE_FILE="$(mktemp)"
cat > "$LIFECYCLE_FILE" <<EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "SetStorageClass", "storageClass": "NEARLINE"},
        "condition": {"age": 365}
      }
    ]
  }
}
EOF
gsutil lifecycle set "$LIFECYCLE_FILE" "gs://$BUCKET"
echo "  → lifecycle rule set (NEARLINE after 365d)"
rm -f "$LIFECYCLE_FILE"

# ── 3. Create Artifact Registry repo for the Cloud Run image ─────────────────
echo
echo "── 3/7 Creating Artifact Registry repo ──"
REPO_FULL="${REGION}-docker.pkg.dev/${PROJECT}/${AR_REPO}"
if gcloud artifacts repositories describe "$AR_REPO" \
        --location="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
    echo "  → repo exists, skipping"
else
    gcloud artifacts repositories create "$AR_REPO" \
        --repository-format=docker \
        --location="$REGION" \
        --project="$PROJECT"
    echo "  → created"
fi

# ── 4. Build + push the img-transform container ──────────────────────────────
echo
echo "── 4/7 Building + pushing img-transform container ──"
cd "$(dirname "$0")/img-transform"
docker build -t "${REPO_FULL}/${SERVICE_NAME}:${IMAGE_TAG}" .
docker push "${REPO_FULL}/${SERVICE_NAME}:${IMAGE_TAG}"
cd - >/dev/null
echo "  → image: ${REPO_FULL}/${SERVICE_NAME}:${IMAGE_TAG}"

# ── 5. Deploy to Cloud Run ───────────────────────────────────────────────────
echo
echo "── 5/7 Deploying Cloud Run service $SERVICE_NAME ──"
SERVICE_URL=$(gcloud run deploy "$SERVICE_NAME" \
    --image="${REPO_FULL}/${SERVICE_NAME}:${IMAGE_TAG}" \
    --region="$REGION" \
    --project="$PROJECT" \
    --platform=managed \
    --allow-unauthenticated \
    --memory=512Mi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=10 \
    --timeout=30 \
    --concurrency=80 \
    --no-cpu-throttling \
    --set-env-vars="GCS_BUCKET=$BUCKET,NODE_ENV=production" \
    --service-account="${SERVICE_NAME}@${PROJECT}.iam.gserviceaccount.com" \
    --format='value(status.url)' 2>/dev/null || echo "")

if [ -z "$SERVICE_URL" ]; then
    # First deployment might not return URL in this format; fetch it.
    SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
        --region="$REGION" --project="$PROJECT" \
        --format='value(status.url)')
fi
echo "  → service URL: $SERVICE_URL"

# Grant the service account permission to read the bucket
echo
echo "── Granting bucket read permission to service account ──"
gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${SERVICE_NAME}@${PROJECT}.iam.gserviceaccount.com" \
    --role="roles/storage.objectViewer" \
    --condition=None 2>&1 | tail -1

# ── 6. Create the public load balancer + Cloud CDN ───────────────────────────
echo
echo "── 6/7 Creating HTTPS load balancer + Cloud CDN ──"

# Reserve a global static IP
echo "  → reserving static IP..."
if gcloud compute addresses describe yaksha-media-ip --global --project="$PROJECT" >/dev/null 2>&1; then
    echo "    IP exists, skipping"
else
    gcloud compute addresses create yaksha-media-ip \
        --ip-version=IPV4 --global --project="$PROJECT"
fi

# Backend bucket: points to the Cloud Run service, with CDN enabled
echo "  → creating backend bucket with CDN..."
if gcloud compute backend-buckets describe yaksha-media-bucket --project="$PROJECT" >/dev/null 2>&1; then
    echo "    backend bucket exists, skipping"
else
    gcloud compute backend-buckets create yaksha-media-bucket \
        --gcs-bucket-name="$BUCKET" \
        --enable-cdn \
        --cache-mode=CACHE_ALL_STATIC \
        --default-ttl=86400 \
        --max-ttl=31536000 \
        --client-ttl=31536000 \
        --negative-ttl=0 \
        --project="$PROJECT"
fi

# URL map: routes the media domain to the backend bucket
echo "  → creating URL map..."
if gcloud compute url-maps describe yaksha-media-lb --project="$PROJECT" >/dev/null 2>&1; then
    echo "    URL map exists, skipping"
else
    gcloud compute url-maps create yaksha-media-lb \
        --default-backend-bucket=yaksha-media-bucket \
        --project="$PROJECT"
fi

# HTTPS proxy + SSL cert (managed, for the media domain)
echo "  → creating managed SSL cert for $MEDIA_DOMAIN..."
if gcloud compute ssl-certificates describe yaksha-media-cert --global --project="$PROJECT" >/dev/null 2>&1; then
    echo "    SSL cert exists, skipping"
else
    gcloud compute ssl-certificates create yaksha-media-cert \
        --domains="$MEDIA_DOMAIN" \
        --global \
        --project="$PROJECT"
fi

echo "  → creating HTTPS proxy..."
if gcloud compute target-https-proxies describe yaksha-media-https-proxy --project="$PROJECT" >/dev/null 2>&1; then
    echo "    proxy exists, skipping"
else
    gcloud compute target-https-proxies create yaksha-media-https-proxy \
        --url-map=yaksha-media-lb \
        --ssl-certificates=yaksha-media-cert \
        --project="$PROJECT"
fi

echo "  → creating global forwarding rule..."
if gcloud compute forwarding-rules describe yaksha-media-fr --global --project="$PROJECT" >/dev/null 2>&1; then
    echo "    rule exists, skipping"
else
    gcloud compute forwarding-rules create yaksha-media-fr \
        --address=yaksha-media-ip \
        --global \
        --target-https-proxy=yaksha-media-https-proxy \
        --ports=443 \
        --project="$PROJECT"
fi

IP=$(gcloud compute addresses describe yaksha-media-ip --global --project="$PROJECT" --format='value(address)')
echo
echo "── 7/7 ──"
echo "✓ Load balancer IP: $IP"
echo
echo "NEXT STEPS:"
echo "  1. Point your DNS A record for $MEDIA_DOMAIN → $IP"
echo "  2. Wait for the SSL cert to provision (~15 min):"
echo "       gcloud compute ssl-certificates describe yaksha-media-cert --global"
echo "  3. Set the backend env vars on your main backend:"
echo "       GCS_BUCKET=$BUCKET"
echo "       GCS_PUBLIC_HOST=$MEDIA_DOMAIN"
echo "  4. (When ready) Run the Phase 3 migration:"
echo "       npx tsx apps/backend/scripts/migrate-cloudinary-to-gcs.ts --dry-run"
echo "       npx tsx apps/backend/scripts/migrate-cloudinary-to-gcs.ts"
echo "  5. Decommission Cloudinary (Phase 4): remove apps/backend/src/integrations/cloudinary/, etc."