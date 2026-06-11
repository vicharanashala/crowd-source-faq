/**
 * documentJob — the actual work the BullMQ worker runs.
 *
 * Walks the full pipeline for one uploaded document:
 *
 *   1. extractTextFromFile  (tesseract / markitdown)
 *   2. extractInsightsFromText  (AI Q&A / Policy / HowTo extraction)
 *   3. Write DocumentInsight rows (status='pending_review')
 *   4. Mark DocumentRecord as 'completed' (or 'failed')
 *
 * Throws on any unrecoverable error — BullMQ catches and retries
 * with exponential backoff (3 attempts). After 3 failures the
 * job is dead-lettered and the DocumentRecord goes to 'failed'
 * via the catch in the worker.
 */

import DocumentRecord, { type IDocumentRecord } from '../../models/DocumentRecord.js';
import DocumentInsight from '../../models/DocumentInsight.js';
import { extractTextFromFile, type ExtractionResult } from '../documentExtractor.js';
import { extractInsightsFromText } from '../ai/documentAiPipeline.js';
import { logger } from '../http/logger.js';
import type { DocumentJobData, DocumentJobResult } from './documentQueue.js';

export async function processDocument(data: DocumentJobData): Promise<DocumentJobResult> {
  const buffer = Buffer.from(data.bufferBase64, 'base64');
  const record = await DocumentRecord.findById(data.documentId);
  if (!record) {
    // The document record was deleted while the job was queued —
    // abort cleanly so we don't loop retries.
    logger.warn(`[documentJob] document ${data.documentId} not found — skipping`);
    return { insightsCreated: 0, extractionDurationMs: 0, aiDurationMs: 0 };
  }

  // ── Step 1: extract text ─────────────────────────────────────────────────
  await setStatus(record, 'extracting');
  let extraction: ExtractionResult;
  try {
    extraction = await extractTextFromFile(buffer, data.fileType, data.mimeType);
  } catch (err) {
    await markFailed(record, `extraction failed: ${(err as Error).message}`);
    throw err;
  }
  record.rawExtractedText = extraction.text;
  record.extractionDurationMs = extraction.durationMs;
  await record.save();

  // ── Step 2: AI extraction ────────────────────────────────────────────────
  await setStatus(record, 'ai_processing');
  let insights;
  const aiStart = Date.now();
  try {
    insights = await extractInsightsFromText(extraction.text, {
      documentTitle: data.title,
      fileType: data.fileType,
    });
  } catch (err) {
    await markFailed(record, `AI extraction failed: ${(err as Error).message}`);
    throw err;
  }
  const aiDuration = Date.now() - aiStart;
  record.aiDurationMs = aiDuration;

  // ── Step 3: persist insights ─────────────────────────────────────────────
  if (insights.length > 0) {
    const rows = insights.map((i) => ({
      documentId: record._id,
      type: i.type,
      question: i.question ?? '',
      answer_or_content: i.answer_or_content,
      confidence_score: i.confidence_score,
      status: 'pending_review' as const,
      pageNumber: null,
      sourceExcerpt: excerptAround(extraction.text, i.question, 240),
      searchMatchCount: 0,
      reviewedBy: null,
      reviewedAt: null,
      publishedFaqId: null,
      promotionReason: null,
      aiPromptVersion: 'v1',
    }));
    await DocumentInsight.insertMany(rows);
  }
  record.insightsGenerated = insights.length;
  record.status = 'completed';
  await record.save();

  logger.info(
    `[documentJob] ${data.fileName} — extracted ${extraction.text.length} chars ` +
      `(${extraction.engine}, ${extraction.durationMs}ms) → ${insights.length} insights ` +
      `(${aiDuration}ms)`,
  );

  return {
    insightsCreated: insights.length,
    extractionDurationMs: extraction.durationMs,
    aiDurationMs: aiDuration,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function setStatus(record: IDocumentRecord, status: IDocumentRecord['status']): Promise<void> {
  record.status = status;
  record.errorMessage = null;
  await record.save();
}

async function markFailed(record: IDocumentRecord, message: string): Promise<void> {
  record.status = 'failed';
  record.errorMessage = message.slice(0, 2000);
  await record.save();
}

/** Pull a short window around the question (or start of the answer) for the source excerpt. */
function excerptAround(text: string, question: string, maxLen: number): string {
  const anchor = (question || text).slice(0, 60);
  const idx = text.indexOf(anchor);
  if (idx < 0) return text.slice(0, maxLen);
  const start = Math.max(0, idx - Math.floor(maxLen / 4));
  return (start > 0 ? '…' : '') + text.slice(start, start + maxLen).trim() + (start + maxLen < text.length ? '…' : '');
}
