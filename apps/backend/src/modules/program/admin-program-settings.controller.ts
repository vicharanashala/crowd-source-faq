/**
 * Admin: ProgramSettings CRUD.
 *
 * Only one PUT endpoint per program — settings is a singleton
 * (1:1 with Batch). The endpoint upserts: if no doc exists for
 * the batch, it creates one with the supplied values; otherwise
 * it overwrites the stored values.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Batch from './batch.model.js';
import ProgramSettings, { defaultSettings, IProgramSettings } from './program-settings.model.js';
import { httpLog } from '../../utils/http/logger.js';
import { invalidatePublicCaches } from '../faq/public-faq.controller.js';
import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a 6-digit hex color.');

const themeSchema = z.object({
  primaryColor: hexColor,
  accentColor:  hexColor,
  background:   z.enum(['cream', 'mist', 'ink']),
  fontFamily:   z.enum(['serif', 'sans']),
});

const heroSchema = z.object({
  title:     z.string().min(1).max(200),
  subtitle:  z.string().max(600).default(''),
  imageUrl:  z.string().max(2000).nullable().default(null),
  ctaText:   z.string().max(60).nullable().default(null),
  ctaLink:   z.string().max(2000).nullable().default(null),
});

const sectionsSchema = z.object({
  showStats:     z.boolean(),
  showFAQs:      z.boolean(),
  showCommunity: z.boolean(),
  showZoom:      z.boolean(),
  showKB:        z.boolean(),
  sectionOrder:  z.array(z.enum(['stats', 'faqs', 'community', 'zoom', 'kb'])).default(['stats', 'faqs', 'community', 'zoom', 'kb']),
});

const brandingSchema = z.object({
  logoText:   z.string().min(1).max(60),
  footerText: z.string().min(1).max(200),
});

const upsertSettingsSchema = z.object({
  theme: themeSchema,
  hero: heroSchema,
  sections: sectionsSchema,
  branding: brandingSchema,
});

export async function upsertProgramSettings(req: Request, res: Response): Promise<void> {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid program id.' });
    return;
  }
  const parsed = upsertSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input.', issues: parsed.error.issues });
    return;
  }
  try {
    const batch = await Batch.findById(id).select('_id name description').lean();
    if (!batch) {
      res.status(404).json({ message: 'Program not found.' });
      return;
    }
    const merged = {
      ...defaultSettings(new Types.ObjectId(String(batch._id)), batch.name, batch.description),
      ...parsed.data,
    };
    const updated = await ProgramSettings.findOneAndUpdate(
      { batchId: batch._id },
      { $set: { ...merged, batchId: batch._id } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    invalidatePublicCaches();
    res.json(updated);
  } catch (err) {
    httpLog.error(`[program] upsertProgramSettings failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to save program settings.' });
  }
}
