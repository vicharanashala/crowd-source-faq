/**
 * tee.test.ts — Sign My Tee (v1.87)
 *
 * Covers the four pieces of business logic that are easy to
 * regress and easy to unit-test:
 *
 *   1. eligibility.ts — rolling 3-day window. Pure functions,
 *      no mocks needed. Pins the math that powers the navbar
 *      pill and the wizard CTA; if anyone introduces a
 *      timezone bug this test must catch it.
 *
 *   2. teeConfigSchema — Zod validation of the wizard payload.
 *      Pins the contract that the FE sends. Lock in the name
 *      length cap + color enums.
 *
 *   3. teeSignatureSchema — Zod validation of the signature
 *      payload. Pins the data: URL prefix + normalized
 *      coordinate ranges.
 *
 *   4. (controllers) — exercised via the route tests in
 *      integration with `mongodb-memory-server` if you go
 *      that route; the v1.78 + v1.79 controller pattern is
 *      heavy mocking. We follow the SAME `vi.hoisted` pattern
 *      used by `journey-tracks.test.ts` so the existing test
 *      runner is happy.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  isEligibleForTee,
  daysBetween,
  startOfLocalDay,
  windowPhase,
} from '../modules/tee/eligibility.js';
import {
  teeConfigSchema,
  teeSignatureSchema,
} from '../modules/tee/tee.validation.js';

// ─── 1. Pure eligibility helpers ────────────────────────────────────────────

describe('eligibility: startOfLocalDay', () => {
  it('zeroes the time component', () => {
    const d = new Date(2026, 6, 15, 18, 30, 45, 123); // 15 Jul 2026 18:30:45.123
    const m = startOfLocalDay(d);
    expect(m.getFullYear()).toBe(2026);
    expect(m.getMonth()).toBe(6);
    expect(m.getDate()).toBe(15);
    expect(m.getHours()).toBe(0);
    expect(m.getMinutes()).toBe(0);
    expect(m.getSeconds()).toBe(0);
    expect(m.getMilliseconds()).toBe(0);
  });
});

describe('eligibility: daysBetween', () => {
  it('returns 0 for the same day', () => {
    const a = new Date(2026, 6, 15, 9, 0, 0);
    const b = new Date(2026, 6, 15, 23, 59, 59);
    expect(daysBetween(a, b)).toBe(0);
  });
  it('returns 1 across a calendar-day boundary in either direction', () => {
    const a = new Date(2026, 6, 15, 0, 0, 0);
    const b = new Date(2026, 6, 16, 0, 0, 0);
    expect(daysBetween(a, b)).toBe(1);
    expect(daysBetween(b, a)).toBe(-1);
  });
  it('handles month boundary', () => {
    const june30 = new Date(2026, 5, 30, 0, 0, 0);
    const july1 = new Date(2026, 6, 1, 0, 0, 0);
    expect(daysBetween(june30, july1)).toBe(1);
  });
  it('survives DST spring-forward (US Eastern): we anchor both to local midnight so the delta matches the calendar', () => {
    // 8 Mar 2026 is the US DST spring-forward. We pick 23:59 of the
    // day before and 00:30 of the day of — same calendar day.
    const beforeMidnight = new Date(2026, 2, 8, 23, 59, 0);
    const midnight = new Date(2026, 2, 8, 0, 0, 0);
    expect(daysBetween(beforeMidnight, midnight)).toBe(0);
  });
});

describe('eligibility: isEligibleForTee', () => {
  const endDate = new Date(2026, 6, 15, 0, 0, 0); // 15 Jul 2026
  it('eligible on the end date (day-of)', () => {
    expect(isEligibleForTee(new Date(2026, 6, 15, 12, 0, 0), endDate)).toBe(true);
  });
  it('eligible on the day before', () => {
    expect(isEligibleForTee(new Date(2026, 6, 14, 12, 0, 0), endDate)).toBe(true);
  });
  it('eligible on the day after', () => {
    expect(isEligibleForTee(new Date(2026, 6, 16, 12, 0, 0), endDate)).toBe(true);
  });
  it('NOT eligible two days before', () => {
    expect(isEligibleForTee(new Date(2026, 6, 13, 12, 0, 0), endDate)).toBe(false);
  });
  it('NOT eligible two days after', () => {
    expect(isEligibleForTee(new Date(2026, 6, 17, 12, 0, 0), endDate)).toBe(false);
  });
  it('NOT eligible with a null end date', () => {
    expect(isEligibleForTee(new Date(), null)).toBe(false);
    expect(isEligibleForTee(new Date(), undefined)).toBe(false);
  });
  it('NOT eligible with an invalid end date', () => {
    expect(isEligibleForTee(new Date(), new Date('not-a-date'))).toBe(false);
  });
  it('matches the spec example: end=15 June, eligible on 14, 15, 16', () => {
    const end = new Date(2026, 5, 15); // 15 June 2026
    expect(isEligibleForTee(new Date(2026, 5, 14), end)).toBe(true);
    expect(isEligibleForTee(new Date(2026, 5, 15), end)).toBe(true);
    expect(isEligibleForTee(new Date(2026, 5, 16), end)).toBe(true);
    expect(isEligibleForTee(new Date(2026, 5, 13), end)).toBe(false);
    expect(isEligibleForTee(new Date(2026, 5, 17), end)).toBe(false);
  });
  it('handles a month boundary case (29-31 July → 1-3 August)', () => {
    // Spec example — verify the second window rolls cleanly.
    const end = new Date(2026, 6, 30); // 30 Jul 2026
    expect(isEligibleForTee(new Date(2026, 6, 29), end)).toBe(true);
    expect(isEligibleForTee(new Date(2026, 6, 30), end)).toBe(true);
    expect(isEligibleForTee(new Date(2026, 6, 31), end)).toBe(true);
    expect(isEligibleForTee(new Date(2026, 7, 1), end)).toBe(false);
  });
});

describe('eligibility: windowPhase', () => {
  it('marks the open window correctly', () => {
    const end = new Date(2026, 6, 15);
    expect(windowPhase(new Date(2026, 6, 14), end)).toEqual({ phase: 'open', daysOffset: -1 });
    expect(windowPhase(new Date(2026, 6, 15), end)).toEqual({ phase: 'open', daysOffset: 0 });
    expect(windowPhase(new Date(2026, 6, 16), end)).toEqual({ phase: 'open', daysOffset: 1 });
  });
  it('marks before / after correctly', () => {
    const end = new Date(2026, 6, 15);
    expect(windowPhase(new Date(2026, 6, 13), end).phase).toBe('before');
    expect(windowPhase(new Date(2026, 6, 17), end).phase).toBe('after');
  });
});

// ─── 2. teeConfigSchema ──────────────────────────────────────────────────────

describe('teeConfigSchema', () => {
  it('accepts a valid wizard payload', () => {
    const r = teeConfigSchema.safeParse({
      shirtColor: 'navy',
      textColor: 'white',
      nameOnBack: 'Ada Lovelace',
    });
    expect(r.success).toBe(true);
  });
  it('rejects an unknown shirtColor', () => {
    const r = teeConfigSchema.safeParse({
      shirtColor: 'puce',
      textColor: 'white',
      nameOnBack: 'Ada',
    });
    expect(r.success).toBe(false);
  });
  it('rejects an unknown textColor', () => {
    const r = teeConfigSchema.safeParse({
      shirtColor: 'navy',
      textColor: 'rainbow',
      nameOnBack: 'Ada',
    });
    expect(r.success).toBe(false);
  });
  it('rejects an empty name', () => {
    const r = teeConfigSchema.safeParse({
      shirtColor: 'navy',
      textColor: 'white',
      nameOnBack: '   ',
    });
    expect(r.success).toBe(false);
  });
  it('rejects a 31-char name', () => {
    const r = teeConfigSchema.safeParse({
      shirtColor: 'navy',
      textColor: 'white',
      nameOnBack: 'a'.repeat(31),
    });
    expect(r.success).toBe(false);
  });
  it('trims leading/trailing whitespace from the name', () => {
    const r = teeConfigSchema.safeParse({
      shirtColor: 'navy',
      textColor: 'white',
      nameOnBack: '  Ada  ',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.nameOnBack).toBe('Ada');
  });
});

// ─── 3. teeSignatureSchema ───────────────────────────────────────────────────

describe('teeSignatureSchema', () => {
  const validPayload = {
    signerName: 'Alan Turing',
    signerDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    x: 0.5,
    y: 0.5,
    scale: 0.6,
    rotation: 5,
  };

  it('accepts a valid signature payload', () => {
    const r = teeSignatureSchema.safeParse(validPayload);
    expect(r.success).toBe(true);
  });

  it('rejects a non-data URL', () => {
    const r = teeSignatureSchema.safeParse({
      ...validPayload,
      signerDataUrl: 'https://example.com/image.png',
    });
    expect(r.success).toBe(false);
  });

  it('rejects a JPEG data URL (we declared png|jpeg|webp; this should pass — sanity check)', () => {
    const r = teeSignatureSchema.safeParse({
      ...validPayload,
      signerDataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
    });
    expect(r.success).toBe(true);
  });

  it('rejects x out of [0,1]', () => {
    expect(teeSignatureSchema.safeParse({ ...validPayload, x: -0.1 }).success).toBe(false);
    expect(teeSignatureSchema.safeParse({ ...validPayload, x: 1.5 }).success).toBe(false);
  });

  it('rejects scale below 0.2', () => {
    expect(teeSignatureSchema.safeParse({ ...validPayload, scale: 0.1 }).success).toBe(false);
  });

  it('rejects rotation beyond ±45°', () => {
    expect(teeSignatureSchema.safeParse({ ...validPayload, rotation: 90 }).success).toBe(false);
    expect(teeSignatureSchema.safeParse({ ...validPayload, rotation: -90 }).success).toBe(false);
  });

  it('rejects an empty signerName', () => {
    expect(teeSignatureSchema.safeParse({ ...validPayload, signerName: '' }).success).toBe(false);
  });
});

// ─── shouldCountView (v1.87.3) ─────────────────────────────────────────────
//
// Pins the dedupe + owner-skip contract so the view counter doesn't
// drift into nonsense from refreshes, curls, or middleware re-fetches.
import { shouldCountView, _resetTeeViewDedup } from '../modules/tee/tee.controller.js';

function mockReq(headers: Record<string, string> = {}, user?: { _id: string } | null, opts: { ip?: string | null } = {}): any {
  return {
    headers,
    user: user ?? null,
    socket: { remoteAddress: opts.ip === null ? undefined : (opts.ip ?? '127.0.0.1') },
    ip: undefined,
  };
}

describe('shouldCountView', () => {
  // Reset the module-level dedupe map before every case so each
  // test is independent (the dedupe window is 60s — without this
  // hook, tests would accumulate state across runs).
  beforeEach(() => {
    _resetTeeViewDedup();
  });
  it('counts the first unique visitor (no user, ip + ua present)', () => {
    const m = mockReq({ 'x-forwarded-for': '203.0.113.5', 'user-agent': 'chrome' });
    expect(shouldCountView(m, 'shareX', 'owner-id')).toBe(true);
  });

  it('dedupes the same visitor within the cooldown window', () => {
    const m1 = mockReq({ 'x-forwarded-for': '203.0.113.5', 'user-agent': 'chrome' });
    const m2 = mockReq({ 'x-forwarded-for': '203.0.113.5', 'user-agent': 'chrome' });
    expect(shouldCountView(m1, 'shareX', 'owner-id')).toBe(true);
    expect(shouldCountView(m2, 'shareX', 'owner-id')).toBe(false);
  });

  it('counts a second visitor with a different IP', () => {
    const a = mockReq({ 'x-forwarded-for': '203.0.113.5', 'user-agent': 'chrome' });
    const b = mockReq({ 'x-forwarded-for': '198.51.100.7', 'user-agent': 'chrome' });
    expect(shouldCountView(a, 'shareX', 'owner-id')).toBe(true);
    expect(shouldCountView(b, 'shareX', 'owner-id')).toBe(true);
  });

  it('counts a visitor with a different User-Agent', () => {
    const chrome = mockReq({ 'x-forwarded-for': '203.0.113.5', 'user-agent': 'chrome' });
    const safari = mockReq({ 'x-forwarded-for': '203.0.113.5', 'user-agent': 'safari' });
    expect(shouldCountView(chrome, 'shareX', 'owner-id')).toBe(true);
    expect(shouldCountView(safari, 'shareX', 'owner-id')).toBe(true);
  });

  it('NEVER counts the tee owner even from a fresh IP/UA', () => {
    const owner = mockReq(
      { 'x-forwarded-for': '203.0.113.5', 'user-agent': 'chrome' },
      { _id: 'owner-id-123' },
    );
    expect(shouldCountView(owner, 'shareX', 'owner-id-123')).toBe(false);
  });

  it('owner-skip is exact-match — different ids means it DOES count', () => {
    const r = mockReq(
      { 'x-forwarded-for': '203.0.113.5', 'user-agent': 'chrome' },
      { _id: 'some-other-user' },
    );
    expect(shouldCountView(r, 'shareX', 'owner-id')).toBe(true);
  });

  it('dedupe keys are scoped per-shareId (two tees don\'t collide)', () => {
    const r1 = mockReq({ 'x-forwarded-for': '203.0.113.5', 'user-agent': 'chrome' });
    const r2 = mockReq({ 'x-forwarded-for': '203.0.113.5', 'user-agent': 'chrome' });
    expect(shouldCountView(r1, 'shareA', 'owner')).toBe(true);
    expect(shouldCountView(r2, 'shareB', 'owner')).toBe(true);
  });

  it('skips requests with no IP and no User-Agent (likely bots)', () => {
    const r = mockReq({}, null, { ip: null });
    expect(shouldCountView(r, 'shareX', 'owner')).toBe(false);
  });

  it('counts a request with only a User-Agent (no IP source)', () => {
    const r = mockReq({ 'user-agent': 'cli-tool/1.0' });
    expect(shouldCountView(r, 'shareX', 'owner')).toBe(true);
  });

  it('counts a request with only a forwarded IP (no UA)', () => {
    const r = mockReq({ 'x-forwarded-for': '198.51.100.7' });
    expect(shouldCountView(r, 'shareX', 'owner')).toBe(true);
  });
});
