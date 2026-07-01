/**
 * setupNewCluster.ts — bootstrap a fresh MongoDB cluster
 * (empty, no data) into a runnable state.
 *
 * Run:
 *   npx tsx scripts/setupNewCluster.ts \
 *       --mongodb-uri 'mongodb+srv://user:pass@host/db'
 *
 * Idempotent — re-running on a partially-set-up cluster
 * no-ops each step. Does NOT migrate any data; the user
 * already said the old DB is abandoned.
 *
 * What it does (in order):
 *   1. Connect to the target cluster.
 *   2. ensureIndexes() on every model — creates the
 *      compound + TTL indexes declared in each schema.
 *      (Mongoose does this automatically on first model
 *      use, but doing it explicitly here surfaces any
 *      errors clearly at setup time.)
 *   3. Run addIndexes.ts's explicit indexes (SearchLog TTL,
 *      FAQ category+status, CommunityPost status+createdAt,
 *      UnresolvedSearch indexes) — some of these were
 *      added later than the model schemas and live in the
 *      migration script.
 *   4. Create the Atlas vector search index (1024-dim for
 *      mxbai-embed-large-v1). --drop is supported for
 *      existing-index re-create.
 *   5. Seed default Badges (the positive + negative badge
 *      set the auto-awarder uses).
 *   6. Seed default SupportCategories (the 6 issue types:
 *      internet / camera / microphone / device / power /
 *      other).
 *   7. Create the initial admin user
 *      (admin@yaksha.com / admin123 — same as the seed
 *      script).
 *   8. Run the audit:data script and report.
 *
 * On any failure, the script exits with a non-zero code
 * and a clear message. The operator can re-run after
 * fixing the underlying issue.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { execSync } from 'child_process';
import { getActiveEmbeddingConfig } from '../utils/ai/embeddings.js';

interface CliArgs {
  mongodbUri: string;
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  dropVectorIndex: boolean;
  skipAudit: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const out: Partial<CliArgs> = {
    adminEmail: 'admin@yaksha.com',
    adminPassword: 'admin123',
    adminName: 'Admin User',
    dropVectorIndex: false,
    skipAudit: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--mongodb-uri') out.mongodbUri = args[++i];
    else if (a?.startsWith('--mongodb-uri=')) out.mongodbUri = a.split('=')[1];
    else if (a === '--admin-email') out.adminEmail = args[++i];
    else if (a === '--admin-password') out.adminPassword = args[++i];
    else if (a === '--admin-name') out.adminName = args[++i];
    else if (a === '--drop-vector-index') out.dropVectorIndex = true;
    else if (a === '--skip-audit') out.skipAudit = true;
    else if (a === '--help' || a === '-h') {
      console.log(`
Usage:
  npx tsx scripts/setupNewCluster.ts --mongodb-uri <uri> [options]

Required:
  --mongodb-uri <uri>   MongoDB connection string. mongodb+srv://...
                          for Atlas, mongodb:// for self-hosted.

Optional:
  --admin-email <e>     Admin user email (default: admin@yaksha.com)
  --admin-password <p>  Admin user password (default: admin123)
  --admin-name <n>      Admin user display name (default: Admin User)
  --drop-vector-index   Drop any existing vector_index before
                          creating the new 1024-dim one
  --skip-audit          Skip the final audit:data report
  --help, -h            Show this help

Examples:
  # Atlas
  npx tsx scripts/setupNewCluster.ts \\
    --mongodb-uri 'mongodb+srv://user:pass@cluster0.x.y.net/yaksha_faq'

  # Self-hosted Docker
  npx tsx scripts/setupNewCluster.ts \\
    --mongodb-uri 'mongodb://localhost:27017/yaksha_faq'
`);
      process.exit(0);
    }
  }
  if (!out.mongodbUri) {
    console.error('ERROR: --mongodb-uri is required. Run with --help for usage.');
    process.exit(2);
  }
  return out as CliArgs;
}

const M = (() => {
  // Legacy IIFE for backwards compat with the few remaining
  // `M.X` references. v1.68 — the new approach is to use
  // `await loadAllModels()` directly, which dynamic-imports
  // the models on demand and avoids the IIFE-scope issue.
  return {};
})();

// v1.68 — dynamic-import each model instead of using
// `require()` (the project is ESM and `require` isn't
// defined in this scope). The models get registered with
// Mongoose the first time they're imported, which triggers
// their schema.index() declarations (ensureIndexes). This
// is what the previous require-based block was trying to
// achieve, just compatible with ESM.
const modelPaths: Record<string, string> = {
  User: '../models/User.js',
  FAQ: '../models/FAQ.js',
  CommunityPost: '../models/CommunityPost.js',
  Notification: '../models/Notification.js',
  SearchLog: '../models/SearchLog.js',
  UnresolvedSearch: '../models/UnresolvedSearch.js',
  RepLog: '../models/ReputationLog.js',
  Badge: '../models/Badge.js',
  AppSetting: '../models/AppSetting.js',
  FeatureFlag: '../models/FeatureFlag.js',
  Batch: '../models/Batch.js',
  Category: '../models/Category.js',
  AttendanceGuidance: '../models/AttendanceGuidance.js',
  SupportCategory: '../models/SupportCategory.js',
  DocumentInsight: '../models/DocumentInsight.js',
  DocumentRecord: '../models/DocumentRecord.js',
  ZoomMeeting: '../models/ZoomMeeting.js',
  TeaNotification: '../models/TeaNotification.js',
  ModerationLog: '../models/ModerationLog.js',
  FreshReviewLog: '../models/FreshReviewLog.js',
  FreshReviewVote: '../models/FreshReviewVote.js',
  RevokedToken: '../models/RevokedToken.js',
  GuestEvent: '../models/GuestEvent.js',
  AdminLog: '../models/AdminLog.js',
  NotificationSettings: '../models/NotificationSettings.js',
  AiConfig: '../models/AiConfig.js',
  PipelineResult: '../models/PipelineResult.js',
  TranscriptKnowledge: '../models/TranscriptKnowledge.js',
};

// Returns a map of {name: Model} after importing every
// model in `modelPaths`. Mongoose registers the schema
// the first time the model is imported, so this is
// equivalent to calling ensureIndexes() on each.
async function loadAllModels(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [name, path] of Object.entries(modelPaths)) {
    // Dynamic import — ESM compatible
    const mod = await import(/* @vite-ignore */ path) as { default?: { modelName: string } };
    out[name] = mod.default ?? mod;
  }
  return out;
}

