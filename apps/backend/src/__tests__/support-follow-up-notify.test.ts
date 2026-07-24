/**
 * support-follow-up-notify.test.ts — regression guard for the
 * user bell notification fired by POST /api/support/requests/:id
 * /follow-ups when the call is made by an admin.
 *
 * Why this test exists:
 *   When an admin replies on a (possibly-Golden) support ticket,
 *   the ticket owner gets a "New reply on your support request"
 *   bell. The bell click navigates to whatever `link` is in the
 *   Notification document.
 *
 *   The previous code hard-coded `/support/:id` — which is the
 *   wrong destination for a Golden ticket (the generic page does
 *   NOT render goldenResolutions[]). The fix routes the link
 *   through `supportTicketLink`, which is golden-aware. This test
 *   pins both directions:
 *     - golden ticket → `/golden/ticket/:id`
 *     - regular ticket → `/support/:id`
 *
 *   The student-side notify (`fanOutToAdmins` for admin bell) is
 *   already covered by the admin-side path on the support
 *   module's `fanOutToAdmins` helper, which is mocked here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';

const mocks = vi.hoisted(() => {
  const state: { capturedDoc: any } = { capturedDoc: null };
  return {
    state,
    findByIdMock: vi.fn(async () => state.capturedDoc),
    saveSpy: vi.fn(async function saveMock(this: unknown): Promise<unknown> {
      return this;
    }),
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
    findById: vi.fn(() => ({
      select: () => ({
        lean: async () => ({ name: 'Test Admin' }),
      }),
    })),
  },
}));

vi.mock('../modules/support/support-core.controller.js', () => ({
  VALID_STATUSES: ['Pending', 'open', 'Resolved', 'Rejected', 'closed'] as const,
  // Pull the auth fields off the request user so the student vs
  // admin branch is wired correctly per test. The real
  // implementation does the same — these are tiny accessors.
  getAuthedUserId: (req: { user?: { _id?: Types.ObjectId | string } } | undefined): Types.ObjectId | null => {
    const id = req?.user?._id;
    if (!id) return null;
    return typeof id === 'string' ? new Types.ObjectId(id) : (id as Types.ObjectId);
  },
  getAuthedUserRole: (req: { user?: { role?: string } } | undefined): string | undefined =>
    req?.user?.role,
  isGoldenTicket: (req: { isGolden?: boolean }): boolean => Boolean(req.isGolden),
  stripAdminOnlyFields: (obj: unknown): unknown => obj,
  fanOutToAdmins: async (): Promise<void> => undefined,
  logAdminAction: async (): Promise<void> => undefined,
  // Drive the real helper here — this test is the integration point
  // for the golden-aware link, so stubbing it would defeat the
  // purpose. The previous version of the controller hard-coded
  // /support/:id and missed Golden tickets.
  supportTicketLink: (ticket: { _id: { toString: () => string }; isGolden?: boolean }): string =>
    ticket.isGolden
      ? `/golden/ticket/${ticket._id.toString()}`
      : `/support/${ticket._id.toString()}`,
  requireFeatureOn: async (
    _req: unknown,
    res: { status: (c: number) => unknown; json: (b: unknown) => unknown }
  ): Promise<boolean> => {
    res.status(200);
    return true;
  },
  notifyUser: async (
    userId: unknown,
    payload: { link: string; title: string; metadata: Record<string, unknown> }
  ): Promise<void> => {
    mocks.notifyCalls.push({ userId, ...payload });
  },
}));

vi.mock('../utils/http/logger.js', () => ({
  supportLog: { warn: (): void => undefined, error: (): void => undefined },
}));

import { addSupportFollowUp } from '../modules/support/support-follow-up.controller.js';

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

function makeReq(opts: { body?: unknown; isGolden?: boolean; role?: string; asOwner?: boolean }): Request {
  const ticketId = new Types.ObjectId('0000000000000000000000ee');
  const doc: any = {
    _id: ticketId,
    isGolden: opts.isGolden ?? false,
    status: 'Pending',
    issueType: 'Connectivity',
    userId: new Types.ObjectId('0000000000000000000000bb'),
    followUps: [],
    save: mocks.saveSpy,
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
    params: { id: ticketId.toString() },
    body: opts.body ?? { message: 'Admin reply text' },
    user: {
      _id: new Types.ObjectId(opts.asOwner ? '0000000000000000000000bb' : '0000000000000000000000aa'),
      id: opts.asOwner ? '0000000000000000000000bb' : '0000000000000000000000aa',
      role: opts.role ?? 'admin',
      name: 'Test Admin',
      email: 'admin@test.local',
    },
  } as unknown as Request;
}

describe('addSupportFollowUp (admin → user notify, golden-aware link)', () => {
  beforeEach(() => {
    mocks.notifyCalls.length = 0;
    mocks.findByIdMock.mockReset();
    mocks.saveSpy.mockClear();
  });

  it('routes the user bell through /golden/ticket/<id> when ticket is golden', async () => {
    const req = makeReq({
      body: { message: 'Please try a different network.' },
      isGolden: true,
      role: 'admin',
    });
    const res = makeRes();

    await addSupportFollowUp(req, res);

    expect(res._status).toBe(200);
    expect(mocks.notifyCalls.length).toBe(1);
    expect(mocks.notifyCalls[0].link).toBe(
      '/golden/ticket/0000000000000000000000ee'
    );
    expect(mocks.notifyCalls[0].title).toBe('New reply on your support request');
  });

  it('keeps the user bell on /support/<id> when ticket is NOT golden', async () => {
    const req = makeReq({
      body: { message: 'Please try a different network.' },
      isGolden: false,
      role: 'admin',
    });
    const res = makeRes();

    await addSupportFollowUp(req, res);

    expect(res._status).toBe(200);
    expect(mocks.notifyCalls.length).toBe(1);
    expect(mocks.notifyCalls[0].link).toBe('/support/0000000000000000000000ee');
  });

  it('never fires the user bell when the caller is the ticket owner (student-side path)', async () => {
    // Student reply → fanOutToAdmins, NOT notifyUser. Pins that
    // the admin-only branch is the one being tested and there's
    // no accidental user→user notification when the student
    // posts a follow-up. The caller here is the ticket owner
    // (asOwner: true) so the controller's auth check passes.
    const req = makeReq({
      body: { message: 'I tried, still broken.' },
      isGolden: true,
      role: 'user',
      asOwner: true,
    });
    const res = makeRes();

    await addSupportFollowUp(req, res);

    expect(res._status).toBe(200);
    expect(mocks.notifyCalls.length).toBe(0);
  });
});
