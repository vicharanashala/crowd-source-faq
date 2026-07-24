/**
 * kbTextSource — Phase 2 R10.
 *
 * Knowledge-base retrieval source. Fans out to three Mongo
 * collections in parallel:
 *
 *   - TranscriptKnowledge  (Zoom transcript Q&A extractions)
 *   - DocumentInsight      (document-derived Q&A insights)
 *   - ProgramKnowledge     (Phase 2 — the curated store)
 *
 * All three already have `$text` indexes. The merged hits are tagged
 * with the original collection name in `meta.originCollection` so
 * downstream consumers can distinguish "this hit came from a Zoom
 * transcript" vs "this came from an admin-corrected ProgramKnowledge
 * row".
 *
 * Confidence per origin (per plan spec):
 *
 *   ProgramKnowledge seedSource:
 *     admin_corrected → 0.95  (after confidenceBoost 1.5× is applied)
 *     admin_response  → 0.90
 *     zoom_qa         → 0.85
 *     doc_promoted    → 0.80
 *   TranscriptKnowledge → 0.70
 *   DocumentInsight     → 0.70
 */

import { Types } from 'mongoose';
import { TranscriptKnowledge } from '../../modules/knowledge/transcript-knowledge.model.js';
import DocumentInsight from '../../modules/knowledge/document-insight.model.js';
import ProgramKnowledge from '../../models/ProgramKnowledge.js';
import { cronLog } from '../../utils/http/logger.js';
import type { RetrievalSource } from '../contextRetriever.js';

interface PKSeed {
  seedSource?: string;
  confidenceBoost?: number;
  batchId?: Types.ObjectId | { toString(): string };
  lastVerifiedDate?: Date;
}

function confidenceForProgramKnowledge(row: PKSeed): number {
  const base =
    row.seedSource === 'admin_corrected'
      ? 0.95
      : row.seedSource === 'admin_response'
      ? 0.9
      : row.seedSource === 'doc_promoted'
      ? 0.8
      : 0.85; // zoom_qa default
  // admin_corrected rows also use confidenceBoost=1.5 — already
  // priced in by the 0.95 base (no extra multiplier here; the
  // boost is for future multi-axis ranking).
  return base;
}

export const kbTextSource: RetrievalSource = {
  name: 'kb',
  weight: 1.1, // curated-bonus per plan spec

  async search(query, batchId, opts) {
    const topK = opts.topK ?? 3;
    try {
      const baseFilter: Record<string, unknown> = {};
      if (batchId) baseFilter.batchId = batchId;

      const [tkDocs, diDocs, pkDocs] = await Promise.all([
        TranscriptKnowledge.find(
          { ...baseFilter, $text: { $search: query } },
          { score: { $meta: 'textScore' } },
        )
          .sort({ score: { $meta: 'textScore' } })
          .limit(topK)
          .lean(),
        DocumentInsight.find(
          { ...baseFilter, $text: { $search: query } },
          { score: { $meta: 'textScore' } },
        )
          .sort({ score: { $meta: 'textScore' } })
          .limit(topK)
          .lean(),
        ProgramKnowledge.find(
          { ...baseFilter, $text: { $search: query } },
          { score: { $meta: 'textScore' } },
        )
          .sort({ score: { $meta: 'textScore' } })
          .limit(topK)
          .lean(),
      ]);

      const out: Array<Awaited<ReturnType<RetrievalSource['search']>>[number]> = [];

      for (const d of tkDocs) {
        out.push({
          source: 'kb',
          sourceId: String((d as { _id: unknown })._id),
          question: (d as { question?: string }).question ?? '',
          answer: (d as { answer?: string }).answer ?? '',
          score: Number((d as { score?: number }).score ?? 0),
          confidence: 0.7,
          matchedOn: 'TranscriptKnowledge.question+answer',
          batchId: (d as { batchId?: { toString(): string } }).batchId?.toString(),
          meta: {
            originCollection: 'TranscriptKnowledge',
            lastVerifiedDate: (d as { updatedAt?: Date }).updatedAt ?? null,
          },
        });
      }

      for (const d of diDocs) {
        out.push({
          source: 'kb',
          sourceId: String((d as { _id: unknown })._id),
          question: (d as { question?: string }).question ?? '',
          answer: (d as { answer_or_content?: string }).answer_or_content ?? '',
          score: Number((d as { score?: number }).score ?? 0),
          confidence: 0.7,
          matchedOn: 'DocumentInsight.question+answer_or_content+summary',
          batchId: (d as { batchId?: { toString(): string } }).batchId?.toString(),
          meta: {
            originCollection: 'DocumentInsight',
            lastVerifiedDate: (d as { updatedAt?: Date }).updatedAt ?? null,
            type: (d as { type?: string }).type,
            status: (d as { status?: string }).status,
          },
        });
      }

      for (const d of pkDocs) {
        const pkRow = d as unknown as PKSeed;
        out.push({
          source: 'kb',
          sourceId: String((d as { _id: unknown })._id),
          question: (d as { question?: string }).question ?? '',
          answer: (d as { answer?: string }).answer ?? '',
          score: Number((d as { score?: number }).score ?? 0),
          confidence: confidenceForProgramKnowledge(pkRow),
          matchedOn: 'ProgramKnowledge.question+answer+keywords',
          batchId: (d as { batchId?: { toString(): string } }).batchId?.toString(),
          meta: {
            originCollection: 'ProgramKnowledge',
            seedSource: pkRow.seedSource,
            confidenceBoost: pkRow.confidenceBoost ?? 1.0,
            lastVerifiedDate:
              (d as { lastVerifiedDate?: Date }).lastVerifiedDate ?? null,
          },
        });
      }

      return out;
    } catch (err) {
      cronLog.warn(`[kbTextSource] search failed: ${(err as Error).message}`);
      return [];
    }
  },
};