/**
 * Public: combined program + settings endpoint.
 *
 * Returns `{ program, settings }` where `settings` is either the
 * stored ProgramSettings doc OR the defaultSettings() factory
 * output for a batch that doesn't have one yet. The frontend
 * always gets a fully-populated settings object.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Batch, { slugifyProgramName } from './batch.model.js';
import ProgramSettings, { defaultSettings, IProgramSettings } from './program-settings.model.js';
import { httpLog } from '../../utils/http/logger.js';

export async function getProgramBySlug(req: Request, res: Response): Promise<void> {
  const rawSlug = req.params.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  if (!slug) {
    res.status(400).json({ message: 'Slug required.' });
    return;
  }
  const normalised = slug.trim().toLowerCase();
  try {
    // v1.69 — same slug-derivation logic as the by-slug endpoint,
    // but we return the *combined* view the program page actually
    // needs (program + settings, defaults applied).
    const active = await Batch.find({ isActive: true })
      .select('_id name description startDate endDate isActive isDefault')
      .lean();
    const batch = active.find((b) => slugifyProgramName(b.name) === normalised);
    if (!batch) {
      res.status(404).json({ message: 'Program not found.' });
      return;
    }

    // Look up the ProgramSettings doc. If absent, build defaults
    // from the batch itself so the page renders sensibly.
    const stored = await ProgramSettings.findOne({ batchId: batch._id }).lean();
    const settings = stored
      ? { ...stored }
      : defaultSettings(new Types.ObjectId(String(batch._id)), batch.name, batch.description);

    res.json({
      program: batch,
      settings,
    });
  } catch (err) {
    httpLog.error(`[program] getProgramBySlug failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load program.' });
  }
}
