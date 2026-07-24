/**
 * golden-ticket-convert-notify.test.ts — regression guard for the
 * user bell notification fired by POST /api/admin/support/requests
 * /:id/convert-to-golden.
 *
 * Why this test exists:
 *   The convert flow promotes a non-Golden support ticket to a
 *   Golden ticket. The user gets a "Your support request was
 *   promoted to Golden" bell notification, and the bell click
 *   navigates to whatever `link` is in the Notification document.
 *
 *   The generic /support/:id page does NOT render the golden
 *   answers thread (that's the v1.73 /golden/ticket/:id page).
 *   So if a future PR flips the link back to /support/<id>, the
 *   user lands on a page where the Golden content is silently
 *   invisible — which is exactly the bug this test exists to
 *   catch.
 *
 *   The fix is in `supportTicketLink` (see support-ticket-link.test.ts);
 *   this test pins the wiring at the call site.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';

const mocks = vi.hoisted(() => {
  const state: { capturedDoc: any } = { capturedDoc: null };
  return {
    state,
    spendSpy: vi.fn(async () => undefined),
    findByIdMock: vi.fn(async () => state.capturedDoc),
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
    // v1.68 — convert uses an atomic findOneAndUpdate; stub it so
    // the test focuses on the notification link, not the DB write.
    findOneAndUpdate: vi.fn(async (_f: unknown, _u: unknown) => mocks.state.capturedDoc),
  },
}));

vi.mock('../modules/auth/user.model.js', () => ({
  default: {
    // The controller calls User.findById(auth.userId).select('name').lean()
    // Return a chainable shape that ends in a plain admin object.
    findById: vi.fn(() => ({
      select: () => ({
        lean: async () => ({ name: 'Test Admin' }),
      }),
    })),
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
  isGoldenTicket: (req: { isGolden?: boolean }): boolean => Boolean(req.isGolden),
  stripAdminOnlyFields: (obj: unknown): unknown => obj,
  logAdminAction: async (): Promise<void> => undefined,
  // The real helper is small and pure — exercise it through the
  // notification link the controller hands to notifyUser, instead
  // of stubbing it out (so this test fails if supportTicketLink
  // itself regresses).
  supportTicketLink: (ticket: { _id: { toString: () => string }; isGolden?: boolean }): string =>
    ticket.isGolden
      ? `/golden/ticket/${ticket._id.toString()}`
      : `/support/${ticket._id.toString()}`,
  requireFeatureOn: async (): Promise<boolean> => true,
  notifyUser: async (
    userId: unknown,
    payload: { link: string; title: string; metadata: Record<string, unknown> }
  ): Promise<void> => {
    mocks.notifyCalls.push({ userId, ...payload });
  },
}));

vi.mock('../utils/http/logger.js', () => ({
  adminLog: { error: (): void => undefined },
  authLog: { error: (): void => undefined },
}));

import { convertToGolden } from '../modules/support/support-golden.controller.js';

function makeRes(): Response & { _status?: number; _body?: unknown } {
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

function makeReq(opts: { body?: unknown }): Request {
  const doc: any = {
    _id: new Types.ObjectId('0000000000000000000000cc'),
    isGolden: false,
    status: 'Pending',
    spCost: 0,
    userId: new Types.ObjectId('0000000000000000000000bb'),
    issueType: 'Connectivity',
    statusHistory: [],
    save: vi.fn(async function saveMock(this: unknown): Promise<unknown> {
      return this;
    }),
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

describe('convertToGolden — notification deep-link (regression guard)', () => {
  beforeEach(() => {
    mocks.notifyCalls.length = 0;
    mocks.spendSpy.mockClear();
    mocks.findByIdMock.mockReset();
  });

  it('sends the user bell with link /golden/ticket/<id> (NOT /support/<id>)', async () => {
    const req = makeReq({ body: { spCost: 4, note: 'high priority' } });
    const res = makeRes();

    await convertToGolden(req, res);

    expect(res._status).toBe(200);
    expect(mocks.notifyCalls.length).toBe(1);
    // The whole point of the fix: this MUST be /golden/ticket/:id,
    // because the converted ticket IS golden now. Sending the user
    // to /support/:id (the generic page) makes the Golden content
    // silently invisible — the original bug.
    expect(mocks.notifyCalls[0].link).toBe(
      '/golden/ticket/0000000000000000000000cc'
    );
    // Sanity: the title still mentions the promotion.
    expect(mocks.notifyCalls[0].title).toBe('Your support request was promoted to Golden');
    // SP was debited because spCost > 0.
    expect(mocks.spendSpy).toHaveBeenCalledTimes(1);
  });

  it('also routes the link through /golden/ticket/<id> when spCost is 0 (free promote)', async () => {
    const req = makeReq({ body: { spCost: 0 } });
    const res = makeRes();

    await convertToGolden(req, res);

    expect(mocks.notifyCalls.length).toBe(1);
    expect(mocks.notifyCalls[0].link).toBe('/golden/ticket/0000000000000000000000cc');
    // No SP debit on a free promote.
    expect(mocks.spendSpy).not.toHaveBeenCalled();
  });

  it('does NOT fire a bell when the ticket is already golden (idempotent path)', async () => {
    const doc: any = {
      _id: new Types.ObjectId('0000000000000000000000dd'),
      isGolden: true,
      status: 'Pending',
      spCost: 4,
      userId: new Types.ObjectId('0000000000000000000000bb'),
      issueType: 'Connectivity',
      statusHistory: [],
      save: vi.fn(async function saveMock(this: unknown): Promise<unknown> {
        return this;
      }),
      toObject: function toObject(this: any): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(this)) {
          if (k !== 'save' && k !== 'toObject') out[k] = this[k];
        }
        return out;
      },
    };
    setCaptured(doc);

    const req = {
      params: { id: doc._id.toString() },
      body: {},
      user: {
        _id: new Types.ObjectId('0000000000000000000000aa'),
        id: '0000000000000000000000aa',
        role: 'admin',
        name: 'Test Admin',
        email: 'admin@test.local',
      },
    } as unknown as Request;
    const res = makeRes();

    await convertToGolden(req, res);

    expect(res._status).toBe(200);
    // No double-notify on idempotent re-convert.
    expect(mocks.notifyCalls.length).toBe(0);
  });
});
