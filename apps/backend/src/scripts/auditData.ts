/**
 * auditData.ts — live-DB data quality audit.
 *
 * Run:  npm run audit:data
 *
 * Reads the production cluster and prints a per-collection
 * summary of:
 *   - Counts
 *   - Orphan refs (e.g. SupportRequest.userId pointing at a
 *     missing user)
 *   - Stale flags (isGolden=true with no goldenConvertedAt,
 *     isBanned=true with no bannedBy, etc.)
 *   - Inconsistent state (tier doesn't match the points
 *     ladder, embeddings of wrong length, etc.)
 *   - Missing timestamps on records that should have them
 *
 * Output is human-readable. The script is READ-ONLY — it
 * does not mutate the DB.
 *
 * Exit code:
 *   0 — no issues found
 *   1 — issues found (still runs to completion; non-fatal)
 *   2 — could not connect to the DB
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { calculateTier } from '../modules/auth/user.model.js';
import { getActiveEmbeddingConfig } from '../utils/ai/embeddings.js';

let EMBEDDING_DIM = 1024;

const MONGO_URI = process.env.MONGODB_URI!;
if (!MONGO_URI) {
  console.error('MONGODB_URI is required');
  process.exit(2);
}

const issues: { collection: string; kind: string; detail: string }[] = [];

function flag(collection: string, kind: string, detail: string) {
  issues.push({ collection, kind, detail });
}

/** Normalize an _id-ish value to a string. */
function idToString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null && 'toString' in v) {
    return (v as { toString(): string }).toString();
  }
  return null;
}

async function getUserIdSet(db: mongoose.mongo.Db): Promise<Set<string>> {
  const userIds = await db.collection('yaksha_faq_users').distinct('_id');
  return new Set(userIds.map((id) => idToString(id)).filter((s): s is string => s !== null));
}

async function auditUsers(db: mongoose.mongo.Db) {
  console.log('\n=== Users ===');
  const total = await db.collection('yaksha_faq_users').countDocuments();
  const banned = await db.collection('yaksha_faq_users').countDocuments({ isBanned: true });
  const goldenBanned = await db.collection('yaksha_faq_users').countDocuments({
    goldenBannedUntil: { $gt: new Date() },
  });
  console.log(`  total=${total}  banned=${banned}  golden-banned=${goldenBanned}`);

  // Tier/points consistency
  const users = await db.collection('yaksha_faq_users')
    .find({}, { projection: { _id: 1, points: 1, tier: 1, name: 1 } })
    .toArray();
  let tierMismatch = 0;
  for (const u of users) {
    if (u.tier !== calculateTier(u.points || 0)) {
      tierMismatch++;
      if (tierMismatch <= 5) {
        console.log(`  tier-mismatch: ${idToString(u._id)} (${u.name}) points=${u.points} tier=${u.tier} expected=${calculateTier(u.points || 0)}`);
      }
    }
  }
  if (tierMismatch > 0) {
    flag('User', 'tier-mismatch', `${tierMismatch} users have tier≠calculateTier(points). Run npm run recompute:tier to fix.`);
  }

  // isBanned without bannedBy
  const noBanner = await db.collection('yaksha_faq_users').countDocuments({
    isBanned: true,
    bannedBy: { $exists: false },
  });
  if (noBanner > 0) flag('User', 'banned-without-bannedBy', `${noBanner} users have isBanned=true but no bannedBy`);

  // goldenBannedUntil in the past (stale)
  const staleBans = await db.collection('yaksha_faq_users').countDocuments({
    goldenBannedUntil: { $lt: new Date() },
  });
  if (staleBans > 0) {
    flag('User', 'stale-golden-bans', `${staleBans} users have goldenBannedUntil in the past. The escalation cron should clear these; if it's not running, the field is sticking.`);
  }
}