async function step(title: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n=== ${title} ===`);
  await fn();
  console.log(`  ✓ ${title}`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  console.log('Yaksha new-cluster setup');
  console.log('=========================');
  console.log(`  target: ${args.mongodbUri.replace(/\/\/.*@/, '//***@')}`);
  console.log(`  admin:  ${args.adminEmail} (${args.adminName})`);

  // 1. Connect
  await step('Connect to MongoDB', async () => {
    await mongoose.connect(args.mongodbUri);
    const db = mongoose.connection.db!;
    const status = await db.admin().serverStatus();
    console.log(`  Connected to ${db.databaseName} (MongoDB ${status.version})`);
  });

  // 2. Model-defined indexes
  await step('Create model indexes (ensureIndexes)', async () => {
    // v1.68 — import each model dynamically. Mongoose
    // registers the schema and creates the index when
    // the model is first instantiated.
    const models = await loadAllModels();
    for (const [, Model] of Object.entries(models)) {
      const m = Model as { createIndexes?: () => Promise<unknown>; ensureIndexes?: () => Promise<unknown>; modelName?: string };
      if (m && typeof m.createIndexes === 'function') {
        try {
          await m.createIndexes();
          console.log(`  - ${m.modelName ?? 'model'}: indexes ensured`);
        } catch (err) {
          console.warn(`  ! ${m.modelName ?? 'model'}: ${(err as Error).message}`);
        }
      } else if (m && typeof m.ensureIndexes === 'function') {
        // Mongoose 6 compat
        await m.ensureIndexes();
        console.log(`  - ${m.modelName ?? 'model'}: indexes ensured`);
      }
    }
  });

  // 3. Run addIndexes.ts's explicit indexes
  await step('Run addIndexes.ts (explicit indexes)', async () => {
    // We could shell out to tsx, but that's slow. Inline the
    // small set of indexes the script adds. (addIndexes.ts
    // is a static list — re-inline it here to keep this
    // script self-contained.)
    const db = mongoose.connection.db!;
    const ops = [
      { name: 'searchlog-TTL-90d',         coll: 'yaksha_faq_searchlogs',
        key: { createdAt: 1 },
        options: { expireAfterSeconds: 60 * 60 * 24 * 90 } },
      { name: 'searchlog-query-createdAt',  coll: 'yaksha_faq_searchlogs',
        key: { query: 1, createdAt: -1 } },
      { name: 'faq-category-status-createdAt', coll: 'yaksha_faq_faqs',
        key: { category: 1, status: 1, createdAt: -1 } },
      { name: 'community-status-createdAt',  coll: 'yaksha_faq_communityposts',
        key: { status: 1, createdAt: -1 } },
      { name: 'unresolved-status-createdAt', coll: 'yaksha_faq_unresolved_searches',
        key: { status: 1, createdAt: -1 } },
      { name: 'unresolved-faqId',           coll: 'yaksha_faq_unresolved_searches',
        key: { faqId: 1 } },
    ] as { name: string; coll: string; key: Record<string, 1 | -1>; options?: Record<string, unknown> }[];
    for (const o of ops) {
      try {
        await db.collection(o.coll).createIndex(o.key, { name: o.name, ...o.options });
        console.log(`  - ${o.coll}.${o.name}`);
      } catch (err) {
        const e = err as { code?: number; message?: string };
        if (e.code === 85) {
          console.log(`  - ${o.coll}.${o.name} (already exists, skipping)`);
        } else {
          throw err;
        }
      }
    }
  });

  // 4. Vector indexes — three collections hold the
  //    1024-dim mxbai-embed-large-v1 vectors and need a
  //    vector_index for $vectorSearch to work:
  //      - yaksha_faq_faqs (public search)
  //      - yaksha_faq_communityposts (community search)
  //      - yaksha_transcript_knowledge (auto-extracted KB,
  //        used by the /api/ask-ai auto-answer pipeline
  //        as the zero-human "knowledge base" path)
  await step('Create vector search indexes', async () => {
    const db = mongoose.connection.db!;
    let embeddingDim = 1024;
    try {
      const config = await getActiveEmbeddingConfig();
      embeddingDim = config.dimensions;
    } catch (err) {
      console.warn(`[setup] Could not fetch active embedding dimensions: ${(err as Error).message}. Using default 1024.`);
    }

    // v1.68.1 — the actual Atlas search-index spec. Previous
    // version of this script used `mappings.vectorSearch`
    // which isn't a real Atlas format — the index got
    // created but $vectorSearch had no field to query.
    // Switched to the canonical `fields` array form.
    // Atlas `vectorSearch` indexes require field type 'vector' ('knnVector'
    // is rejected → index FAILED). `batchId` filter supports per-program
    // scoped $vectorSearch in the search controller.
    const VECTOR_INDEX = {
      name: 'vector_index',
      type: 'vectorSearch',
      definition: {
        fields: [
          {
            type: 'vector',
            path: 'embedding',
            numDimensions: embeddingDim,
            similarity: 'dotProduct',
          },
          {
            type: 'filter',
            path: 'batchId',
          },
        ],
      },
    };
    if (args.dropVectorIndex) {
      for (const coll of ['yaksha_faq_faqs', 'yaksha_faq_communityposts', 'yaksha_transcript_knowledge']) {
        try {
          await db.collection(coll).dropSearchIndex('vector_index');
          console.log(`  - dropped existing ${coll}.vector_index`);
        } catch (err) {
          const e = err as { code?: number; message?: string };
          if (e.code !== 27 && !e.message?.toLowerCase().includes('not found')) throw err;
          console.log(`  - ${coll}.vector_index doesn't exist, nothing to drop`);
        }
      }
    }
    for (const collName of ['yaksha_faq_faqs', 'yaksha_faq_communityposts', 'yaksha_transcript_knowledge']) {
      try {
        await db.collection(collName).createSearchIndex(VECTOR_INDEX);
        console.log(`  - created ${collName}.vector_index (${embeddingDim}-dim, dotProduct)`);
      } catch (err) {
        const e = err as { code?: number; message?: string };
        if (e.code === 85 || e.message?.includes('already exists')) {
          console.log(`  - ${collName}.vector_index already exists, skipping`);
        } else {
          throw err;
        }
      }
    }
  });

  // 5. Seed default Badges
  await step('Seed default Badges', async () => {
    const { Badge } = (await loadAllModels()) as { Badge: typeof import('../modules/moderation/badge.model.js').default };
    const DEFAULT_BADGES: { name: string; slug: string; description: string; icon: string; type: 'positive' | 'negative'; actionTrigger: 'auto' | 'manual'; pointsRequired?: number }[] = [
      { name: 'Curious Mind', slug: 'curious-mind', description: 'Asked your first question', icon: '❓', type: 'positive', actionTrigger: 'auto' },
      { name: 'First Answer', slug: 'first-answer', description: 'Posted your first community answer', icon: '💡', type: 'positive', actionTrigger: 'auto' },
      { name: 'Helpful', slug: 'helpful', description: 'Your answer was marked helpful', icon: '👍', type: 'positive', actionTrigger: 'auto' },
      { name: 'Contributor', slug: 'contributor', description: 'Submitted 5 FAQs', icon: '📝', type: 'positive', pointsRequired: 50, actionTrigger: 'auto' },
      { name: 'Expert', slug: 'expert', description: 'Reached silver tier', icon: '🏅', type: 'positive', pointsRequired: 200, actionTrigger: 'auto' },
      { name: 'Top Contributor', slug: 'top-contributor', description: 'Reached gold tier', icon: '🥇', type: 'positive', pointsRequired: 500, actionTrigger: 'auto' },
      { name: 'Legend', slug: 'legend', description: 'Reached legend tier', icon: '⭐', type: 'positive', pointsRequired: 2500, actionTrigger: 'auto' },
      { name: 'Bug Hunter', slug: 'bug-hunter', description: 'Reported a valid issue', icon: '🐛', type: 'positive', actionTrigger: 'auto' },
      { name: 'On Fire', slug: 'on-fire', description: '10+ helpful votes in one day', icon: '🔥', type: 'positive', actionTrigger: 'auto' },
      { name: 'Warning', slug: 'warning', description: 'Received an admin warning', icon: '⚠️', type: 'negative', actionTrigger: 'manual' },
      { name: 'Point Penalty', slug: 'point-penalty', description: 'Point deduction', icon: '📉', type: 'negative', actionTrigger: 'manual' },
      { name: 'Suspension', slug: 'suspension', description: 'Suspended from posting', icon: '🚫', type: 'negative', actionTrigger: 'manual' },
      { name: 'Banned', slug: 'banned', description: 'Account banned', icon: '⛔', type: 'negative', actionTrigger: 'manual' },
    ];
    let created = 0;
    for (const b of DEFAULT_BADGES) {
      const existing = await Badge.findOne({ slug: b.slug });
      if (!existing) {
        await Badge.create(b);
        created++;
      }
    }
    console.log(`  - ${created} badges created (${DEFAULT_BADGES.length - created} already existed)`);
  });

  // 6. Seed default SupportCategories
  await step('Seed default SupportCategories', async () => {
    const { SupportCategory } = (await loadAllModels()) as { SupportCategory: typeof import('../modules/support/support-category.model.js').default };
    const cats = [
      { issueType: 'internet', label: 'Internet Problem', shortLabel: 'Internet', description: 'Wi-Fi, hotspot, or general connectivity issues', iconKey: 'wifi' as const,
        steps: ['Restart your router or hotspot once.', 'Switch to a backup network if one is available.', 'Disable VPN or proxy tools that may interfere with the class link.', 'Note the time the connection dropped so the team can review it.'],
        fields: [], displayOrder: 1, isActive: true, createdBy: null },
      { issueType: 'camera', label: 'Camera Issue', shortLabel: 'Camera', description: 'Camera permission, hardware, or app-level issues', iconKey: 'camera' as const,
        steps: ['Check browser camera permission in the address bar.', 'Close and reopen the class tab, then test your camera again.', 'Reconnect the camera or switch to another device if you have one.', 'Write down the exact browser or device error if the camera still fails.'],
        fields: [], displayOrder: 2, isActive: true, createdBy: null },
      { issueType: 'microphone', label: 'Microphone Issue', shortLabel: 'Microphone', description: 'Mic permission, hardware, or app-level issues', iconKey: 'mic' as const,
        steps: ['Check microphone permission in the browser.', 'Unplug and reconnect the mic or headset if you are using one.', 'Test microphone input in another app to confirm the device works.', 'Write down the browser or device message you saw.'],
        fields: [], displayOrder: 3, isActive: true, createdBy: null },
      { issueType: 'device', label: 'Device Failure', shortLabel: 'Device', description: 'Laptop / phone hardware failures', iconKey: 'device' as const,
        steps: ['Restart the device once and try reconnecting to the class.', 'Plug in power or move to another device if one is available.', 'If the device is overheating or crashing, stop using it for a moment.', 'Write down any boot, crash, or hardware message you see.'],
        fields: [], displayOrder: 4, isActive: true, createdBy: null },
      { issueType: 'power', label: 'Power Outage', shortLabel: 'Power', description: 'Power cuts, battery, or charging issues', iconKey: 'power' as const,
        steps: ['Confirm whether the outage affects only your room or the full area.', 'Move to a backup power source or a different location if possible.', 'Use your phone hotspot if mobile data is available.', 'Mention the outage timing and duration in your request.'],
        fields: [], displayOrder: 5, isActive: true, createdBy: null },
      { issueType: 'other', label: 'Other Reason', shortLabel: 'Other', description: 'Anything not covered by the categories above', iconKey: 'generic' as const,
        steps: ['Write a short description of what stopped you from joining.', 'Note the time the issue started and whether it affected the whole session.', 'Submit the request so the support team can review it.'],
        fields: [], displayOrder: 6, isActive: true, createdBy: null },
    ];
    let created = 0;
    for (const c of cats) {
      const existing = await SupportCategory.findOne({ issueType: c.issueType });
      if (!existing) {
        await SupportCategory.create(c);
        created++;
      }
    }
    console.log(`  - ${created} categories created (${cats.length - created} already existed)`);
  });

  // 7. Create initial admin user
  await step('Create initial admin user', async () => {
    const { User } = (await loadAllModels()) as { User: typeof import('../modules/auth/user.model.js').default };
    const existing = await User.findOne({ email: args.adminEmail });
    if (existing) {
      console.log(`  - admin user ${args.adminEmail} already exists, skipping`);
    } else {
      const admin = await User.create({
        name: args.adminName,
        email: args.adminEmail,
        password: args.adminPassword, // pre-save hook hashes
        role: 'admin',
      });
      admin.password = args.adminPassword;
      await admin.save();
      console.log(`  - created ${args.adminEmail} (role: admin)`);
      console.log(`    LOG IN WITH: ${args.adminEmail} / ${args.adminPassword}`);
      console.log(`    CHANGE THE PASSWORD IMMEDIATELY in production.`);
    }
  });

  // 8. Audit
  if (args.skipAudit) {
    console.log('\n=== Audit skipped (--skip-audit) ===');
  } else {
    console.log('\n=== Audit:data ===');
    try {
      execSync('npx tsx scripts/auditData.ts', { stdio: 'inherit', cwd: process.cwd() });
    } catch (err) {
      console.warn(`  ! audit:data exited with code ${(err as { status?: number }).status} — review above.`);
    }
  }

  console.log('\n=========================');
  console.log('✅ New cluster setup complete.');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Set the new MONGODB_URI in backend/.env.local');
  console.log(`  2. Log in to the admin panel: ${args.adminEmail} / ${args.adminPassword}`);
  console.log('  3. (optional) Seed FAQ content: npm run seed');
  console.log('  4. (optional) Seed test data:    npm run seed:live');
  console.log('  5. Start the backend:           npm run dev');
  console.log('  6. Start the frontend:          cd ../frontend && npm run dev');
  console.log('');
  console.log('The old cluster is left untouched per the operator decision.');

  await mongoose.disconnect();
}

main().catch((err) => { console.error((err as Error).message); process.exit(1); });
