# Backup & Recovery Plan — Yaksha FAQ Portal

> This document defines the backup strategy, scope, schedule, retention, and recovery procedures for the Yaksha FAQ Portal.
> Owned by: DevOps / Backend team
> Reviewed: On every infrastructure change

---

## 1. Backup Scope

The system uses **MongoDB Atlas** (managed database service) as its primary data store. Backup responsibilities are shared between the MongoDB Atlas managed backup service and application-level operational practices.

### What is backed up

| Data | Storage | Tool | Frequency | Retention |
|------|---------|------|-----------|-----------|
| Full MongoDB database | Atlas cluster (cluster0) | Atlas Backup (continuous) | Continuous (incremental) + weekly snapshot | 30 days (M0/M2) / configurable on M10+ |
| Redis cache (Upstash) | Upstash managed | Upstash automatic | Continuous | 7 days (free tier) |
| Environment secrets | `.env.local` / secrets manager | Manual | On change | Current + previous |
| Search log analytics | Atlas Backup | Same as DB | Weekly aggregate | 90 days |
| Application code | Git repository | GitHub | On every merge to main | Indefinite (git history) |

### What is NOT backed up (by design)

- **Search log buffer** (in-memory): Lost on restart. This is acceptable — logs are flushed to MongoDB every 5 seconds and the weekly retention script handles older records.
- **Job queue**: In-memory. Lost on restart. Idempotent jobs are safe to re-run after a restart.
- **LLM embedding model cache**: Re-downloaded from HuggingFace on server restart (Transformer.js pipeline).
- **Rate limiter state**: In-memory per-instance. Lost on restart. Acceptable — rate limits reset but no data loss.

---

## 2. Backup Schedule & Tooling

### MongoDB Atlas

All Atlas clusters (M2 and above) include **continuous backups** by default. The backup policy for the current `cluster0.z3cgb58` (M2 shared tier):

- **Incremental backups**: Every hour (M0/M2) or continuously (M10+)
- **Weekly snapshots**: Every Sunday at 03:00 UTC
- **Point-in-time recovery (PITR)**: Available on M10+ clusters. For M2, the latest weekly snapshot is the closest recovery point.
- **Retention**: 30 days (M0/M2), 60 days (M5), configurable on M10+

To view the current backup status:
```
Atlas UI → cluster0 → Backup tab
```

To configure backup retention (Atlas Pro/Tier M10+):
```
Atlas UI → cluster0 → Backup → Edit Backup Policy
```

### Upstash Redis

- **Automatic**: Upstash manages backup internally
- **RPO estimate**: Up to 1 hour (backed up every hour on free tier)
- **Persistence**: Data is also persisted via Redis RDB snapshots
- **Max data size**: Free tier cap at 10,000 commands/day and 1GB

### Application secrets (`.env.local`)

Secrets are **not** in the git repository. They must be backed up manually:

```bash
# After any change to .env.local, store a secure copy:
cp backend/.env.local ~/backup/yaksha-env-local-$(date +%Y%m%d).bak
```

Store this alongside DB credentials in a password manager or secrets manager (e.g., 1Password, AWS Secrets Manager).

---

## 3. Restore Procedure

### 3.1 MongoDB Restore (Atlas)

**Using Atlas UI (recommended — point-in-time or snapshot):**

1. Log in to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Navigate to **Clusters → cluster0 → Backup**
3. Choose one:
   - **Restore from snapshot**: Select a weekly snapshot, restore to a new cluster, then migrate
   - **Point-in-time**: Select a timestamp (M10+ only) — recommended for minimal data loss
4. Create a new temporary cluster for the restore
5. Once restored, update `MONGODB_URI` in `.env.local` to point to the new cluster
6. Restart the application

**Using `mongodump` (manual export before restore):**

```bash
# Pre-restore snapshot
mongodump --uri="mongodb+srv://<user>:<password>@cluster0.z3cgb58.mongodb.net/yaksha_faq" \
  --out=/tmp/yaksha-backup-$(date +%Y%m%d)

# Verify dump
ls /tmp/yaksha-backup-*/
```