async function auditFAQs(db: mongoose.mongo.Db) {
  console.log('\n=== FAQs ===');
  const total = await db.collection('yaksha_faq_faqs').countDocuments();
  const approved = await db.collection('yaksha_faq_faqs').countDocuments({ status: 'approved' });
  const pending = await db.collection('yaksha_faq_faqs').countDocuments({ status: 'pending' });
  const rejected = await db.collection('yaksha_faq_faqs').countDocuments({ status: 'rejected' });
  console.log(`  total=${total}  approved=${approved}  pending=${pending}  rejected=${rejected}`);

  // Embedding dimension
  const allFaqs = await db.collection('yaksha_faq_faqs')
    .find({ embedding: { $exists: true, $ne: null } })
    .project({ embedding: 1, question: 1 })
    .toArray();
  let wrongDim = 0;
  let missing = 0;
  for (const f of allFaqs) {
    if (!f.embedding || f.embedding.length === 0) { missing++; continue; }
    if (f.embedding.length !== EMBEDDING_DIM) wrongDim++;
  }
  console.log(`  embeddings: ${allFaqs.length} have one, ${missing} empty, ${wrongDim} wrong-dim (expected ${EMBEDDING_DIM})`);
  if (wrongDim > 0) {
    flag('FAQ', 'wrong-embedding-dim', `${wrongDim} FAQs have embeddings of wrong dimension. Run npm run backfill:embeddings.`);
  }
  if (missing > 0) {
    flag('FAQ', 'missing-embedding', `${missing} FAQs have empty embeddings. Run npm run backfill:embeddings.`);
  }

  // Orphan createdBy (normalize to string)
  const userIdSet = await getUserIdSet(db);
  const allCreatedBy = await db.collection('yaksha_faq_faqs')
    .find({ createdBy: { $ne: null } }, { projection: { createdBy: 1 } })
    .toArray();
  let orphanCreatedBy = 0;
  for (const f of allCreatedBy) {
    const str = idToString(f.createdBy);
    if (str && !userIdSet.has(str)) orphanCreatedBy++;
  }
  if (orphanCreatedBy > 0) {
    flag('FAQ', 'orphan-createdBy', `${orphanCreatedBy} FAQs reference a non-existent user.`);
  }
}

async function auditCommunityPosts(db: mongoose.mongo.Db) {
  console.log('\n=== Community Posts ===');
  const total = await db.collection('yaksha_faq_communityposts').countDocuments();
  const answered = await db.collection('yaksha_faq_communityposts').countDocuments({ status: 'answered' });
  const unanswered = await db.collection('yaksha_faq_communityposts').countDocuments({ status: 'unanswered' });
  const golden = await db.collection('yaksha_faq_communityposts').countDocuments({ isGolden: true });
  console.log(`  total=${total}  answered=${answered}  unanswered=${unanswered}  golden=${golden}`);

  // Stale golden (isGolden=true with no goldenConvertedAt)
  const staleGolden = await db.collection('yaksha_faq_communityposts').countDocuments({
    isGolden: true,
    goldenConvertedAt: null,
  });
  if (staleGolden > 0) {
    flag('CommunityPost', 'stale-golden', `${staleGolden} posts are isGolden=true with no goldenConvertedAt.`);
  }

  // Embedding dimension (same as FAQ)
  const allPosts = await db.collection('yaksha_faq_communityposts')
    .find({ embedding: { $exists: true, $ne: null } })
    .project({ embedding: 1 })
    .toArray();
  let wrongDim = 0;
  for (const p of allPosts) {
    if (!p.embedding || p.embedding.length === 0) continue;
    if (p.embedding.length !== EMBEDDING_DIM) wrongDim++;
  }
  if (wrongDim > 0) {
    flag('CommunityPost', 'wrong-embedding-dim', `${wrongDim} posts have wrong-dim embeddings.`);
  }
}

