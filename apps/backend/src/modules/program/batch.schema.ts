/**
 * batch.schema — Zod validators for batch/program endpoints.
 *
 * Why this lives in its own module:
 *   The Zod v4 runtime forbids `.partial()` on object schemas that
 *   already have a `.refine()` / `.superRefine()` attached. We need
 *   a separate update schema (every field optional), so the natural
 *   pattern of `updateSchema = createSchema.partial()` no longer
 *   works. We work around it by separating the BASE SHAPE (no
 *   refinements) from the CREATE SCHEMA (base + cross-field refine),
 *   then building the update schema from the same base shape with
 *   `.partial()` so the two share all field validators.
 *
 *   Refinements that apply to BOTH create and update (the
 *   cross-field date-order check) are re-applied via `.superRefine`
 *   on the update schema, conditionally — only when both dates are
 *   present in the patch. Refinements that only apply on create
 *   (none currently) would go on createSchema alone.
 *
 *   Tests import the same exported schemas so production and test
 *   behavior never drift.
 */

import { z } from 'zod';

// ─── Shared field validators ───────────────────────────────────────────────

/**
 * Accepts both date-only "YYYY-MM-DD" and full ISO 8601 datetimes.
 * Anchors date-only to UTC midnight so the server's timezone can't
 * shift the value by a day.
 */
export const dateField = z.preprocess(
  (v) => {
    if (v instanceof Date) return v;
    if (typeof v !== 'string') return v;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00.000Z`);
    return new Date(v);
  },
  z.date().refine((d) => !isNaN(d.getTime()), { message: 'startDate/endDate must be a valid date' }),
);

export const batchNameField = z
  .string()
  .trim()
  .min(2, 'name must be at least 2 characters')
  .max(120, 'name must be 120 characters or fewer');

export const batchDescriptionField = z.string().max(1000).optional().default('');

export const batchIsActiveField = z.boolean().optional().default(true);

// ─── Base shape (no refinements — safe to .partial()) ──────────────────────

export const batchBaseShape = {
  name: batchNameField,
  description: batchDescriptionField,
  startDate: dateField,
  endDate: dateField,
  isActive: batchIsActiveField,
};

// ─── Create schema: base shape + cross-field refinement ────────────────────

export const createBatchSchema = z.object(batchBaseShape).refine(
  (data) => data.endDate.getTime() > data.startDate.getTime(),
  { message: 'endDate must be after startDate', path: ['endDate'] },
);

// ─── Update schema: partial base shape + conditional cross-field refinement ─
//
// `.partial()` is called on the BASE SHAPE (a plain object literal),
// not on the refined create schema, so it doesn't trigger Zod v4's
// "cannot .partial() on refined schema" error. The shape is wrapped
// in `.superRefine()` which only enforces date-order when both
// fields are present (otherwise a single-field PATCH would fail
// because we can't validate an endDate against a missing startDate).
//
// We also apply the same field-level validators (name min/max, etc.)
// since they all live in the base shape and `.partial()` preserves them.

export const updateBatchSchema = z.object(batchBaseShape).partial().superRefine((data, ctx) => {
  // Only enforce the cross-field date order when both dates are
  // supplied in the same PATCH. Single-field updates skip this
  // check (we'd need to load the existing Batch to compare).
  if (data.startDate && data.endDate && data.endDate.getTime() <= data.startDate.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'endDate must be after startDate',
      path: ['endDate'],
    });
  }
});