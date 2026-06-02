/**
 * fileLogger.ts
 *
 * Appends structured log lines to a rolling text file on disk.
 * Log format: [timestamp] [LEVEL] [requestId] message {meta}
 *
 * File location: /Users/yashhwanth/Documents/shamagama/main_log.txt
 * Rolling policy: rename + start new file when size > 50MB.
 */

import fs from 'fs';
import path from 'path';
import { mkdirSync } from 'fs';
import { getRequestId, getUserId } from './requestContext.js';
import type { Request, Response } from 'express';

const LOG_DIR = '/Users/yashhwanth/Documents/shamagama';
const LOG_FILE = path.join(LOG_DIR, 'main_log.txt');
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

function ensureLogDir(): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // dir may already exist
  }
}

function rollLogFile(): void {
  ensureLogDir();
  const archivePath = path.join(
    LOG_DIR,
    `main_log_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.txt`
  );
  try {
    fs.renameSync(LOG_FILE, archivePath);
  } catch {
    // if rename fails, just write to the existing file
  }
}

function writeLine(line: string): void {
  ensureLogDir();
  try {
    const stats = fs.statSync(LOG_FILE);
    if (stats.size >= MAX_SIZE_BYTES) {
      rollLogFile();
    }
  } catch {
    // file doesn't exist yet — that's fine
  }

  fs.appendFile(LOG_FILE, line + '\n', (err) => {
    if (err) console.error('[fileLogger] Failed to write to main_log.txt:', err.message);
  });
}

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return '';
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

// ─── Backend logger ──────────────────────────────────────────────────────────

export function logToFile(level: string, message: string, meta?: Record<string, unknown>, requestId?: string): void {
  const rid = requestId || getRequestId() || '-';
  const userId = getUserId() || '-';
  const timestamp = new Date().toISOString();
  const metaStr = formatMeta(meta);
  const line = `[${timestamp}] [${level}] [${rid}] [user:${userId}] ${message} ${metaStr}`;
  writeLine(line);
}

// ─── Frontend log receiver ───────────────────────────────────────────────────
// POST /api/log — receives frontend-originated log lines and appends them

export const ingestFrontendLog = (req: Request, res: Response): void => {
  const { level, message, meta } = req.body as {
    level?: string;
    message?: string;
    meta?: Record<string, unknown>;
  };

  if (!message) {
    res.status(400).json({ message: 'message is required' });
    return;
  }

  logToFile(
    (level as string) || 'INFO',
    `[frontend]: ${message}`,
    meta,
    (req as Request & { id?: string }).id
  );

  res.status(204).send();
};