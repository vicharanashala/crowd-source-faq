/**
 * supportGuidanceController.ts — Issue-type troubleshooting guidance.
 *
 * Uses the older AttendanceGuidance collection (read by no one else —
 * SupportCategory is the new admin-editable schema, but AttendanceGuidance
 * is still here for the /api/support/guidance endpoints that show
 * pre-submit checklists).
 *
 * Routes (from routes/support.ts):
 *   GET  /api/support/guidance
 *   PUT  /api/support/guidance/:issueType
 *
 * Admin-only. NOT gated by the Session Support feature flag.
 */

import { Request, Response } from 'express';
import AttendanceGuidance from './attendance-guidance.model.js';
import { ISSUE_CONFIGS, type SupportIssueType } from './support-request.model.js';
import { supportLog } from '../../utils/http/logger.js';
import { getAuthedUserId } from './support-core.controller.js';

function asStringParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/** GET /api/support/guidance — list all 6 checklists. */
export async function listGuidance(_req: Request, res: Response): Promise<void> {
  try {
    const results: Array<{ issueType: string; label: string; steps: string[] }> = [];
    for (const [key, cfg] of Object.entries(ISSUE_CONFIGS)) {
      let row = await AttendanceGuidance.findOne({ issueType: key });
      if (!row) {
        row = await AttendanceGuidance.create({ issueType: key, steps: cfg.steps });
      }
      results.push({ issueType: key, label: cfg.label, steps: row.steps });
    }
    res.json(results);
  } catch (err) {
    supportLog.error(`[support] listGuidance failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load guidance.' });
  }
}

/** PUT /api/support/guidance/:issueType — replace checklist. */
export async function updateGuidance(req: Request, res: Response): Promise<void> {
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const key = asStringParam(req.params.issueType);
  if (!key || !(key in ISSUE_CONFIGS)) {
    res.status(404).json({ message: 'Unknown issue type.' });
    return;
  }

  const body = (req.body ?? {}) as { steps?: unknown };
  if (!Array.isArray(body.steps)) {
    res.status(400).json({ message: 'Steps must be an array of strings.' });
    return;
  }
  const cleaned = body.steps
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 20);

  try {
    let row = await AttendanceGuidance.findOne({ issueType: key });
    if (!row) {
      row = new AttendanceGuidance({ issueType: key, steps: cleaned, updatedBy: userId });
    } else {
      row.steps = cleaned;
      row.updatedBy = userId;
    }
    await row.save();
    res.json({
      message: 'Guidance steps updated.',
      guidance: { issueType: key, label: ISSUE_CONFIGS[key as SupportIssueType].label, steps: cleaned },
    });
  } catch (err) {
    supportLog.error(`[support] updateGuidance failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to update guidance.' });
  }
}
