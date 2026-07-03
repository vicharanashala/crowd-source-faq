/**
 * documentQueue — MongoDB-backed document-processing queue.
 *
 * v2 — replaces the previous BullMQ + ioredis implementation. The
 * public API surface (`addDocumentJob`, `isDocumentQueueEnabled`,
 * `getDocumentQueueStatus`, `setQueueDisabledByAdmin`, `startDocumentWorker`,
 * `stopDocumentWorker`) is preserved so that document.controller.ts and
 * admin.controller.ts don't need changes. Internally everything is
 * backed by the queue service in `queue/queue.service.ts`.
 *
 * The processor that runs the actual document pipeline is registered
 * here with the queue worker. It calls `processDocument` from
 * `documentJob.ts` — the same function BullMQ was calling.
 */

import { logger } from '../http/logger.js';
import { enqueue, getStats, cancel as queueCancel } from '../../queue/queue.service.js';
import {
  registerProcessor,
  startWorker,
  stopWorker,
  isWorkerRunning,
  startStaleLeaseSweeper,
  stopStaleLeaseSweeper,
} from '../../queue/queue.worker.js';

// ─── Job data shape (preserved from the BullMQ version) ─────────────────────

export interface DocumentJobData {
  documentId: string;
  /** Base64-encoded file bytes. Re-encoded so the payload survives the
   *  Mongo round-trip (no buffer support). */
  bufferBase64: string;
  fileName: string;
  fileType: 'image' | 'pdf' | 'docx' | 'xlsx';
  mimeType: string;
  title: string;
  uploaderUserId: string;
  batchId?: string;
}

export interface DocumentJobResult {
  insightsCreated: number;
  extractionDurationMs: number;
  aiDurationMs: number;
}

// ─── State ───────────────────────────────────────────────────────────────────

export type DocumentQueueStatus = 'online' | 'disabled' | 'failed';

let _disabledByAdmin = false;
let _workerEverStarted = false;

// ─── Producer (called by document.controller.ts) ────────────────────────────

/**
 * Enqueue a document for processing. Returns the job id.
 * Throws if the queue is disabled.
 */
export async function addDocumentJob(data: DocumentJobData): Promise<string> {
  if (_disabledByAdmin) {
    throw new Error('Document queue is disabled by admin.');
  }
  return enqueue('document-processing', data, { maxAttempts: 3 });
}

/**
 * Cancel a queued document job. Returns true if it was cancelled.
 */
export async function cancelDocumentJob(jobId: string): Promise<boolean> {
  return queueCancel(jobId);
}

// ─── Admin toggle (preserved API) ────────────────────────────────────────────

export function setQueueDisabledByAdmin(disabled: boolean): void {
  _disabledByAdmin = disabled;
  if (disabled) {
    void stopWorker().catch((err) =>
      logger.error(`[documentQueue] stopWorker failed: ${(err as Error).message}`),
    );
  } else if (_workerEverStarted) {
    // Re-enable — restart the worker.
    startWorker({ types: ['document-processing'], concurrency: 3 });
  }
}

export function isDocumentQueueEnabled(): boolean {
  return !_disabledByAdmin && (isWorkerRunning() || !_workerEverStarted);
}

export async function getDocumentQueueStatus(): Promise<DocumentQueueStatus> {
  if (_disabledByAdmin) return 'disabled';
  const stats = await getStats('document-processing');
  // `failed` is reported when there are stuck processing jobs but the
  // worker isn't actively polling. Useful for ops dashboards.
  if (stats.processing > 0 && !isWorkerRunning()) return 'failed';
  return isWorkerRunning() ? 'online' : 'disabled';
}

/**
 * Synchronous version of `getDocumentQueueStatus` — preserved for
 * admin.controller.ts which doesn't await. Returns a coarse status
 * based on in-memory state (does not query Mongo).
 */
export function getDocumentQueueStatusSync(): DocumentQueueStatus {
  if (_disabledByAdmin) return 'disabled';
  return isWorkerRunning() ? 'online' : 'disabled';
}

// ─── Worker lifecycle (preserved API) ────────────────────────────────────────

/**
 * Start the in-process worker. Idempotent — calling twice is a no-op.
 * Called once at server startup.
 */
export function startDocumentWorker(): boolean {
  if (_workerEverStarted) return isWorkerRunning();

  registerProcessor('document-processing', async (payload, { updateProgress }) => {
    // Lazy-import so the document job module isn't pulled in unless the
    // worker actually starts (it has heavy Mongoose + tesseract deps).
    const { processDocument } = await import('./documentJob.js');
    await updateProgress(10);
    const result = await processDocument(payload as DocumentJobData);
    await updateProgress(100);
    return result;
  });

  startStaleLeaseSweeper(60_000);
  const ok = startWorker({ types: ['document-processing'], concurrency: 3 });
  _workerEverStarted = ok;
  return ok;
}

/**
 * Stop the worker. Called on SIGTERM.
 */
export async function stopDocumentWorker(): Promise<void> {
  stopStaleLeaseSweeper();
  await stopWorker(10_000);
}

/**
 * Test-only: reset module-level state so each test starts with a
 * clean worker state. NOT exported from the public API surface.
 */
export function __resetDocumentQueueForTests(): void {
  _disabledByAdmin = false;
  _workerEverStarted = false;
}