/**
 * golden-ticket-admin.reopen.test.ts — unit tests for the
 * POST /api/admin/golden-tickets/:id/reopen and the
 * DELETE /api/admin/golden-tickets/:id/resolutions/:resIdx
 * endpoints (v1.72).
 *
 * Why this test exists:
 *   Reopen is the only Golden Ticket admin action that reverses
 *   a prior terminal state without any SP movement. A future
 *   refactor that calls `spendSpurtiPoints(...)` here would
 *   silently re-charge the user; a future refactor that wipes
 *   `goldenResolutions[]` would silently destroy the audit trail.
 *   These tests pin both invariants.
 *
 *   Delete-resolution is the only path that mutates the answers
 *   array. It must never throw on a missing index and must never
 *   fire a user notification.
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
    notifySpy: vi.fn(async () => undefined),
  };
});

vi.mock('../modules/support/support-request.model.js', () => ({
  default: { findById: mocks.findByIdMock },
}));

vi.mock('../modules/auth/user.model.js', () => ({
  default: { findById: vi.fn(async () => null) },
}));

vi.mock('../modules/program/promotion.service.js', () => ({
  spendSpurtiPoints: async (): Promise<void> => undefined,
}));

vi.mock('../modules/support/support-core.controller.js', () => ({
  getAuthedUserId: (): Types.ObjectId => new Types.ObjectId('0000000000000000000000aa'),
  getAuthedUserRole: (): string => 'admin',
  stripAdminOnlyFields: (obj: unknown): unknown => obj,
  logAdminAction: async (): Promise<void> => undefined,
  notifyUser: async (...args: unknown[]): Promise<void> => {
    // Forward to the spy as a single variadic call (the controller
    // passes (userId, payload) but the spy doesn't care).
    (mocks.notifySpy as (...a: unknown[]) => void)(...args);
  },
  isGoldenTicket: (req: { isGolden?: boolean }): boolean => Boolean(req.isGolden),
}));

vi.mock('../utils/http/logger.js', () => ({
  adminLog: { error: (): void => undefined },
}));

// ─── Imports under test ────────────────────────────────────────────────

import {
  reopenGoldenTicket,
  deleteGoldenResolution,
} from '../modules/support/golden-ticket-admin.controller.js';

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

function makeReq(opts: {
  body?: unknown;
  status?: string;
  isGolden?: boolean;
  goldenResolutions?: unknown[];
  resIdx?: string;
  ticketId?: string;
}): Request {
  const ticketId = opts.ticketId ?? new Types.ObjectId().toString();
  const doc: any = {
    _id: new Types.ObjectId(ticketId),
    isGolden: opts.isGolden ?? true,
    status: opts.status ?? 'Resolved',
    spCost: 4,
    userId: new Types.ObjectId('0000000000000000000000bb'),
    resolvedAt: opts.status === 'Resolved' ? new Date('2026-06-01T00:00:00Z') : null,
    goldenResolutions: Array.isArray(opts.goldenResolutions) ? opts.goldenResolutions : [],
    statusHistory: [
      {
        status: 'Resolved',
        note: 'Originally resolved.',
        updatedBy: new Types.ObjectId(),
        updatedByName: 'Previous Admin',
        timestamp: new Date('2026-06-01T00:00:00Z'),
      },
    ],
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
    params: {
      id: ticketId,
      ...(opts.resIdx !== undefined ? { resIdx: opts.resIdx } : {}),
    },
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

// ─── reopenGoldenTicket ────────────────────────────────────────────────

describe('reopenGoldenTicket', () => {
  beforeEach(() => {
    mocks.spendSpy.mockClear();
    mocks.notifySpy.mockClear();
    mocks.findByIdMock.mockReset();
  });

  it('flips status from Resolved to Pending', async () => {
    const req = makeReq({ status: 'Resolved' });
    const res = makeRes();
    await reopenGoldenTicket(req, res);
    expect(res._status).toBe(200);
    expect(mocks.state.capturedDoc.status).toBe('Pending');
    expect(mocks.state.capturedDoc.resolvedAt).toBeNull();
  });

  it('preserves goldenResolutions[] (audit trail intact)', async () => {
    const prior = [
      {
        text: 'first answer',
        adminId: new Types.ObjectId(),
        adminName: 'Earlier Admin',
        createdAt: new Date('2026-06-01T00:00:00Z'),
        notificationSent: true,
      },
      {
        text: 'second answer',
        adminId: new Types.ObjectId(),
        adminName: 'Earlier Admin',
        createdAt: new Date('2026-06-02T00:00:00Z'),
        notificationSent: true,
      },
    ];
    const req = makeReq({ status: 'Resolved', goldenResolutions: prior });
    const res = makeRes();
    await reopenGoldenTicket(req, res);
    expect(mocks.state.capturedDoc.goldenResolutions).toHaveLength(2);
    expect(mocks.state.capturedDoc.goldenResolutions[0].text).toBe('first answer');
    expect(mocks.state.capturedDoc.goldenResolutions[1].text).toBe('second answer');
  });

  it('NEVER charges or refunds SP (no SP movement)', async () => {
    const req = makeReq({ status: 'Resolved' });
    const res = makeRes();
    await reopenGoldenTicket(req, res);
    expect(res._body).toMatchObject({ ok: true, noSpMovement: true });
  });

  it('does NOT notify the user (admin workflow action)', async () => {
    const req = makeReq({ status: 'Resolved' });
    const res = makeRes();
    await reopenGoldenTicket(req, res);
    expect(mocks.notifySpy).not.toHaveBeenCalled();
  });

  it('appends a statusHistory entry noting the reopen', async () => {
    const req = makeReq({ status: 'Resolved' });
    const res = makeRes();
    await reopenGoldenTicket(req, res);
    const last =
      mocks.state.capturedDoc.statusHistory[mocks.state.capturedDoc.statusHistory.length - 1];
    expect(last.status).toBe('Pending');
    expect(last.note).toMatch(/Reopened by Test Admin/);
  });

  it('returns 409 when ticket is not Resolved', async () => {
    for (const status of ['Pending', 'Rejected', 'closed', 'In Review', 'open']) {
      const req = makeReq({ status });
      const res = makeRes();
      await reopenGoldenTicket(req, res);
      expect(res._status).toBe(409);
    }
    expect(mocks.notifySpy).not.toHaveBeenCalled();
  });

  it('returns 404 when the ticket does not exist', async () => {
    setCaptured(null);
    // Bypass makeReq so the doc isn't re-attached by the helper.
    const req = {
      params: { id: new Types.ObjectId().toString() },
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
    await reopenGoldenTicket(req, res);
    expect(res._status).toBe(404);
  });

  it('returns 409 when the ticket is not a Golden ticket', async () => {
    const req = makeReq({ status: 'Resolved', isGolden: false });
    const res = makeRes();
    await reopenGoldenTicket(req, res);
    expect(res._status).toBe(409);
  });
});

// ─── deleteGoldenResolution ───────────────────────────────────────────

describe('deleteGoldenResolution', () => {
  beforeEach(() => {
    mocks.spendSpy.mockClear();
    mocks.notifySpy.mockClear();
    mocks.findByIdMock.mockReset();
  });

  function makeResolutions() {
    return [
      {
        text: 'first answer',
        adminId: new Types.ObjectId(),
        adminName: 'Earlier Admin',
        createdAt: new Date('2026-06-01T00:00:00Z'),
        notificationSent: true,
      },
      {
        text: 'second answer',
        adminId: new Types.ObjectId(),
        adminName: 'Later Admin',
        createdAt: new Date('2026-06-02T00:00:00Z'),
        notificationSent: true,
      },
      {
        text: 'third answer',
        adminId: new Types.ObjectId(),
        adminName: 'Latest Admin',
        createdAt: new Date('2026-06-03T00:00:00Z'),
        notificationSent: true,
      },
    ];
  }

  it('removes a single entry by index', async () => {
    const req = makeReq({ status: 'Resolved', goldenResolutions: makeResolutions(), resIdx: '1' });
    const res = makeRes();
    await deleteGoldenResolution(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ok: true, removedIndex: 1, remaining: 2 });
    expect(mocks.state.capturedDoc.goldenResolutions).toHaveLength(2);
    expect(mocks.state.capturedDoc.goldenResolutions[0].text).toBe('first answer');
    expect(mocks.state.capturedDoc.goldenResolutions[1].text).toBe('third answer');
  });

  it('appends a statusHistory entry recording the deletion', async () => {
    const req = makeReq({ status: 'Resolved', goldenResolutions: makeResolutions(), resIdx: '0' });
    const res = makeRes();
    await deleteGoldenResolution(req, res);
    const last =
      mocks.state.capturedDoc.statusHistory[mocks.state.capturedDoc.statusHistory.length - 1];
    expect(last.note).toMatch(/Removed goldenResolutions\[0\]/);
    expect(last.note).toContain('first answer');
  });

  it('does NOT change ticket status', async () => {
    const req = makeReq({ status: 'Resolved', goldenResolutions: makeResolutions(), resIdx: '0' });
    const res = makeRes();
    await deleteGoldenResolution(req, res);
    expect(mocks.state.capturedDoc.status).toBe('Resolved');
  });

  it('does NOT notify the user (cleanup action)', async () => {
    const req = makeReq({ status: 'Resolved', goldenResolutions: makeResolutions(), resIdx: '0' });
    const res = makeRes();
    await deleteGoldenResolution(req, res);
    expect(mocks.notifySpy).not.toHaveBeenCalled();
  });

  it('returns 404 when index is out of range', async () => {
    const req = makeReq({ status: 'Resolved', goldenResolutions: makeResolutions(), resIdx: '99' });
    const res = makeRes();
    await deleteGoldenResolution(req, res);
    expect(res._status).toBe(404);
  });

  it('returns 400 when index is invalid', async () => {
    for (const bad of ['abc', '-1', '']) {
      const req = makeReq({
        status: 'Resolved',
        goldenResolutions: makeResolutions(),
        resIdx: bad,
      });
      const res = makeRes();
      await deleteGoldenResolution(req, res);
      expect(res._status).toBe(400);
    }
  });

  it('returns 409 when the ticket is not a Golden ticket', async () => {
    const req = makeReq({
      status: 'Resolved',
      isGolden: false,
      goldenResolutions: makeResolutions(),
      resIdx: '0',
    });
    const res = makeRes();
    await deleteGoldenResolution(req, res);
    expect(res._status).toBe(409);
  });
});
