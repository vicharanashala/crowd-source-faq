/**
 * supportCategoriesController.ts — Admin-managed Session Support
 * categories and the per-category context-field schema.
 *
 * These endpoints are NOT gated by the feature flag — admins must
 * be able to inspect / edit the schema even when the user-facing
 * feature is turned off.
 *
 * Routes (from routes/support.ts):
 *   GET    /api/support/categories
 *   GET    /api/support/categories/:issueType
 *   POST   /api/support/categories
 *   PATCH  /api/support/categories/:issueType
 *   DELETE /api/support/categories/:issueType
 *   POST   /api/support/categories/:issueType/fields
 *   PATCH  /api/support/categories/:issueType/fields/:fieldKey
 *   DELETE /api/support/categories/:issueType/fields/:fieldKey
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import SupportCategory, {
  SUPPORT_FIELD_TYPES,
  SUPPORT_ICON_KEYS,
  type IContextField,
  type SupportFieldType,
  type SupportIconKey,
} from './support-category.model.js';
import { supportLog } from '../../utils/http/logger.js';
import { getAuthedUserId } from './support-core.controller.js';

function asStringParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

// v1.69 — Phase 9: build a (batchId, issueType) lookup filter
// for the per-program CRUD handlers. When batchId is null,
// the filter targets the global default (batchId: null on
// the doc).
function batchIdValidFilter(issueType: string, batchId: Types.ObjectId | null): Record<string, unknown> {
  return batchId
    ? { issueType, batchId }
    : { issueType, batchId: null };
}

function isKebabCase(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(value);
}

function kebabify(label: string): string {
  return label
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ─── Category CRUD ────────────────────────────────────────────────────────

/** GET /api/support/categories — list all categories (active first). */
export async function listCategories(req: Request, res: Response): Promise<void> {
  try {
    // v1.69 — Phase 9: when ?batchId=... is supplied, return
    // only the per-program categories (issue types the
    // program has overridden) + the global defaults merged.
    // Without a batchId, the legacy global view is returned.
    const rawBatch = req.query.batchId;
    const batchId = typeof rawBatch === 'string' && Types.ObjectId.isValid(rawBatch)
      ? new Types.ObjectId(rawBatch)
      : null;
    const filter: Record<string, unknown> = {};
    if (batchId) {
      // Per-program categories (with this batchId) + global
      // defaults (with batchId:null). Admin-created overrides
      // win on (issueType) collision.
      const [perProgram, global] = await Promise.all([
        SupportCategory.find({ batchId }).sort({ displayOrder: 1, createdAt: 1 }).lean(),
        SupportCategory.find({ batchId: null }).sort({ displayOrder: 1, createdAt: 1 }).lean(),
      ]);
      // The picker UI shows a per-program override as its own
      // card with a "Custom" badge. The admin UI uses
      // ?includeOverrides=true to see both the global and the
      // per-program view side by side.
      if (req.query.includeOverrides === 'true') {
        res.json({ categories: [...global, ...perProgram], source: 'merged' });
        return;
      }
      const byIssueType = new Map<string, typeof perProgram[number]>();
      for (const c of global) byIssueType.set(c.issueType, c);
      for (const c of perProgram) byIssueType.set(c.issueType, c); // per-program wins
      res.json({ categories: Array.from(byIssueType.values()), source: 'merged' });
      return;
    }
    const cats = await SupportCategory.find({}).sort({ displayOrder: 1, createdAt: 1 }).lean();
    res.json({ categories: cats, source: 'global' });
  } catch (err) {
    supportLog.error(`[support] listCategories failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load categories.' });
  }
}

/** GET /api/support/categories/:issueType — get one (with its full schema). */
export async function getCategory(req: Request, res: Response): Promise<void> {
  const issueType = asStringParam(req.params.issueType);
  if (!issueType) { res.status(400).json({ message: 'Invalid issueType.' }); return; }
  try {
    const cat = await SupportCategory.findOne({ issueType }).lean();
    if (!cat) { res.status(404).json({ message: 'Category not found.' }); return; }
    res.json({ category: cat });
  } catch (err) {
    supportLog.error(`[support] getCategory failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load category.' });
  }
}

/** POST /api/support/categories — create a new category. */
export async function createCategory(req: Request, res: Response): Promise<void> {
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const body = (req.body ?? {}) as {
    issueType?: string;
    label?: string;
    shortLabel?: string;
    description?: string;
    iconKey?: string;
    steps?: string[];
    isActive?: boolean;
    // v1.69 — Phase 9: per-program support categories. When
    // batchId is supplied, the category is created as a
    // per-program override; when null, the legacy global view
    // is used (backwards compat for single-tenant installs).
    batchId?: string;
  };
  const issueType = String(body.issueType || '').trim().toLowerCase();
  if (!isKebabCase(issueType)) {
    res.status(400).json({ message: 'issueType must be kebab-case (a-z, 0-9, dash).' });
    return;
  }
  const label = String(body.label || '').trim();
  const shortLabel = String(body.shortLabel || '').trim();
  if (!label || !shortLabel) {
    res.status(400).json({ message: 'label and shortLabel are required.' });
    return;
  }
  const steps = Array.isArray(body.steps)
    ? body.steps.map((s) => String(s).trim()).filter(Boolean).slice(0, 20)
    : [];
  const batchIdValid = body.batchId && Types.ObjectId.isValid(body.batchId)
    ? new Types.ObjectId(body.batchId)
    : null;

  const iconKey: SupportIconKey =
    SUPPORT_ICON_KEYS.includes(body.iconKey as SupportIconKey) ? (body.iconKey as SupportIconKey) : 'generic';

  try {
    // v1.69 — Phase 9: uniqueness is now (batchId, issueType), not
    // just issueType. The legacy `findOne({ issueType })` would
    // collide if two programs wanted the same kebab-case key —
    // we explicitly check (batchId, issueType) instead.
    const exists = await SupportCategory.findOne({
      issueType,
      ...(batchIdValid ? { batchId: batchIdValid } : { batchId: null }),
    }).lean();
    if (exists) {
      res.status(409).json({ message: 'A category with this issueType already exists in this program (or globally).' });
      return;
    }
    const max = await SupportCategory.findOne({}).sort({ displayOrder: -1 }).select('displayOrder').lean();
    const displayOrder = (max?.displayOrder ?? -1) + 1;
    const cat = await SupportCategory.create({
      issueType,
      label,
      shortLabel,
      description: String(body.description || ''),
      iconKey,
      steps,
      fields: [],
      isActive: body.isActive !== false,
      displayOrder,
      // v1.69 — Phase 9: per-program override. When null,
      // the category is the global default; when set, the
      // category is only visible inside the named program.
      batchId: batchIdValid,
      createdBy: userId,
    });
    res.status(201).json({ category: cat.toObject() });
  } catch (err) {
    const e = err as Error & { code?: number };
    if (e.code === 11000) {
      res.status(409).json({ message: 'A category with this issueType already exists.' });
      return;
    }
    supportLog.error(`[support] createCategory failed: ${e.message}`);
    res.status(500).json({ message: 'Failed to create category.' });
  }
}

/** PATCH /api/support/categories/:issueType — update label / shortLabel /
 *  description / iconKey / steps / isActive / displayOrder. Field CRUD is
 *  managed via the field-specific endpoints below.) */
export async function updateCategory(req: Request, res: Response): Promise<void> {
  const issueType = asStringParam(req.params.issueType);
  if (!issueType) { res.status(400).json({ message: 'Invalid issueType.' }); return; }
  // v1.69 — Phase 9: per-program scope. When ?batchId=... is
  // supplied, target the per-program override; otherwise the
  // global default. The (batchId, issueType) pair is the
  // unique lookup.
  const rawBatch = req.query.batchId;
  const batchId = typeof rawBatch === 'string' && Types.ObjectId.isValid(rawBatch)
    ? new Types.ObjectId(rawBatch)
    : null;

  const body = (req.body ?? {}) as {
    label?: string;
    shortLabel?: string;
    description?: string;
    iconKey?: string;
    steps?: string[];
    isActive?: boolean;
    displayOrder?: number;
  };
  const update: Record<string, unknown> = {};
  if (typeof body.label === 'string') update.label = body.label.trim();
  if (typeof body.shortLabel === 'string') update.shortLabel = body.shortLabel.trim();
  if (typeof body.description === 'string') update.description = body.description;
  if (typeof body.iconKey === 'string' && SUPPORT_ICON_KEYS.includes(body.iconKey as SupportIconKey)) {
    update.iconKey = body.iconKey;
  }
  if (Array.isArray(body.steps)) {
    update.steps = body.steps.map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
  }
  if (typeof body.isActive === 'boolean') update.isActive = body.isActive;
  if (typeof body.displayOrder === 'number') update.displayOrder = body.displayOrder;
  if (Object.keys(update).length === 0) {
    res.status(400).json({ message: 'No updatable fields provided.' });
    return;
  }

  try {
    const cat = await SupportCategory.findOneAndUpdate(
      // v1.69 — Phase 9: (batchId, issueType) — see comment at
      // the top of the function.
      batchIdValidFilter(issueType, batchId),
      { $set: update },
      { new: true },
    ).lean();
    if (!cat) { res.status(404).json({ message: 'Category not found.' }); return; }
    res.json({ category: cat });
  } catch (err) {
    supportLog.error(`[support] updateCategory failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to update category.' });
  }
}

/** DELETE /api/support/categories/:issueType — hard delete.
 *  Tickets in this category keep their stored `contextFields` triples
 *  but lose the schema reference. Use carefully. */
export async function deleteCategory(req: Request, res: Response): Promise<void> {
  const issueType = asStringParam(req.params.issueType);
  if (!issueType) { res.status(400).json({ message: 'Invalid issueType.' }); return; }
  // v1.69 — Phase 9: per-program scope. Mirrors the update path.
  const rawBatch = req.query.batchId;
  const batchId = typeof rawBatch === 'string' && Types.ObjectId.isValid(rawBatch)
    ? new Types.ObjectId(rawBatch)
    : null;
  try {
    const cat = await SupportCategory.findOneAndDelete(
      batchIdValidFilter(issueType, batchId)
    ).lean();
    if (!cat) { res.status(404).json({ message: 'Category not found.' }); return; }
    res.json({ deleted: true });
  } catch (err) {
    supportLog.error(`[support] deleteCategory failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to delete category.' });
  }
}

// ─── Per-field CRUD (add / edit / archive) ───────────────────────────────

/** POST /api/support/categories/:issueType/fields — add a new field. */
export async function addField(req: Request, res: Response): Promise<void> {
  const issueType = asStringParam(req.params.issueType);
  if (!issueType) { res.status(400).json({ message: 'Invalid issueType.' }); return; }

  const body = (req.body ?? {}) as {
    key?: string;
    label?: string;
    type?: string;
    required?: boolean;
    placeholder?: string;
    helpText?: string;
    options?: { value?: string; label?: string }[];
  };

  if (!body.label || !body.type || !SUPPORT_FIELD_TYPES.includes(body.type as SupportFieldType)) {
    res.status(400).json({ message: 'label and a valid type are required.' });
    return;
  }
  if (body.type === 'dropdown') {
    if (!Array.isArray(body.options) || body.options.length === 0 ||
        !body.options.every((o) => o && o.value && o.label)) {
      res.status(400).json({ message: 'dropdown fields need at least one option with value and label.' });
      return;
    }
  }
  const autoKey = kebabify(String(body.label || ''));
  const key = String(body.key || autoKey).toLowerCase().trim();
  if (!isKebabCase(key)) {
    res.status(400).json({ message: 'field key must be kebab-case (a-z, 0-9, dash).' });
    return;
  }

  try {
    const cat = await SupportCategory.findOne({ issueType }).lean();
    if (!cat) { res.status(404).json({ message: 'Category not found.' }); return; }
    if (cat.fields.some((f) => f.key === key)) {
      res.status(409).json({ message: `A field with key "${key}" already exists on this category.` });
      return;
    }
    const displayOrder = cat.fields.length;
    const newField: IContextField = {
      key,
      label: String(body.label).trim(),
      type: body.type as SupportFieldType,
      required: Boolean(body.required),
      placeholder: String(body.placeholder || ''),
      helpText: String(body.helpText || ''),
      options: (body.options ?? []).map((o) => ({ value: String(o.value), label: String(o.label) })),
      displayOrder,
      archived: false,
      archivedAt: null,
    };
    const updated = await SupportCategory.findOneAndUpdate(
      { issueType },
      { $push: { fields: newField } },
      { new: true },
    ).lean();
    res.status(201).json({ category: updated });
  } catch (err) {
    supportLog.error(`[support] addField failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to add field.' });
  }
}

/** PATCH /api/support/categories/:issueType/fields/:fieldKey — update. */
export async function updateField(req: Request, res: Response): Promise<void> {
  const issueType = asStringParam(req.params.issueType);
  const fieldKey = asStringParam(req.params.fieldKey);
  if (!issueType || !fieldKey) { res.status(400).json({ message: 'Invalid params.' }); return; }

  const body = (req.body ?? {}) as {
    label?: string;
    required?: boolean;
    placeholder?: string;
    helpText?: string;
    options?: { value?: string; label?: string }[];
    displayOrder?: number;
  };

  const update: Record<string, unknown> = {};
  if (typeof body.label === 'string') update['fields.$.label'] = body.label.trim();
  if (typeof body.required === 'boolean') update['fields.$.required'] = body.required;
  if (typeof body.placeholder === 'string') update['fields.$.placeholder'] = body.placeholder;
  if (typeof body.helpText === 'string') update['fields.$.helpText'] = body.helpText;
  if (Array.isArray(body.options)) {
    update['fields.$.options'] = body.options.map((o) => ({ value: String(o.value), label: String(o.label) }));
  }
  if (typeof body.displayOrder === 'number') update['fields.$.displayOrder'] = body.displayOrder;
  if (Object.keys(update).length === 0) {
    res.status(400).json({ message: 'No updatable fields provided.' });
    return;
  }

  try {
    const cat = await SupportCategory.findOneAndUpdate(
      { issueType, 'fields.key': fieldKey },
      { $set: update },
      { new: true },
    ).lean();
    if (!cat) { res.status(404).json({ message: 'Field not found.' }); return; }
    res.json({ category: cat });
  } catch (err) {
    supportLog.error(`[support] updateField failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to update field.' });
  }
}

/** DELETE /api/support/categories/:issueType/fields/:fieldKey — soft delete
 *  (archives the field; historical ticket values remain readable). */
export async function archiveField(req: Request, res: Response): Promise<void> {
  const issueType = asStringParam(req.params.issueType);
  const fieldKey = asStringParam(req.params.fieldKey);
  if (!issueType || !fieldKey) { res.status(400).json({ message: 'Invalid params.' }); return; }
  try {
    const cat = await SupportCategory.findOneAndUpdate(
      { issueType, 'fields.key': fieldKey },
      { $set: { 'fields.$.archived': true, 'fields.$.archivedAt': new Date() } },
      { new: true },
    ).lean();
    if (!cat) { res.status(404).json({ message: 'Field not found.' }); return; }
    res.json({ category: cat });
  } catch (err) {
    supportLog.error(`[support] archiveField failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to archive field.' });
  }
}
