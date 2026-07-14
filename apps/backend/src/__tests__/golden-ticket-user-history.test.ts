/**
 * golden-ticket-user-history.test.ts — unit tests for the
 * GET /api/support/golden/history + GET /api/support/golden/:id
 * user-facing endpoints (v1.73).
 *
 * Why this test exists:
 *   The new history endpoint surfaces the caller's own past Golden
 *   tickets, the active ban window, and a chronological activity log.
 *   These tests pin the authorization shape (scoped to the caller's
 *   own userId — never a query parameter), the response shape, and
 *   the activity-feed assembly.
 *
 * Pattern follows the existing golden-ticket-admin.*.test.ts files:
 *   - vi.hoisted shared mock state
 *   - Stub the User + SupportRequest models with simple mock methods
 *   - Mock the feature-flag controller so the gate always passes
 *   - Mock the logger so test output stays clean
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';

// ─── Mocks (paths relative to this test file) ────────────────────────────

const mocks = vi.hoisted(() => {
  const state: {
    ticketRows: any[] | null;
    countRows: number;
    userRow: any | null;
    featureFlagOn: boolean;
  } = {
    ticketRows: [],
    countRows: 0,
    userRow: null,
    featureFlagOn: true,
  };
  return {
    state,
    // Capture every filter seen by SupportRequest.find so the test
    // can assert the userId + isGolden pairing.
    findCalls: [] as Array<Record<string, unknown>>,
  };
});

// Stub SupportRequest — keep the shape minimal. The controller
// chains .sort().skip().limit().select().lean(); we model those as
// no-ops except for `lean` which returns whatever the test stashed.
vi.mock('../modules/support/support-request.model.js', () => ({
  default: {
    countDocuments: vi.fn(async () => mocks.state.countRows),
    find: vi.fn((filter: Record<string, unknown>) => {
      mocks.findCalls.push(filter);
      return {
        sort: () => ({
          skip: () => ({
            limit: () => ({
              select: () => ({
                lean: async () => mocks.state.ticketRows ?? [],
              }),
            }),
          }),
        }),
      };
    }),
    // Both `findById(id).select(...).lean()` (used by getMyGoldenTicket)
    // and the unchained variant exist in the controller surface.
    findById: vi.fn((_id: unknown) => ({
      select: () => ({
        lean: async () => {
          const rows = mocks.state.ticketRows ?? [];
          return rows[0] ?? null;
        },
      }),
    })),
  },
}));

vi.mock('../modules/auth/user.model.js', () => ({
  default: {
    // The controller calls User.findById(...).select('...').lean().
    // We expose both `.select()` (chainable, returns `this` so the
    // optional .lean() is harmless) and let the test stashed value
    // be returned.
    findById: vi.fn(() => ({
      select: () => ({
        lean: async () => mocks.state.userRow,
      }),
    })),
  },
}));

// Mock the feature-flag helper. Real implementation queries Mongo
// via the feature-flag controller; the test toggles state directly.
vi.mock('../modules/program/feature-flag.controller.js', () => ({
  featureFlags: {
    isEnabled: vi.fn(async () => mocks.state.featureFlagOn),
  },
}));

vi.mock('../modules/support/support-core.controller.js', () => ({
  getAuthedUserId: (): Types.ObjectId => new Types.ObjectId('0000000000000000000000aa'),
  getAuthedUserRole: (): string => 'student',
  isGoldenTicket: (req: { isGolden?: boolean }): boolean => Boolean(req.isGolden),
  // Mirror the real shape: when the gate rejects, it writes 404 to
  // the response itself and returns false. The test drives
  // state.featureFlagOn to toggle the gate.
  requireFeatureOn: async (
    _req: unknown,
    res: { status: (c: number) => unknown; json: (b: unknown) => unknown },
    _key: unknown,
  ): Promise<boolean> => {
    if (!mocks.state.featureFlagOn) {
      res.status(404);
      res.json({ message: 'This feature is not available.' });
      return false;
    }
    return true;
  },
}));

vi.mock('../utils/http/logger.js', () => ({
  adminLog: { error: (): void => undefined },
}));

// ─── Imports under test ──────────────────────────────────────────────────

import {
  getMyGoldenHistory,
  getMyGoldenTicket,
} from '../modules/support/support-golden.controller.js';

// ─── Helpers ─────────────────────────────────────────────────────────────

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

const CALLER_ID = '0000000000000000000000aa';

function makeReq(extra: { id?: string } = {}): Request {
  return {
    params: { id: extra.id },
    query: {},
    user: {
      _id: new Types.ObjectId(CALLER_ID),
      id: CALLER_ID,
      role: 'student',
    },
  } as unknown as Request;
}

// ─── Fixture builders ───────────────────────────────────────────────────

function makeTicket(overrides: Record<string, unknown> = {}): any {
  return {
    _id: new Types.ObjectId(),
    isGolden: true,
    title: 'My connection drops every 10 minutes',
    details: 'Happens only during live classes.',
    status: 'Resolved',
    spCost: 5,
    userId: new Types.ObjectId(CALLER_ID),
    userName: 'Test Student',
    userEmail: 'student@test.local',
    createdAt: new Date('2026-06-15T10:00:00Z'),
    resolvedAt: new Date('2026-06-15T11:00:00Z'),
    rejectedAt: null,
    rejectionReason: '',
    resolutionSummary: 'Resolved by admin',
    goldenResolutions: [
      {
        text: 'Try the LTE fallback.',
        adminId: new Types.ObjectId(),
        adminName: 'Helper Admin',
        createdAt: new Date('2026-06-15T10:30:00Z'),
        notificationSent: true,
      },
    ],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('getMyGoldenHistory (user-facing, v1.73)', () => {
  beforeEach(() => {
    mocks.findCalls.length = 0;
    mocks.state.ticketRows = [];
    mocks.state.countRows = 0;
    mocks.state.userRow = null;
    mocks.state.featureFlagOn = true;
  });

  it("filters by the caller's userId + isGolden=true (never reads from query)", async () => {
    mocks.state.ticketRows = [makeTicket()];
    mocks.state.countRows = 1;
    const req = makeReq();
    const res = makeRes();
    await getMyGoldenHistory(req, res);
    expect(res._status).toBe(200);
    expect(mocks.findCalls[0]).toMatchObject({
      userId: expect.any(Types.ObjectId),
      isGolden: true,
    });
    // The userId in the filter must equal the caller's id.
    const capturedFilter = mocks.findCalls[0] as { userId: unknown };
    expect(String(capturedFilter.userId)).toBe(CALLER_ID);
  });

  it('returns 404 when the goldenTicket feature flag is off', async () => {
    mocks.state.featureFlagOn = false;
    const req = makeReq();
    const res = makeRes();
    await getMyGoldenHistory(req, res);
    expect(res._status).toBe(404);
  });

  it('happy path: serialises goldenResolutions and builds an activity log', async () => {
    const ticket = makeTicket({
      goldenResolutions: [
        {
          text: 'first follow-up answer',
          adminId: new Types.ObjectId(),
          adminName: 'Admin A',
          createdAt: new Date('2026-06-15T10:30:00Z'),
          notificationSent: true,
        },
        {
          text: 'second follow-up answer',
          adminId: new Types.ObjectId(),
          adminName: 'Admin B',
          createdAt: new Date('2026-06-15T10:45:00Z'),
          notificationSent: true,
        },
      ],
    });
    const rejected = makeTicket({
      _id: new Types.ObjectId(),
      status: 'Rejected',
      title: 'My other ticket',
      spCost: 3,
      resolvedAt: null,
      rejectedAt: new Date('2026-06-10T08:00:00Z'),
      rejectionReason: 'Off-topic for Golden.',
      goldenResolutions: [],
    });
    mocks.state.ticketRows = [ticket, rejected];
    mocks.state.countRows = 2;
    const req = makeReq();
    const res = makeRes();
    await getMyGoldenHistory(req, res);

    expect(res._status).toBe(200);
    const body = res._body as {
      history: Array<{ _id: string; goldenResolutions: unknown[] }>;
      banned: unknown[];
      activity: Array<{ type: string; ticketId: string }>;
      pagination: { total: number; page: number; limit: number; pages: number };
    };

    expect(body.history).toHaveLength(2);
    expect(body.history[0].goldenResolutions).toHaveLength(2);
    expect(body.history[1].goldenResolutions).toHaveLength(0);
    expect(body.banned).toEqual([]);

    // 1 raise + 1 resolved + 2 re_resolved for the resolved ticket
    // + 1 raise + 1 rejected for the rejected ticket = 6 events.
    expect(body.activity).toHaveLength(6);
    const types = body.activity.map((e) => e.type);
    expect(types).toContain('resolved');
    expect(types).toContain('rejected');
    expect(types).toContain('re_resolved');
    expect(types).toContain('ticket_raised');

    // Newest-first.
    const timestamps = body.activity.map((e) => new Date(e.ticketId === ticket._id.toString() ? '2026-06-15T11:00:00Z' : '2026-06-10T08:00:00Z').getTime());
    // activity array is sorted by `at` desc inside the controller —
    // confirm monotonic non-increasing on the sorted output.
    const sortedAt = body.activity
      .map((e) => (e as unknown as { at?: string }).at)
      .filter((v): v is string => Boolean(v));
    for (let i = 1; i < sortedAt.length; i++) {
      expect(new Date(sortedAt[i]).getTime()).toBeLessThanOrEqual(
        new Date(sortedAt[i - 1]).getTime(),
      );
    }
    // Suppress the unused `timestamps` var — keep the assignment so the
    // intent (tickets-on-IDs at fixture time) is visible in the test.
    void timestamps;
  });

  it('surfaces the active ban window when callerUser.goldenBannedUntil is in the future', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    mocks.state.userRow = {
      _id: new Types.ObjectId(CALLER_ID),
      goldenBannedUntil: future,
      isBanned: false,
    };
    const req = makeReq();
    const res = makeRes();
    await getMyGoldenHistory(req, res);
    expect(res._status).toBe(200);
    const body = res._body as { banned: Array<{ isActiveBan: boolean }> };
    expect(body.banned).toHaveLength(1);
    expect(body.banned[0].isActiveBan).toBe(true);
  });

  it('does NOT surface a ban when the callerUser.goldenBannedUntil has expired', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mocks.state.userRow = {
      _id: new Types.ObjectId(CALLER_ID),
      goldenBannedUntil: past,
      isBanned: false,
    };
    const req = makeReq();
    const res = makeRes();
    await getMyGoldenHistory(req, res);
    expect(res._status).toBe(200);
    const body = res._body as { banned: unknown[] };
    expect(body.banned).toEqual([]);
  });

  it('coerces an oversized ?limit to the server cap of 50', async () => {
    mocks.state.ticketRows = [];
    mocks.state.countRows = 0;
    const req = { ...makeReq(), query: { page: '1', limit: '9999' } } as unknown as Request;
    const res = makeRes();
    await getMyGoldenHistory(req, res);
    expect(res._status).toBe(200);
    // The .limit(50) chain in the controller caps it; we just smoke
    // check the response shape here.
    const body = res._body as { pagination: { limit: number; pages: number } };
    expect(body.pagination.limit).toBe(50);
    expect(body.pagination.pages).toBe(0);
  });
});

describe('getMyGoldenTicket (user-facing, v1.73)', () => {
  beforeEach(() => {
    mocks.findCalls.length = 0;
    mocks.state.ticketRows = [];
    mocks.state.countRows = 0;
    mocks.state.userRow = null;
    mocks.state.featureFlagOn = true;
  });

  it('returns 400 when the id is not a valid ObjectId', async () => {
    const req = makeReq({ id: 'not-an-id' });
    const res = makeRes();
    await getMyGoldenTicket(req, res);
    expect(res._status).toBe(400);
  });

  it('returns 200 with the ticket for the owner', async () => {
    mocks.state.ticketRows = [makeTicket()];
    const req = makeReq({ id: mocks.state.ticketRows[0]._id.toString() });
    const res = makeRes();
    await getMyGoldenTicket(req, res);
    expect(res._status).toBe(200);
    const body = res._body as { ticket: { isGolden: boolean; goldenResolutions: unknown[] } };
    expect(body.ticket.isGolden).toBe(true);
    expect(body.ticket.goldenResolutions).toHaveLength(1);
  });

  it('returns 404 when the ticket is not a Golden ticket', async () => {
    mocks.state.ticketRows = [makeTicket({ isGolden: false })];
    const req = makeReq({ id: mocks.state.ticketRows[0]._id.toString() });
    const res = makeRes();
    await getMyGoldenTicket(req, res);
    expect(res._status).toBe(404);
  });

  it('returns 404 (not 403) when the ticket belongs to another user', async () => {
    mocks.state.ticketRows = [
      makeTicket({ userId: new Types.ObjectId('0000000000000000000000bb') }),
    ];
    const req = makeReq({ id: mocks.state.ticketRows[0]._id.toString() });
    const res = makeRes();
    await getMyGoldenTicket(req, res);
    expect(res._status).toBe(404);
  });

  it('returns 404 when the feature flag is off', async () => {
    mocks.state.featureFlagOn = false;
    const req = makeReq({ id: new Types.ObjectId().toString() });
    const res = makeRes();
    await getMyGoldenTicket(req, res);
    expect(res._status).toBe(404);
  });
});