### 3.2 Upstash Redis Restore

If Redis data is critical (e.g., search cache needs warming):

1. Log in to [console.upstash.com](https://console.upstash.com)
2. Navigate to the Redis database
3. Use the **Restore** function with a backup file from Upstash console
4. Restart the application to re-populate cache

> Note: Search cache is rebuildable from MongoDB data. Redis loss is acceptable — cache will be populated organically as users search.

---

## 4. Verification

Backup verification should be performed **monthly** and after any infrastructure change.

```bash
# 1. Restore to a temporary cluster (Atlas Pro/Tier M10+)
# Use Atlas UI → Restore → Create temporary cluster

# 2. Verify key collections
mongosh "mongodb+srv://<temp-uri>"
  use yaksha_faq
  db.yaksha_faq_users.countDocuments()  # should match production count
  db.yaksha_faq_faqs.countDocuments()
  db.yaksha_faq_communityposts.countDocuments()

# 3. Smoke test the application against the temp cluster
MONGODB_URI="<temp-uri>" npx tsx backend/server.ts

# 4. Verify search works
curl -X POST http://localhost:6767/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"internship"}'

# 5. Drop temp cluster after verification
```

---

## 5. Failure Runbook

### Scenario: Accidental data deletion

1. **Stop the application** to prevent further writes
2. Identify the time of deletion (check admin logs, Sentry)
3. If using M10+: use **Point-in-Time Recovery** to restore to 5 minutes before the deletion
4. If using M2: use the latest weekly snapshot, accept data loss up to 7 days
5. After restore, verify counts and key records
6. Restart the application with restored `MONGODB_URI`

### Scenario: Cluster goes down

1. Check [status.mongodb.com](https://status.mongodb.com) for incidents
2. If Atlas is experiencing an outage, wait for their resolution
3. If your cluster is inaccessible, promote a replica set member if configured
4. After resolution, Atlas automatically restores to consistency

### Scenario: Encryption key lost (ENCRYPTION_SECRET)

If `ENCRYPTION_SECRET` is lost, encrypted data (Zoom tokens, TOTP secrets) **cannot be recovered**. Mitigation:

- Store `ENCRYPTION_SECRET` in a password manager (never in git)
- If lost: users must reconnect Zoom OAuth, admins must re-enable 2FA
- Zoom tokens: users go to Account → reconnect Zoom
- 2FA: admins use the account recovery flow (admin can disable 2FA via `PATCH /api/admin/users/:id/2fa/disable`)

---

## 6. Disaster Recovery Metrics

| Metric | Target |
|--------|--------|
| Recovery Point Objective (RPO) | ≤ 1 hour (search cache), ≤ 24 hours (DB with weekly backup on M2) |
| Recovery Time Objective (RTO) | ≤ 30 minutes (DB restore from Atlas snapshot) |
| Backup verification | Monthly |
| DR drill | Quarterly |

---

## 7. Retention Policy (Application-level)

The application enforces data retention via `scripts/retentionPolicy.ts`:

```bash
npx tsx scripts/retentionPolicy.ts
```

This script (run weekly) deletes:
- Search logs older than 90 days
- Read notifications older than 30 days
- Fresh review / moderation / admin logs older than 180–365 days

See `scripts/retentionPolicy.ts` for full configuration via env vars.

---

## 8. Environment Configuration Reference

Secrets that must be backed up and never committed to git:

```
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<min 8 chars>
ENCRYPTION_SECRET=<32+ char random>
ZOOM_CLIENT_ID=...
ZOOM_CLIENT_SECRET=...
REDIS_URL=https://... (Upstash)
REDIS_TOKEN=...
SENTRY_DSN=https://...@o...ingest.sentry.io/...
```

---

*Last reviewed: June 2026*
*Next scheduled review: September 2026*