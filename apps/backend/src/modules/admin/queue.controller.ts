/**
 * queue.controller — admin-facing queue stats endpoint.
 *
 * Mounted at GET /api/admin/queue/stats by routes.ts. Returns counts
 * per status, active worker count, and average processing time.
 */

import { Request, Response } from 'express';
import { getStats, getJob } from '../../queue/queue.service.js';
import { isWorkerRunning } from '../../queue/queue.worker.js';

export async function getQueueStats(_req: Request, res: Response): Promise<void> {
  try {
    const stats = await getStats();
    res.json({
      ...stats,
      workerOnline: isWorkerRunning(),
      jobsByType: {
        'document-processing': await getStats('document-processing'),
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch queue stats', error: (err as Error).message });
  }
}

/**
 * GET /api/admin/queue/jobs/:id — single job status (for the frontend
 * progress poll). Returns 404 if the id is malformed or doesn't exist.
 */
export async function getQueueJob(req: Request, res: Response): Promise<void> {
  const raw = req.params.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  const job = await getJob(id);
  if (!job) {
    res.status(404).json({ message: 'Job not found.' });
    return;
  }
  res.json({
    id: String(job._id),
    type: job.type,
    status: job.status,
    progress: job.progress,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  });
}