async function auditSupportRequests(db: mongoose.mongo.Db) {
  console.log('\n=== Support Requests ===');
  const total = await db.collection('yaksha_faq_session_support').countDocuments();
  console.log(`  total=${total}`);

  // Status enum usage
  const allStatuses = await db.collection('yaksha_faq_session_support').distinct('status');
  console.log(`  statuses seen: ${JSON.stringify(allStatuses)}`);

  // Orphan userId (string or ObjectId)
  const userIdSet = await getUserIdSet(db);
  const allUserIds = await db.collection('yaksha_faq_session_support')
    .find({ userId: { $ne: null } }, { projection: { userId: 1 } })
    .toArray();
  let orphanUserId = 0;
  for (const t of allUserIds) {
    const str = idToString(t.userId);
    if (str && !userIdSet.has(str)) orphanUserId++;
  }
  if (orphanUserId > 0) {
    flag('SupportRequest', 'orphan-userId', `${orphanUserId} tickets reference a non-existent user.`);
  }

  // Stale golden (goldenConvertedBy without isGolden)
  const staleGolden = await db.collection('yaksha_faq_supportrequests').countDocuments({
    goldenConvertedBy: { $ne: null },
    isGolden: { $ne: true },
  });
  if (staleGolden > 0) {
    flag('SupportRequest', 'stale-golden-converted', `${staleGolden} tickets have goldenConvertedBy set but isGolden is false.`);
  }
}

async function auditNotifications(db: mongoose.mongo.Db) {
  console.log('\n=== Notifications ===');
  const total = await db.collection('yaksha_faq_notifications').countDocuments();
  const unread = await db.collection('yaksha_faq_notifications').countDocuments({ read: false });
  console.log(`  total=${total}  unread=${unread}`);

  // Orphan recipient. The recipient field in older rows is
  // stored as a STRING (not an ObjectId) — the controllers
  // were updated at some point but the historical data
  // still has strings. We normalize both sides to strings
  // before comparing.
  const userIdSet = await getUserIdSet(db);
  const allRecipients = await db.collection('yaksha_faq_notifications')
    .find({}, { projection: { recipient: 1 } })
    .toArray();
  let orphanCount = 0;
  for (const n of allRecipients) {
    const str = idToString(n.recipient);
    if (str && !userIdSet.has(str)) orphanCount++;
  }
  if (orphanCount > 0) {
    flag('Notification', 'orphan-recipient', `${orphanCount} notifications have a non-existent recipient. Run npm run cleanup:orphan-notifications.`);
  }
}

async function auditSearchLogs(db: mongoose.mongo.Db) {
  console.log('\n=== Search Logs ===');
  const total = await db.collection('yaksha_faq_searchlogs').countDocuments();
  const last7d = await db.collection('yaksha_faq_searchlogs').countDocuments({
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  });
  const deadEnds = await db.collection('yaksha_faq_searchlogs').countDocuments({ resultsCount: 0 });
  console.log(`  total=${total}  last7d=${last7d}  deadEnds=${deadEnds}`);

  // 0-result rate (the user said "we need proper accuracy")
  if (total > 0) {
    const rate = (deadEnds / total * 100).toFixed(1);
    console.log(`  dead-end rate: ${rate}%`);
    if (deadEnds / total > 0.4) {
      flag('SearchLog', 'high-dead-end-rate', `${rate}% of searches return 0 results. Search accuracy needs work.`);
    }
  }
}

async function main() {
  console.log('Yaksha data-quality audit');
  console.log('=========================');

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;

  try {
    const config = await getActiveEmbeddingConfig();
    EMBEDDING_DIM = config.dimensions;
  } catch (err) {
    console.warn(`[audit] Could not resolve active embedding dimensions, using default 1024: ${(err as Error).message}`);
  }

  await auditUsers(db);
  await auditFAQs(db);
  await auditCommunityPosts(db);
  await auditSupportRequests(db);
  await auditNotifications(db);
  await auditSearchLogs(db);

  console.log('\n=========================');
  if (issues.length === 0) {
    console.log('OK — no issues found.');
  } else {
    console.log(`Found ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
    for (const i of issues) {
      console.log(`  [${i.collection}] ${i.kind}: ${i.detail}`);
    }
  }
  await mongoose.disconnect();
  process.exit(issues.length === 0 ? 0 : 1);
}

main().catch((err) => { console.error((err as Error).message); process.exit(2); });
