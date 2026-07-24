/**
 * Migration: backfill `ProgramKnowledge` from the three source
 * collections that the Phase 2 context retriever consolidates.
 *
 * Sources
 * -------
 *  1. `TranscriptKnowledge` rows → seedSource='zoom_qa'
 *     (every row, regardless of status — the kb source filters
 *     downstream).
 *  2. `DocumentInsight` rows with `publishedFaqId` set →
 *     seedSource='doc_promoted'.
 *  3. `CommunityPost` rows where status='answered' AND
 *     aiAnswerStatus='approved' AND answer is non-empty →
 *     seedSource='admin_response'.
 *
 * Idempotency
 * -----------
 * Skips any row whose `(originalContextId, seedSource)` pair is
 * already present in `yaksha_program_knowledge`. The model has a
 * partial unique index on that pair so the script is safe to re-run.
 *
 * Run: npx tsx apps/backend/src/scripts/migrate-to-program-knowledge.ts
 */

import mongoose from 'mongoose';
import ProgramKnowledge, {
  type IProgramKnowledge,
} from '../models/ProgramKnowledge.js';
import { TranscriptKnowledge } from '../modules/knowledge/transcript-knowledge.model.js';
import DocumentInsight from '../modules/knowledge/document-insight.model.js';
import CommunityPost from '../modules/community/community-post.model.js';

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/yaksha_faq';

interface Stats {
  transcriptRowsMigrated: number;
  docInsightsMigrated: number;
  communityPostsMigrated: number;
  skipped: number;
  errors: number;
}

async function migrateTranscriptKnowledge(stats: Stats): Promise<void> {
  const cursor = TranscriptKnowledge.find({})
    .select('_id question answer keywords batchId')
    .lean()
    .cursor();

  for await (const row of cursor) {
    const originalId = String(row._id);
    try {
      const existing = await ProgramKnowledge.exists({
        originalContextId: originalId,
        seedSource: 'zoom_qa',
      });
      if (existing) {
        stats.skipped += 1;
        continue;
      }
      const doc: Partial<IProgramKnowledge> = {
        question: row.question,
        answer: row.answer,
        keywords: row.keywords ?? [],
        batchId: row.batchId ?? null,
        seedSource: 'zoom_qa',
        originalContextId: originalId,
        confidenceBoost: 1.0,
        lastVerifiedDate: new Date(),
      };
      // batchId is required on ProgramKnowledge — skip rows whose
      // source row has no batchId (legacy pre-Phase-2 rows).
      if (!doc.batchId) {
        stats.skipped += 1;
        continue;
      }
      await ProgramKnowledge.create(doc);
      stats.transcriptRowsMigrated += 1;
    } catch (err) {
      stats.errors += 1;
      console.warn(`[migrate] TranscriptKnowledge ${originalId} failed: ${(err as Error).message}`);
    }
  }
}

async function migrateDocumentInsights(stats: Stats): Promise<void> {
  const cursor = DocumentInsight.find({
    publishedFaqId: { $ne: null },
  })
    .select('_id question answer_or_content batchId')
    .lean()
    .cursor();

  for await (const row of cursor) {
    const originalId = String(row._id);
    try {
      const existing = await ProgramKnowledge.exists({
        originalContextId: originalId,
        seedSource: 'doc_promoted',
      });
      if (existing) {
        stats.skipped += 1;
        continue;
      }
      if (!row.batchId) {
        stats.skipped += 1;
        continue;
      }
      await ProgramKnowledge.create({
        question: row.question || '(no question)',
        answer: row.answer_or_content,
        keywords: [],
        batchId: row.batchId,
        seedSource: 'doc_promoted',
        originalContextId: originalId,
        confidenceBoost: 1.0,
        lastVerifiedDate: new Date(),
      });
      stats.docInsightsMigrated += 1;
    } catch (err) {
      stats.errors += 1;
      console.warn(`[migrate] DocumentInsight ${originalId} failed: ${(err as Error).message}`);
    }
  }
}

async function migrateCommunityPosts(stats: Stats): Promise<void> {
  const cursor = CommunityPost.find({
    status: 'answered',
    aiAnswerStatus: 'approved',
    answer: { $ne: null, $exists: true },
  })
    .select('_id title body answer batchId')
    .lean()
    .cursor();

  for await (const row of cursor) {
    const originalId = String(row._id);
    try {
      const existing = await ProgramKnowledge.exists({
        originalContextId: originalId,
        seedSource: 'admin_response',
      });
      if (existing) {
        stats.skipped += 1;
        continue;
      }
      if (!row.batchId) {
        stats.skipped += 1;
        continue;
      }
      await ProgramKnowledge.create({
        question: row.title,
        answer: row.answer ?? '',
        keywords: [],
        batchId: row.batchId,
        seedSource: 'admin_response',
        originalContextId: originalId,
        confidenceBoost: 1.0,
        lastVerifiedDate: new Date(),
      });
      stats.communityPostsMigrated += 1;
    } catch (err) {
      stats.errors += 1;
      console.warn(`[migrate] CommunityPost ${originalId} failed: ${(err as Error).message}`);
    }
  }
}

async function main(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  console.log(`[migrate] Connected to ${MONGO_URI}`);

  const stats: Stats = {
    transcriptRowsMigrated: 0,
    docInsightsMigrated: 0,
    communityPostsMigrated: 0,
    skipped: 0,
    errors: 0,
  };

  console.log('[migrate] Phase 1/3 — TranscriptKnowledge → ProgramKnowledge (zoom_qa)');
  await migrateTranscriptKnowledge(stats);
  console.log(`  → ${stats.transcriptRowsMigrated} migrated, ${stats.skipped} skipped`);

  const beforeDocs = stats.skipped;
  console.log('[migrate] Phase 2/3 — DocumentInsight → ProgramKnowledge (doc_promoted)');
  await migrateDocumentInsights(stats);
  console.log(`  → ${stats.docInsightsMigrated} migrated, ${stats.skipped - beforeDocs} skipped`);

  const beforeCommunity = stats.skipped;
  console.log('[migrate] Phase 3/3 — CommunityPost → ProgramKnowledge (admin_response)');
  await migrateCommunityPosts(stats);
  console.log(`  → ${stats.communityPostsMigrated} migrated, ${stats.skipped - beforeCommunity} skipped`);

  console.log('\n[migrate] Final stats:');
  console.log(JSON.stringify(stats, null, 2));

  await mongoose.disconnect();
  process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[migrate] Migration failed:', err);
  process.exit(1);
});