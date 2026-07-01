/**
 * batch.schema.test — both create and update paths.
 *
 * The original Zod schema required full ISO 8601 datetimes via
 * `z.string().datetime()`, but the admin dashboard sends date-only
 * strings from `<input type="date">` ("YYYY-MM-DD"). The fix:
 * `dateField` accepts both forms, anchoring date-only to UTC midnight.
 *
 * Also covers the Zod v4 `.partial()` constraint: `.partial()` on a
 * refined schema throws. We split into a base shape (refinement-free)
 * + per-endpoint refinement, so updateSchema can be built via
 * `.partial()` on the unrefined base.
 *
 * Tests import the production schemas directly (no duplication), so
 * schema drift between source and test is impossible.
 */
import { describe, it, expect } from 'vitest';
import { createBatchSchema, updateBatchSchema } from '../batch.schema.js';

describe('createBatchSchema', () => {
  it('accepts date-only "YYYY-MM-DD" (HTML5 input type=date output)', () => {
    const r = createBatchSchema.safeParse({
      name: 'Monsoonship',
      description: 'The self-paced batch',
      startDate: '2026-07-01',
      endDate: '2026-12-31',
      isActive: true,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.startDate).toBeInstanceOf(Date);
      expect(r.data.endDate).toBeInstanceOf(Date);
      expect(r.data.startDate.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect(r.data.endDate.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    }
  });

  it('accepts full ISO 8601 datetime with timezone', () => {
    const r = createBatchSchema.safeParse({
      name: 'Test',
      startDate: '2026-07-01T00:00:00.000Z',
      endDate:   '2026-12-31T23:59:59.999Z',
    });
    expect(r.success).toBe(true);
  });

  it('accepts native Date objects', () => {
    const r = createBatchSchema.safeParse({
      name: 'Test',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-12-31'),
    });
    expect(r.success).toBe(true);
  });

  it('rejects endDate == startDate', () => {
    const r = createBatchSchema.safeParse({
      name: 'Test',
      startDate: '2026-07-01',
      endDate: '2026-07-01',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const orderIssue = r.error.issues.find((i) => i.path[0] === 'endDate');
      expect(orderIssue?.message).toMatch(/after startDate/i);
    }
  });

  it('rejects endDate before startDate', () => {
    const r = createBatchSchema.safeParse({
      name: 'Test',
      startDate: '2026-12-31',
      endDate: '2026-07-01',
    });
    expect(r.success).toBe(false);
  });

  it('rejects garbage date strings', () => {
    const r = createBatchSchema.safeParse({
      name: 'Test',
      startDate: 'not-a-date',
      endDate: '2026-12-31',
    });
    expect(r.success).toBe(false);
  });

  it('rejects name shorter than 2 chars', () => {
    const r = createBatchSchema.safeParse({
      name: 'A',
      startDate: '2026-07-01',
      endDate: '2026-12-31',
    });
    expect(r.success).toBe(false);
  });

  it('trims name whitespace before length validation', () => {
    const r = createBatchSchema.safeParse({
      name: '  Test  ',
      startDate: '2026-07-01',
      endDate: '2026-12-31',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('Test');
  });
});

describe('updateBatchSchema — partial base + conditional refinement', () => {
  it('accepts an empty patch (nothing to update is valid)', () => {
    const r = updateBatchSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('accepts a single-field patch (e.g. just rename)', () => {
    const r = updateBatchSchema.safeParse({ name: 'Renamed Batch' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe('Renamed Batch');
      expect(r.data.startDate).toBeUndefined();
      expect(r.data.endDate).toBeUndefined();
    }
  });

  it('accepts a single-field date patch without re-validating against the other', () => {
    // Single-field updates can't check date order because we don't
    // have the other date. The schema must allow this.
    const r1 = updateBatchSchema.safeParse({ startDate: '2026-08-15' });
    expect(r1.success).toBe(true);
    const r2 = updateBatchSchema.safeParse({ endDate: '2026-08-15' });
    expect(r2.success).toBe(true);
  });

  it('accepts both dates in correct order', () => {
    const r = updateBatchSchema.safeParse({
      startDate: '2026-07-01',
      endDate: '2026-12-31',
    });
    expect(r.success).toBe(true);
  });

  it('rejects both dates when endDate <= startDate', () => {
    const r = updateBatchSchema.safeParse({
      startDate: '2026-12-31',
      endDate: '2026-07-01',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const orderIssue = r.error.issues.find((i) => i.path[0] === 'endDate');
      expect(orderIssue?.message).toMatch(/after startDate/i);
    }
  });

  it('still applies per-field validation (name min length)', () => {
    const r = updateBatchSchema.safeParse({ name: 'A' });
    expect(r.success).toBe(false);
  });

  it('still applies per-field date validation (no garbage)', () => {
    const r = updateBatchSchema.safeParse({ startDate: 'garbage' });
    expect(r.success).toBe(false);
  });

  it('coerces date-only to UTC-anchored Date on update', () => {
    const r = updateBatchSchema.safeParse({ endDate: '2026-12-31' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.endDate).toBeInstanceOf(Date);
      expect(r.data.endDate?.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    }
  });
});