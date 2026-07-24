/**
 * golden-ticket-admin.reresolve.test.ts — unit tests for the
 * POST /api/admin/golden-tickets/:id/re-resolve endpoint.
 *
 * Why this test exists:
 *   The re-resolve endpoint is the only Golden Ticket admin action
 *   that intentionally NEVER charges SP and NEVER changes status.
 *   A future refactor that adds `spendSpurtiPoints(...)` here would
 *   silently break the "user pays once at raise-time" invariant.
 *   These tests pin the contract so that regression can't slip in.
 *
 * We mock the SupportRequest model + the SP-spend helper, invoke the
 * real controller, and assert:
 *   - Only `Resolved` tickets can be re-resolved
 *   - On success, goldenResolutions[] gets a new entry
 *   - spendSpurtiPoints is NEVER called
 *   - The response carries noSpCharged: true
 *   - On a non-Resolved status, the endpoint returns 409
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';

// ─── Mocks (paths relative to THIS test file) ───────────────────────────

// `vi.mock` factories are hoisted to the top of the file, but they
// run BEFORE top-level `const`/`let` initialisers. Any shared mock
// state has to live inside `vi.hoisted(...)` so it's available at
// hoisting time. See: https://vitest.dev/api/vi.html#vi-hoisted
const mocks = vi.hoisted(() => {
  // We construct the mutable state object first, then let the
  // findByIdMock factory close over it. The vi.fn in this scope
  // is hoisted by vitest, so the reference is stable across the
  // hoisting dance.
  const state: { capturedDoc: any } = { capturedDoc: null };
  return {
    state,
    spendSpy: vi.fn(async () => undefined),
    findByIdMock: vi.fn(async () => state.capturedDoc),
    // v1.73 — capture every notifyUser() call so the test can assert
    // the /golden/ticket/<id> deep link.
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

// Stub the User model with a minimal shape so loading the controller
// doesn't try to register a real Mongoose model (which would buffer
// until a connection is available and time out the test).
vi.mock('../modules/auth/user.model.js', () => ({
  default: {
    findById: vi.fn(async () => null),
  },
}));

// spendSpurtiPoints is the function we MUST NOT call from re-resolve.
vi.mock('../modules/program/promotion.service.js', () => ({
  spendSpurtiPoints: (...args: unknown[]): Promise<void> => {
    return mocks.spendSpy(...(args as Parameters<typeof mocks.spendSpy>));
  },
}));

// logAdminAction + notifyUser are fire-and-forget side effects; mock
// them so the test doesn't try to touch real Notification / AdminLog
// collections. v1.73 — notifyUser captures its payload so the test
// can assert the /golden/ticket/<id> deep link.
vi.mock('../modules/support/support-core.controller.js', () => ({
  getAuthedUserId: (): Types.ObjectId => new Types.ObjectId('0000000000000000000000aa'),
  getAuthedUserRole: (): string => 'admin',
  stripAdminOnlyFields: (obj: unknown): unknown => obj,
  logAdminAction: async (): Promise<void> => undefined,
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
  // v1.74 — re-resolve opens the discussion window on the very
  // first admin text reply. The existing tests don't assert the
  // window math; stub it to identity so any timestamp passthrough
  // works without surprise.
  computeDiscussionClosesAt: (when: Date): Date => when,
  isDiscussionOpen: (): boolean => true,
}));

// ─── Imports under test ──────────────────────────────────────────────────

import { reResolveGoldenTicket } from '../modules/support/golden-ticket-admin.controller.js';

// ─── Test helpers ────────────────────────────────────────────────────────

function makeRes() {
  const res: Partial<Response> & { _status?: number; _body?: unknown } = {
    status(code: number) {
      this._status = code;
      return this as Response;
    },
    json(body: unknown) {
      // Mirror Express behaviour: if the controller calls res.json()
      // without res.status() first, the default status code is 200.
      if (this._status === undefined) this._status = 200;
      this._body = body;
      return this as Response;
    },
  };
  return res as Response & { _status?: number; _body?: unknown };
}

// Every test routes `findById` through `mocks.findByIdMock` (declared
// in the mocks block above). `setCaptured` rebinds the mock so the
// next call returns the given document — useful for driving the
// "not found" case (pass null) without mutating shared state.
function setCaptured(doc: any): void {
  mocks.state.capturedDoc = doc;
  mocks.findByIdMock.mockImplementation(async () => mocks.state.capturedDoc);
}

function makeReq(opts: {
  ticketId?: string;
  body?: unknown;
  status?: string;
  isGolden?: boolean;
  existingResolutions?: unknown[];
}): Request {
  const ticketId = opts.ticketId ?? new Types.ObjectId().toString();
  const doc: any = {
    _id: new Types.ObjectId(ticketId),
    isGolden: opts.isGolden ?? true,
    status: opts.status ?? 'Resolved',
    spCost: 4,
    userId: new Types.ObjectId('0000000000000000000000bb'),
    goldenResolutions: Array.isArray(opts.existingResolutions) ? opts.existingResolutions : [],
    // v1.74 — discussion thread defaults. The controller appends
    // to `goldenTicketDiscussion` on every re-resolve, so the
    // mock doc has to start with an array. The window timestamps
    // are null until the very first admin answer lands.
    goldenTicketDiscussion: [],
    firstAdminAnswerAt: null,
    discussionClosesAt: null,
    save: vi.fn(async function saveMock(this: unknown): Promise<unknown> {
      return this;
    }),
  };
  setCaptured(doc);

  return {
    params: { id: ticketId },
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

// ─── Tests ───────────────────────────────────────────────────────────────

describe('reResolveGoldenTicket', () => {
  beforeEach(() => {
    mocks.spendSpy.mockClear();
    mocks.findByIdMock.mockReset();
    mocks.notifyCalls.length = 0;
  });

  it('appends an entry to goldenResolutions when ticket is Resolved', async () => {
    const req = makeReq({
      body: { text: 'Following up — please try the alternate URL.' },
    });
    const res = makeRes();

    await reResolveGoldenTicket(req, res);

    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({
      ok: true,
      noSpCharged: true,
      entry: expect.objectContaining({
        adminName: 'Test Admin',
      }),
    });
    // goldenResolutions has exactly one new entry, with notificationSent=true
    expect(mocks.state.capturedDoc.goldenResolutions).toHaveLength(1);
    expect(mocks.state.capturedDoc.goldenResolutions[0]).toMatchObject({
      text: 'Following up — please try the alternate URL.',
      adminName: 'Test Admin',
      notificationSent: true,
    });
  });

  it('NEVER calls spendSpurtiPoints (SP is charged once at raise-time only)', async () => {
    const req = makeReq({ body: { text: 'extra context' } });
    const res = makeRes();

    await reResolveGoldenTicket(req, res);

    expect(mocks.spendSpy).not.toHaveBeenCalled();
  });

  it('returns 409 when ticket is not in Resolved status', async () => {
    for (const status of ['Pending', 'Rejected', 'closed', 'In Review', 'open']) {
      const req = makeReq({ status, body: { text: 'shouldnt go through' } });
      const res = makeRes();
      await reResolveGoldenTicket(req, res);
      expect(res._status).toBe(409);
    }
    expect(mocks.spendSpy).not.toHaveBeenCalled();
  });

  it('returns 400 when text is empty or missing', async () => {
    for (const body of [{}, { text: '' }, { text: '   ' }, { text: 'x'.repeat(2001) }]) {
      const req = makeReq({ body });
      const res = makeRes();
      await reResolveGoldenTicket(req, res);
      expect(res._status).toBe(400);
    }
    expect(mocks.spendSpy).not.toHaveBeenCalled();
  });

  it('returns 404 when the ticket does not exist', async () => {
    // Bypass makeReq: we want the mock to return null, not a freshly
    // built doc. Setting state.capturedDoc directly is sufficient
    // because findByIdMock closes over it.
    mocks.state.capturedDoc = null;
    const req = {
      params: { id: new Types.ObjectId().toString() },
      body: { text: 'irrelevant' },
      user: {
        _id: new Types.ObjectId('0000000000000000000000aa'),
        id: '0000000000000000000000aa',
        role: 'admin',
        name: 'Test Admin',
        email: 'admin@test.local',
      },
    } as unknown as Request;
    const res = makeRes();
    await reResolveGoldenTicket(req, res);
    expect(res._status).toBe(404);
  });

  it('returns 409 when the ticket is not a Golden ticket', async () => {
    const req = makeReq({ isGolden: false, body: { text: 'x' } });
    const res = makeRes();
    await reResolveGoldenTicket(req, res);
    expect(res._status).toBe(409);
  });

  it('appends to existing goldenResolutions (does not overwrite)', async () => {
    const existing = [
      {
        text: 'first follow-up',
        adminId: new Types.ObjectId(),
        adminName: 'Earlier Admin',
        createdAt: new Date('2026-06-01T00:00:00Z'),
        notificationSent: true,
      },
    ];
    const req = makeReq({ body: { text: 'second follow-up' }, existingResolutions: existing });
    const res = makeRes();
    await reResolveGoldenTicket(req, res);
    expect(res._status).toBe(200);
    expect(mocks.state.capturedDoc.goldenResolutions).toHaveLength(2);
    expect(mocks.state.capturedDoc.goldenResolutions[0].text).toBe('first follow-up');
    expect(mocks.state.capturedDoc.goldenResolutions[1].text).toBe('second follow-up');
  });

  // v1.73 — The re-resolve bell must also deep-link to the dedicated
  // Golden ticket thread page so the user can read the new follow-up
  // answer. Regression guard.
  it('posts the in-app bell with link /golden/ticket/<id>', async () => {
    const req = makeReq({ body: { text: 'one more attempt' } });
    const res = makeRes();
    await reResolveGoldenTicket(req, res);
    expect(mocks.notifyCalls.length).toBe(1);
    expect(mocks.notifyCalls[0].link).toBe(
      '/golden/ticket/' + mocks.state.capturedDoc._id.toString()
    );
  });
});
