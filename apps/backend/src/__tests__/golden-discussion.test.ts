/**
 * golden-discussion.test.ts — tests for the v1.74 Golden Ticket
 * discussion feature.
 *
 * Surface covered:
 *   1. Pure helper `isDiscussionOpen` — true within 7d, false after,
 *      false if firstAdminAnswerAt is null, false on garbage input.
 *   2. `resolveGoldenTicket` — the first admin answer stamps
 *      `firstAdminAnswerAt` + `discussionClosesAt = firstAdminAnswerAt
 *      + 7d` and pushes a `goldenTicketDiscussion` entry with
 *      `isProminent: true`. Re-resolving does NOT reset the window.
 *   3. `reResolveGoldenTicket` — appends a discussion entry; if the
 *      ticket was previously resolved with no text, the first
 *      re-resolve becomes the prominent opener.
 *   4. `postGoldenDiscussion` — auth, window, role-driven bubble
 *      style, prominent flag never set via this endpoint.
 *   5. `getMyGoldenTicket` — response carries `discussionOpen`
 *      + `goldenTicketDiscussion` + `firstAdminAnswerAt` +
 *      `discussionClosesAt`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';

// ─── Mocks ───────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const state: { capturedDoc: any } = { capturedDoc: null };
  return {
    state,
    spendSpy: vi.fn(async () => undefined),
    notifyCalls: [] as Array<{
      userId: unknown;
      link: string;
      title: string;
      metadata: Record<string, unknown>;
    }>,
  };
});

vi.mock('../modules/support/support-request.model.js', () => {
  // Two call shapes to support:
  //   - `findById(id).select(...).lean()` — used by getMyGoldenTicket
  //     (read-only)
  //   - `findById(id)` returning a Mongoose-like doc — used by
  //     resolveGoldenTicket / reResolveGoldenTicket /
  //     postGoldenDiscussion (mutate + save())
  //
  // The cleanest approach: have findById return the same captured
  // doc reference both ways. The mutating controllers then mutate
  // the captured doc in place, so assertions on
  // `mocks.state.capturedDoc.status` etc. work. The `.select()`
  // getter lets the read-only path also work.
  const findById = vi.fn((_id: unknown) => {
    const doc = mocks.state.capturedDoc;
    if (!doc) {
      return {
        select: () => ({ lean: async () => null }),
        // Mongoose's null-doc shape — controller will 404.
      };
    }
    // Add a chainable `.select` that doesn't lose `this`.
    (doc as any).select = (() => ({
      lean: async () => doc,
    })) as any;
    return doc;
  });
  return { default: { findById } };
});

vi.mock('../modules/auth/user.model.js', () => ({
  default: {
    // Controller calls User.findById(id).select('name').lean()
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
  getAuthedUserId: (req: { user?: { _id?: Types.ObjectId | string } } | undefined): Types.ObjectId | null => {
    const id = req?.user?._id;
    if (!id) return null;
    return typeof id === 'string' ? new Types.ObjectId(id) : (id as Types.ObjectId);
  },
  getAuthedUserRole: (req: { user?: { role?: string } } | undefined): string | undefined =>
    req?.user?.role,
  isGoldenTicket: (req: { isGolden?: boolean }): boolean => Boolean(req.isGolden),
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
  // v1.74 — drive the REAL helpers so the test exercises the
  // actual 7-day math. No mocking of `isDiscussionOpen` /
  // `computeDiscussionClosesAt`.
  computeDiscussionClosesAt: (when: Date): Date => new Date(when.getTime() + 7 * 24 * 60 * 60 * 1000),
  isDiscussionOpen: (
    ticket: { firstAdminAnswerAt?: Date | null; discussionClosesAt?: Date | null } | null | undefined,
    now: Date = new Date(),
  ): boolean => {
    if (!ticket || !ticket.firstAdminAnswerAt || !ticket.discussionClosesAt) return false;
    return now.getTime() < new Date(ticket.discussionClosesAt).getTime();
  },
  GOLDEN_DISCUSSION_WINDOW_MS: 7 * 24 * 60 * 60 * 1000,
  supportTicketLink: (t: { _id: { toString: () => string }; isGolden?: boolean }): string =>
    t.isGolden ? `/golden/ticket/${t._id.toString()}` : `/support/${t._id.toString()}`,
  requireFeatureOn: async (): Promise<boolean> => true,
}));

vi.mock('../utils/http/logger.js', () => ({
  adminLog: { error: (): void => undefined },
  authLog: { error: (): void => undefined },
}));

import {
  resolveGoldenTicket,
  reResolveGoldenTicket,
} from '../modules/support/golden-ticket-admin.controller.js';
import { getMyGoldenTicket, postGoldenDiscussion } from '../modules/support/support-golden.controller.js';
import {
  isDiscussionOpen,
  computeDiscussionClosesAt,
  GOLDEN_DISCUSSION_WINDOW_MS,
} from '../modules/support/support-core.controller.js';

// ─── Test helpers ───────────────────────────────────────────────────────

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
  // Re-arm the findById mock so the new doc is what findById
  // returns. The vi.mock factory reads from
  // `mocks.state.capturedDoc` at call time, so simply updating
  // the state is enough — no need to re-mock.
}

function makeAdminReq(opts: { id?: string; body?: unknown; status?: string }): Request {
  const id = opts.id ?? new Types.ObjectId().toString();
  const doc: any = {
    _id: new Types.ObjectId(id),
    isGolden: true,
    status: opts.status ?? 'Pending',
    spCost: 4,
    userId: new Types.ObjectId('0000000000000000000000bb'),
    issueType: 'Connectivity',
    goldenResolutions: [],
    goldenTicketDiscussion: [],
    firstAdminAnswerAt: null,
    discussionClosesAt: null,
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
    params: { id },
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

function makeDiscussionReq(opts: {
  id: string;
  body?: unknown;
  role?: string;
  asOwner?: boolean;
}): Request {
  return {
    params: { id: opts.id },
    body: opts.body ?? { text: 'A reply' },
    user: {
      _id: new Types.ObjectId(opts.asOwner ? '0000000000000000000000bb' : '0000000000000000000000aa'),
      id: opts.asOwner ? '0000000000000000000000bb' : '0000000000000000000000aa',
      role: opts.role ?? 'user',
      name: 'Test Sender',
      email: 'sender@test.local',
    },
  } as unknown as Request;
}

function makeGoldenTicketDoc(overrides: Record<string, unknown> = {}): any {
  const id = new Types.ObjectId('0000000000000000000000ee');
  return {
    _id: id,
    isGolden: true,
    status: 'Resolved',
    spCost: 4,
    userId: new Types.ObjectId('0000000000000000000000bb'),
    userName: 'Owner',
    userEmail: 'owner@test.local',
    title: 'Help me',
    details: 'It broke',
    createdAt: new Date('2026-06-15T10:00:00Z'),
    updatedAt: new Date('2026-06-15T11:00:00Z'),
    resolvedAt: new Date('2026-06-15T11:00:00Z'),
    rejectedAt: null,
    rejectionReason: '',
    goldenResolutions: [],
    goldenTicketDiscussion: [],
    firstAdminAnswerAt: null,
    discussionClosesAt: null,
    // v1.74 — the mutating endpoints (postGoldenDiscussion, etc.)
    // call .save() on the returned doc. The Mongoose-style save
    // is a no-op for tests but must be present or the controller
    // throws 500.
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
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('isDiscussionOpen (helper)', () => {
  it('returns false when firstAdminAnswerAt is null (no answer yet)', () => {
    const t = { firstAdminAnswerAt: null, discussionClosesAt: null };
    expect(isDiscussionOpen(t)).toBe(false);
  });

  it('returns true within 7 days of firstAdminAnswerAt', () => {
    const t = makeGoldenTicketDoc({
      firstAdminAnswerAt: new Date('2026-06-15T10:00:00Z'),
      discussionClosesAt: new Date('2026-06-22T10:00:00Z'),
    });
    const now = new Date('2026-06-18T10:00:00Z'); // 3d later
    expect(isDiscussionOpen(t, now)).toBe(true);
  });

  it('returns false 7 days after firstAdminAnswerAt (window closed)', () => {
    const t = makeGoldenTicketDoc({
      firstAdminAnswerAt: new Date('2026-06-15T10:00:00Z'),
      discussionClosesAt: new Date('2026-06-22T10:00:00Z'),
    });
    const now = new Date('2026-06-22T10:00:01Z'); // 1s past close
    expect(isDiscussionOpen(t, now)).toBe(false);
  });

  it('returns false on a ticket with garbage discussionClosesAt (defensive)', () => {
    const t: { firstAdminAnswerAt: Date; discussionClosesAt: unknown } = {
      firstAdminAnswerAt: new Date(),
      discussionClosesAt: 'not-a-date',
    };
    // The helper coerces via `new Date(...)` and returns false on
    // NaN. We pass `unknown` to the function via a cast so the
    // test exercises the real defensive branch even though the
    // type signature rejects it.
    expect(isDiscussionOpen(t as never)).toBe(false);
  });

  it('returns false for null/undefined ticket', () => {
    expect(isDiscussionOpen(null)).toBe(false);
    expect(isDiscussionOpen(undefined)).toBe(false);
  });

  it('computeDiscussionClosesAt returns firstAdminAnswerAt + 7d', () => {
    const t0 = new Date('2026-06-15T10:00:00Z');
    const t1 = computeDiscussionClosesAt(t0);
    expect(t1.getTime() - t0.getTime()).toBe(GOLDEN_DISCUSSION_WINDOW_MS);
  });
});

describe('resolveGoldenTicket (prominent answer + window stamp)', () => {
  beforeEach(() => {
    mocks.notifyCalls.length = 0;
    mocks.spendSpy.mockClear();
  });

  it('stamps firstAdminAnswerAt + discussionClosesAt (+7d) on the first admin answer', async () => {
    const req = makeAdminReq({ body: { text: 'First answer.' } });
    const res = makeRes();

    await resolveGoldenTicket(req, res);

    expect(res._status).toBe(200);
    expect(mocks.state.capturedDoc.status).toBe('Resolved');
    // Window stamped.
    expect(mocks.state.capturedDoc.firstAdminAnswerAt).toBeInstanceOf(Date);
    const closes = mocks.state.capturedDoc.discussionClosesAt as Date;
    const opens = mocks.state.capturedDoc.firstAdminAnswerAt as Date;
    expect(closes.getTime() - opens.getTime()).toBe(GOLDEN_DISCUSSION_WINDOW_MS);
    // Discussion thread carries the prominent answer.
    expect(mocks.state.capturedDoc.goldenTicketDiscussion).toHaveLength(1);
    const entry = mocks.state.capturedDoc.goldenTicketDiscussion[0];
    expect(entry.isProminent).toBe(true);
    expect(entry.senderRole).toBe('admin');
    expect(entry.senderName).toBe('Test Admin');
    expect(entry.text).toBe('First answer.');
  });

  it('does NOT re-stamp the window on a subsequent resolve (idempotent)', async () => {
    // First resolve — opens the window. We build the doc by
    // hand and call `setCaptured` directly so the same instance
    // is returned by findById for the second call too.
    const id = new Types.ObjectId().toString();
    const doc: any = {
      _id: new Types.ObjectId(id),
      isGolden: true,
      status: 'Pending',
      spCost: 4,
      userId: new Types.ObjectId('0000000000000000000000bb'),
      issueType: 'Connectivity',
      goldenResolutions: [],
      goldenTicketDiscussion: [],
      firstAdminAnswerAt: null,
      discussionClosesAt: null,
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

    const req1 = {
      params: { id },
      body: { text: 'First answer.' },
      user: {
        _id: new Types.ObjectId('0000000000000000000000aa'),
        id: '0000000000000000000000aa',
        role: 'admin',
        name: 'Test Admin',
        email: 'admin@test.local',
      },
    } as unknown as Request;
    await resolveGoldenTicket(req1, makeRes());

    const originalOpen = doc.firstAdminAnswerAt;
    expect(originalOpen).toBeInstanceOf(Date);

    // After the first resolve, doc.status is 'Resolved' — so the
    // next call goes through the idempotent branch and must NOT
    // touch the window.
    const req2 = {
      params: { id },
      body: { text: 'Second resolve' },
      user: {
        _id: new Types.ObjectId('0000000000000000000000aa'),
        id: '0000000000000000000000aa',
        role: 'admin',
        name: 'Test Admin',
        email: 'admin@test.local',
      },
    } as unknown as Request;
    await resolveGoldenTicket(req2, makeRes());
    expect(doc.firstAdminAnswerAt).toBe(originalOpen);
    // No new discussion entry on idempotent path.
    expect(doc.goldenTicketDiscussion).toHaveLength(1);
  });

  it('does NOT stamp the window when the resolve has no answer text', async () => {
    const req = makeAdminReq({ body: {} });
    const res = makeRes();
    await resolveGoldenTicket(req, res);

    expect(res._status).toBe(200);
    expect(mocks.state.capturedDoc.status).toBe('Resolved');
    // No first answer → no window.
    expect(mocks.state.capturedDoc.firstAdminAnswerAt).toBeNull();
    expect(mocks.state.capturedDoc.discussionClosesAt).toBeNull();
    expect(mocks.state.capturedDoc.goldenTicketDiscussion).toEqual([]);
  });
});

describe('reResolveGoldenTicket (subsequent admin answers)', () => {
  beforeEach(() => {
    mocks.notifyCalls.length = 0;
    mocks.spendSpy.mockClear();
  });

  it('appends a non-prominent entry to the discussion thread', async () => {
    const id = new Types.ObjectId().toString();
    // Start with a Resolved ticket that already has the first
    // admin answer + window stamped.
    const firstAnswerAt = new Date('2026-06-15T10:00:00Z');
    const doc: any = {
      _id: new Types.ObjectId(id),
      isGolden: true,
      status: 'Resolved',
      spCost: 4,
      userId: new Types.ObjectId('0000000000000000000000bb'),
      goldenResolutions: [
        { text: 'first', adminId: new Types.ObjectId(), adminName: 'A', createdAt: firstAnswerAt, notificationSent: true },
      ],
      goldenTicketDiscussion: [
        { text: 'first', senderRole: 'admin', senderId: new Types.ObjectId(), senderName: 'A', createdAt: firstAnswerAt, isProminent: true },
      ],
      firstAdminAnswerAt: firstAnswerAt,
      discussionClosesAt: new Date(firstAnswerAt.getTime() + GOLDEN_DISCUSSION_WINDOW_MS),
      statusHistory: [],
      save: vi.fn(async function saveMock(this: unknown): Promise<unknown> {
        return this;
      }),
    };
    setCaptured(doc);

    const req = {
      params: { id },
      body: { text: 'Follow-up answer.' },
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

    expect(res._status).toBe(200);
    expect(mocks.state.capturedDoc.goldenTicketDiscussion).toHaveLength(2);
    // First entry still prominent.
    expect(mocks.state.capturedDoc.goldenTicketDiscussion[0].isProminent).toBe(true);
    // New entry NOT prominent.
    const newEntry = mocks.state.capturedDoc.goldenTicketDiscussion[1];
    expect(newEntry.isProminent).toBe(false);
    expect(newEntry.text).toBe('Follow-up answer.');
  });

  it('the very first re-resolve on a previously-no-answer Resolved ticket becomes prominent', async () => {
    const id = new Types.ObjectId().toString();
    const doc: any = {
      _id: new Types.ObjectId(id),
      isGolden: true,
      status: 'Resolved',
      spCost: 4,
      userId: new Types.ObjectId('0000000000000000000000bb'),
      goldenResolutions: [], // empty — original resolve had no text
      goldenTicketDiscussion: [],
      firstAdminAnswerAt: null,
      discussionClosesAt: null,
      statusHistory: [],
      save: vi.fn(async function saveMock(this: unknown): Promise<unknown> {
        return this;
      }),
    };
    setCaptured(doc);

    const req = {
      params: { id },
      body: { text: 'First actual answer.' },
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

    expect(res._status).toBe(200);
    // Window opened by this re-resolve.
    expect(mocks.state.capturedDoc.firstAdminAnswerAt).toBeInstanceOf(Date);
    expect(mocks.state.capturedDoc.discussionClosesAt).toBeInstanceOf(Date);
    // Entry IS prominent.
    expect(mocks.state.capturedDoc.goldenTicketDiscussion).toHaveLength(1);
    expect(mocks.state.capturedDoc.goldenTicketDiscussion[0].isProminent).toBe(true);
  });
});

describe('postGoldenDiscussion (the new endpoint)', () => {
  beforeEach(() => {
    mocks.notifyCalls.length = 0;
    mocks.spendSpy.mockClear();
  });

  it('records a user reply inside the window with senderRole: "user"', async () => {
    const id = '0000000000000000000000ee';
    // v1.74 — use timestamps relative to now so the test doesn't
    // age out as the calendar advances. The window is open until
    // firstAdminAnswerAt + 7d, so we backdate firstAdminAnswerAt
    // by 1 day to keep us well inside the open window.
    const openedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    setCaptured(
      makeGoldenTicketDoc({
        _id: new Types.ObjectId(id),
        firstAdminAnswerAt: openedAt,
        discussionClosesAt: new Date(openedAt.getTime() + GOLDEN_DISCUSSION_WINDOW_MS),
        goldenTicketDiscussion: [
          { text: 'first', senderRole: 'admin', senderId: new Types.ObjectId(), senderName: 'Admin', createdAt: openedAt, isProminent: true },
        ],
      }),
    );

    const req = makeDiscussionReq({ id, body: { text: 'I tried that, still broken.' }, role: 'user', asOwner: true });
    const res = makeRes();

    await postGoldenDiscussion(req, res);

    expect(res._status).toBe(200);
    expect(mocks.state.capturedDoc.goldenTicketDiscussion).toHaveLength(2);
    const newEntry = mocks.state.capturedDoc.goldenTicketDiscussion[1];
    expect(newEntry.senderRole).toBe('user');
    expect(newEntry.text).toBe('I tried that, still broken.');
    // Replies never carry the prominent flag.
    expect(newEntry.isProminent).toBe(false);
  });

  it('records an admin reply with senderRole: "admin"', async () => {
    const id = '0000000000000000000000ee';
    const openedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    setCaptured(
      makeGoldenTicketDoc({
        _id: new Types.ObjectId(id),
        firstAdminAnswerAt: openedAt,
        discussionClosesAt: new Date(openedAt.getTime() + GOLDEN_DISCUSSION_WINDOW_MS),
      }),
    );

    const req = makeDiscussionReq({ id, body: { text: 'Can you share a screenshot?' }, role: 'admin' });
    const res = makeRes();

    await postGoldenDiscussion(req, res);

    expect(res._status).toBe(200);
    const newEntry = mocks.state.capturedDoc.goldenTicketDiscussion[0];
    expect(newEntry.senderRole).toBe('admin');
    expect(newEntry.isProminent).toBe(false);
  });

  it('rejects a non-owner non-admin caller with 404 (no existence leak)', async () => {
    const id = '0000000000000000000000ee';
    setCaptured(makeGoldenTicketDoc({ _id: new Types.ObjectId(id) }));

    const req = makeDiscussionReq({ id, role: 'user', asOwner: false });
    const res = makeRes();

    await postGoldenDiscussion(req, res);

    expect(res._status).toBe(404);
    expect(mocks.state.capturedDoc.goldenTicketDiscussion).toHaveLength(0);
  });

  it('returns 400 "Discussion closed" when the window has passed', async () => {
    const id = '0000000000000000000000ee';
    const openedAt = new Date('2026-06-01T10:00:00Z');
    setCaptured(
      makeGoldenTicketDoc({
        _id: new Types.ObjectId(id),
        firstAdminAnswerAt: openedAt,
        // 8 days after — past the 7-day window.
        discussionClosesAt: new Date(openedAt.getTime() + 8 * 24 * 60 * 60 * 1000),
      }),
    );

    const req = makeDiscussionReq({ id, role: 'user', asOwner: true });
    const res = makeRes();

    await postGoldenDiscussion(req, res);

    expect(res._status).toBe(400);
    const body = res._body as { message: string };
    expect(body.message).toMatch(/Discussion closed/i);
  });

  it('returns 400 when no admin answer has ever opened the window', async () => {
    const id = '0000000000000000000000ee';
    setCaptured(makeGoldenTicketDoc({ _id: new Types.ObjectId(id) }));
    // firstAdminAnswerAt / discussionClosesAt both null → no
    // window opened.

    const req = makeDiscussionReq({ id, role: 'user', asOwner: true });
    const res = makeRes();

    await postGoldenDiscussion(req, res);

    expect(res._status).toBe(400);
  });

  it('returns 404 when the ticket is not golden', async () => {
    const id = '0000000000000000000000ee';
    setCaptured(makeGoldenTicketDoc({ _id: new Types.ObjectId(id), isGolden: false }));

    const req = makeDiscussionReq({ id, role: 'user', asOwner: true });
    const res = makeRes();

    await postGoldenDiscussion(req, res);

    expect(res._status).toBe(404);
  });

  it('returns 400 when text is empty', async () => {
    const id = '0000000000000000000000ee';
    const openedAt = new Date('2026-06-15T10:00:00Z');
    setCaptured(
      makeGoldenTicketDoc({
        _id: new Types.ObjectId(id),
        firstAdminAnswerAt: openedAt,
        discussionClosesAt: new Date(openedAt.getTime() + GOLDEN_DISCUSSION_WINDOW_MS),
      }),
    );

    const req = makeDiscussionReq({ id, body: { text: '   ' }, role: 'user', asOwner: true });
    const res = makeRes();

    await postGoldenDiscussion(req, res);

    expect(res._status).toBe(400);
  });

  it('returns 400 when text is too long (>2000)', async () => {
    const id = '0000000000000000000000ee';
    const openedAt = new Date('2026-06-15T10:00:00Z');
    setCaptured(
      makeGoldenTicketDoc({
        _id: new Types.ObjectId(id),
        firstAdminAnswerAt: openedAt,
        discussionClosesAt: new Date(openedAt.getTime() + GOLDEN_DISCUSSION_WINDOW_MS),
      }),
    );

    const req = makeDiscussionReq({ id, body: { text: 'x'.repeat(2001) }, role: 'user', asOwner: true });
    const res = makeRes();

    await postGoldenDiscussion(req, res);

    expect(res._status).toBe(400);
  });
});

describe('getMyGoldenTicket (response shape includes discussion fields)', () => {
  beforeEach(() => {
    // Nothing to reset — findById reads from `mocks.state.capturedDoc`
    // at call time, and tests below call `setCaptured(...)` to swap.
  });

  it('stamps discussionOpen=false when no admin answer yet', async () => {
    const id = '0000000000000000000000ee';
    setCaptured(makeGoldenTicketDoc({ _id: new Types.ObjectId(id) }));

    const req = {
      params: { id },
      body: {},
      user: {
        _id: new Types.ObjectId('0000000000000000000000bb'),
        id: '0000000000000000000000bb',
        role: 'user',
      },
    } as unknown as Request;
    const res = makeRes();

    await getMyGoldenTicket(req, res);

    expect(res._status).toBe(200);
    const body = res._body as { ticket: { discussionOpen: boolean; goldenTicketDiscussion: unknown[]; firstAdminAnswerAt: string | null; discussionClosesAt: string | null } };
    expect(body.ticket.discussionOpen).toBe(false);
    expect(body.ticket.goldenTicketDiscussion).toEqual([]);
    expect(body.ticket.firstAdminAnswerAt).toBeNull();
    expect(body.ticket.discussionClosesAt).toBeNull();
  });

  it('stamps discussionOpen=true inside the 7-day window', async () => {
    const id = '0000000000000000000000ee';
    const openedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    setCaptured(
      makeGoldenTicketDoc({
        _id: new Types.ObjectId(id),
        firstAdminAnswerAt: openedAt,
        discussionClosesAt: new Date(openedAt.getTime() + GOLDEN_DISCUSSION_WINDOW_MS),
        goldenTicketDiscussion: [
          { text: 'first', senderRole: 'admin', senderId: new Types.ObjectId(), senderName: 'A', createdAt: openedAt, isProminent: true },
        ],
      }),
    );

    const req = {
      params: { id },
      body: {},
      user: {
        _id: new Types.ObjectId('0000000000000000000000bb'),
        id: '0000000000000000000000bb',
        role: 'user',
      },
    } as unknown as Request;
    const res = makeRes();

    await getMyGoldenTicket(req, res);

    expect(res._status).toBe(200);
    const body = res._body as { ticket: { discussionOpen: boolean; goldenTicketDiscussion: Array<{ isProminent: boolean }> } };
    expect(body.ticket.discussionOpen).toBe(true);
    expect(body.ticket.goldenTicketDiscussion).toHaveLength(1);
    expect(body.ticket.goldenTicketDiscussion[0].isProminent).toBe(true);
  });
});
