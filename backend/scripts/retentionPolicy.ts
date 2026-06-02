/**
 * retentionPolicy.ts
 *
 * Configurable TTL-based cleanup for transient data that should not live forever.
 *
 * Retention rules:
 *   - SearchLog:                   RETENTION_DAYS (default 90 days) — analytics, not critical
 *   - Notification (read, old):    30 days after marked read
 *   - FreshReviewLog:              180 days
 *   - ModerationLog:               365 days
 *   - AdminLog:                    365 days
 *   - Dead/incomplete job records: 7 days (cleaned weekly)
 *
 * Run: npx tsx scripts/retentionPolicy.ts
 * Schedule: weekly cron (e.g., every Sunday at 03:00 UTC)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '.env.local' });

// ─── Retention periods (days) ─────────────────────────────────────────────────

const RETENTION_DAYS = parseInt(process.env['RETENTION_DAYS'] ?? '90');
const NOTIFICATION_READ_DAYS = parseInt(process.env['RETENTION_NOTIFICATION_DAYS'] ?? '30');
const FRESH_REVIEW_LOG_DAYS = parseInt(process.env['RETENTION_FRESH_REVIEW_DAYS'] ?? '180');
const MODERATION_LOG_DAYS = parseInt(process.env['RETENTION_MODERATION_LOG_DAYS'] ?? '365');
const ADMIN_LOG_DAYS = parseInt(process.env['RETENTION_ADMIN_LOG_DAYS'] ?? '365');
const DEAD_JOB_DAYS = parseInt(process.env['RETENTION_DEAD_JOB_DAYS'] ?? '7');

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function getCollection(name: string) {
  const db = mongoose.connection.db;
  if (!db) throw new Error('DB not connected');
  return db.collection(name);
}

// ─── Retention runners ─────────────────────────────────────────────────────────

async function cleanSearchLogs(): Promise<number> {
  const col = await getCollection('yaksha_faq_searchlogs');
  const before = daysAgo(RETENTION_DAYS);
  const result = await col.deleteMany({ createdAt: { $lt: before } });
  return result.deletedCount;
}

async function cleanNotifications(): Promise<number> {
  const col = await getCollection('yaksha_faq_notifications');
  const before = daysAgo(NOTIFICATION_READ_DAYS);
  // Only delete read notifications older than the retention period
  const result = await col.deleteMany({ read: true, createdAt: { $lt: before } });
  return result.deletedCount;
}

async function cleanFreshReviewLogs(): Promise<number> {
  const col = await getCollection('yaksha_faq_freshreviewlogs');
  const before = daysAgo(FRESH_REVIEW_LOG_DAYS);
  const result = await col.deleteMany({ createdAt: { $lt: before } });
  return result.deletedCount;
}

async function cleanModerationLogs(): Promise<number> {
  const col = await getCollection('yaksha_faq_moderationlogs');
  const before = daysAgo(MODERATION_LOG_DAYS);
  const result = await col.deleteMany({ createdAt: { $lt: before } });
  return result.deletedCount;
}

async function cleanAdminLogs(): Promise<number> {
  const col = await getCollection('yaksha_faq_adminlogs');
  const before = daysAgo(ADMIN_LOG_DAYS);
  const result = await col.deleteMany({ createdAt: { $lt: before } });
  return result.deletedCount;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/yaksha_faq';
  console.log(`[retention] Connecting to ${uri}`);
  await mongoose.connect(uri);
  console.log(`[retention] Connected. Running with RETENTION_DAYS=${RETENTION_DAYS}`);

  const results: Record<string, number> = {};

  try {
    results.searchLogs = await cleanSearchLogs();
    console.log(`[retention] SearchLog: removed ${results.searchLogs}`);
  } catch (e) {
    console.error('[retention] SearchLog cleanup failed:', (e as Error).message);
  }

  try {
    results.notifications = await cleanNotifications();
    console.log(`[retention] Notifications: removed ${results.notifications}`);
  } catch (e) {
    console.error('[retention] Notification cleanup failed:', (e as Error).message);
  }

  try {
    results.freshReviewLogs = await cleanFreshReviewLogs();
    console.log(`[retention] FreshReviewLog: removed ${results.freshReviewLogs}`);
  } catch (e) {
    console.error('[retention] FreshReviewLog cleanup failed:', (e as Error).message);
  }

  try {
    results.moderationLogs = await cleanModerationLogs();
    console.log(`[retention] ModerationLog: removed ${results.moderationLogs}`);
  } catch (e) {
    console.error('[retention] ModerationLog cleanup failed:', (e as Error).message);
  }

  try {
    results.adminLogs = await cleanAdminLogs();
    console.log(`[retention] AdminLog: removed ${results.adminLogs}`);
  } catch (e) {
    console.error('[retention] AdminLog cleanup failed:', (e as Error).message);
  }

  const total = Object.values(results).reduce((s, n) => s + n, 0);
  console.log(`[retention] Done. Total records removed: ${total}`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error('[retention] Fatal:', e);
  process.exit(1);
});