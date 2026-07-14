/**
 * golden-ticket-admin.resolve.test.ts — unit tests for the
 * POST /api/admin/golden-tickets/:id/resolve endpoint when called
 * with a `text` body field (v1.71 modal-first resolve).
 *
 * Why this test exists:
 *   The admin modal-first resolve flow passes the admin's written
 *   answer to the resolve endpoint, which stores it as the first
 *   goldenResolutions[] entry. These tests pin the contract:
 *   - text present → pushed to goldenResolutions[] BEFORE the
 *     status flips to Resolved
 *   - text absent → still resolves, but goldenResolutions[] stays
 *     empty (legacy / no-answer behaviour)
 *   - SP is NEVER charged (spendSpurtiPoints not called)
 *   - The user gets an in-app bell notification regardless of
 *     whether text was provided (both paths notify, but only the
 *     text path marks notificationSent: true on the entry)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';

// ─── Mocks ─────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const state: { capturedDoc: any } = { capturedDoc: null };
  return {
    state,
    spendSpy: vi.fn(async () => undefined),
    findByIdMock: vi.fn(async () => state.capturedDoc),
    // v1.73 — capture the payload of every notifyUser() call so the
    // test can assert the deep-link target.
    notifyCalls: [] as Array<{
      userId: unknown;
      link: string;
      title: string;
      metadata: Record<string, unknown>;
    }>,
  };
});

vi.mock('../modules/support/support-request.model.js', () => ({
  default: {
    findById: mocks.findByIdMock,
  },
}));

vi.mock('../modules/auth/user.model.js', () => ({
  default: {
    findById: vi.fn(async () => null),
  },
}));

vi.mock('../modules/program/promotion.service.js', () => ({
  spendSpurtiPoints: (...args: unknown[]): Promise<void> => {
    return mocks.spendSpy(...(args as Parameters<typeof mocks.spendSpy>));
  },
}));

vi.mock('../modules/support/support-core.controller.js', () => ({
  getAuthedUserId: (): Types.ObjectId => new Types.ObjectId('0000000000000000000000aa'),
  getAuthedUserRole: (): string => 'admin',
  stripAdminOnlyFields: (obj: unknown): unknown => obj,
  logAdminAction: async (): Promise<void> => undefined,
  // v1.73 — capture each call so the test can assert the
  // /golden/ticket/<id> deep link. The promise still resolves with
  // undefined so callers don't see a difference.
  notifyUser: async (
    userId: unknown,
    payload: { link: string; title: string; metadata: Record<string, unknown> },
  ): Promise<void> => {
    mocks.notifyCalls.push({
      userId,
      link: payload.link,
      title: payload.title,
      metadata: payload.metadata,
    });
  },
  isGoldenTicket: (req: { isGolden?: boolean }): boolean => Boolean(req.isGolden),
}));

// Mock the logger so test runs don't write to console. The
// controller's catch block calls adminLog.error — having a stub
// keeps test output clean without changing behaviour.
vi.mock('../utils/http/logger.js', () => ({
  adminLog: { error: (): void => undefined },
}));

// ─── Imports under test ────────────────────────────────────────────────

import { resolveGoldenTicket } from '../modules/support/golden-ticket-admin.controller.js';

// ─── Test helpers ──────────────────────────────────────────────────────

function makeRes() {
  const res: Partial<Response> & { _status?: number; _body?: unknown } = {
    status(code: number) {
      this._status = code;
      return this as Response;
    },
    json(body: unknown) {
      if (this._status === undefined) this._status = 200;
      this._body = body;
      return this as Response;
    },
  };
  return res as Response & { _status?: number; _body?: unknown };
}

function setCaptured(doc: any): void {
  mocks.state.capturedDoc = doc;
  mocks.findByIdMock.mockImplementation(async () => mocks.state.capturedDoc);
}

function makeReq(opts: { body?: unknown; status?: string }): Request {
  const doc: any = {
    _id: new Types.ObjectId(),
    isGolden: true,
    status: opts.status ?? 'Pending',
    spCost: 4,
    userId: new Types.ObjectId('0000000000000000000000bb'),
    goldenResolutions: [],
    statusHistory: [],
    save: vi.fn(async function saveMock(this: unknown): Promise<unknown> {
      return this;
    }),
    // The controller calls request.toObject() before sending the
    // response. Provide it so the mock matches the Mongoose Document
    // contract — strip the helper fns from the snapshot.
    toObject: function toObject(this: any): Record<string, unknown> {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(this)) {
        if (k !== 'save' && k !== 'toObject') out[k] = this[k];
      }
      return out;
    },
  };
  setCaptured(doc);

  return {
    params: { id: doc._id.toString() },
    body: opts.body ?? {},
    user: {
      _id: new Types.ObjectId('0000000000000000000000aa'),
      id: '0000000000000000000000aa',
      role: 'admin',
      name: 'Test Admin',
      email: 'admin@test.local',
    },
  } as unknown as Request;
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('resolveGoldenTicket (modal-first, v1.71)', () => {
  beforeEach(() => {
    mocks.spendSpy.mockClear();
    mocks.findByIdMock.mockReset();
    mocks.notifyCalls.length = 0;
  });

  it('captures the admin answer as the first goldenResolutions entry', async () => {
    const req = makeReq({
      body: { text: 'Try restarting your router; the issue is on our end.' },
    });
    const res = makeRes();

    await resolveGoldenTicket(req, res);

    expect(res._status).toBe(200);
    expect(mocks.state.capturedDoc.status).toBe('Resolved');
    expect(mocks.state.capturedDoc.goldenResolutions).toHaveLength(1);
    expect(mocks.state.capturedDoc.goldenResolutions[0]).toMatchObject({
      text: 'Try restarting your router; the issue is on our end.',
      adminName: 'Test Admin',
      notificationSent: true,
    });
  });

  it('NEVER calls spendSpurtiPoints (SP is paid once at raise-time only)', async () => {
    const req = makeReq({ body: { text: 'Answer text here' } });
    const res = makeRes();
    await resolveGoldenTicket(req, res);
    expect(mocks.spendSpy).not.toHaveBeenCalled();
  });

  it('still resolves without text (legacy / no-answer behaviour)', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();

    await resolveGoldenTicket(req, res);

    expect(res._status).toBe(200);
    expect(mocks.state.capturedDoc.status).toBe('Resolved');
    expect(mocks.state.capturedDoc.goldenResolutions).toHaveLength(0);
    expect(mocks.spendSpy).not.toHaveBeenCalled();
  });

  it('trims text longer than 2000 chars (defence-in-depth)', async () => {
    const big = 'x'.repeat(2500);
    const req = makeReq({ body: { text: big } });
    const res = makeRes();
    await resolveGoldenTicket(req, res);
    expect(mocks.state.capturedDoc.goldenResolutions[0].text.length).toBeLessThanOrEqual(2000);
  });

  it('does not call spendSpurtiPoints even on big text', async () => {
    const req = makeReq({ body: { text: 'x'.repeat(1999) } });
    const res = makeRes();
    await resolveGoldenTicket(req, res);
    expect(mocks.spendSpy).not.toHaveBeenCalled();
  });

  it('is idempotent on already-Resolved tickets', async () => {
    const req = makeReq({ status: 'Resolved', body: { text: 'second resolve' } });
    const res = makeRes();
    await resolveGoldenTicket(req, res);
    expect(res._status).toBe(200);
    // Idempotent path should NOT append to resolutions — that would
    // be a duplicate answer. Admins must use /re-resolve for that.
    expect(mocks.state.capturedDoc.goldenResolutions).toHaveLength(0);
  });

  // v1.73 — The in-app bell notification must deep-link to the
  // dedicated Golden ticket thread page so the user actually sees
  // the admin answer (the generic /support/:id page does NOT render
  // goldenResolutions[]). Regression guard: any future PR that
  // flips the link back to /support/<id> fails here.
  it('posts the in-app bell with link /golden/ticket/<id> (with-answer path)', async () => {
    const req = makeReq({
      body: { text: 'Try a different network.' },
    });
    const res = makeRes();
    await resolveGoldenTicket(req, res);
    expect(mocks.notifyCalls.length).toBe(1);
    expect(mocks.notifyCalls[0].link).toBe(
      '/golden/ticket/' + mocks.state.capturedDoc._id.toString()
    );
  });

  it('posts the in-app bell with link /golden/ticket/<id> (no-answer path)', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await resolveGoldenTicket(req, res);
    expect(mocks.notifyCalls.length).toBe(1);
    expect(mocks.notifyCalls[0].link).toBe(
      '/golden/ticket/' + mocks.state.capturedDoc._id.toString()
    );
  });
});
