/**
 * Tests for the admin password reset endpoint.
 *
 * PUT /api/auth/users/:id/password
 *   - Admin only
 *   - Rejects when target is an admin (hard floor)
 *   - 404 on missing user
 *   - Revokes refresh tokens on success
 *   - Appends to onboardingAuditLog
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

// Shared mutable user doc — mutated per-test in beforeEach.
// vi.mock factory below captures the same object via closure,
// so the test setup and the production code see the same state.
const mockUserDoc: {
  _id: Types.ObjectId;
  email: string;
  role: 'user' | 'moderator' | 'admin' | 'ai_moderator' | 'expert';
  password: string;
  onboardingAuditLog: Array<Record<string, unknown>>;
  save: () => Promise<unknown>;
} = {
  _id: new Types.ObjectId(),
  email: 'target@example.com',
  role: 'user',
  password: '',
  onboardingAuditLog: [],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  save: async () => mockUserDoc as any,
};

vi.mock('../user.model.js', () => ({
  default: {
    // findById returns a fresh spread on every call so role
    // mutations on the returned object don't leak into the next
    // call. The closure captures `mockUserDoc` (not the function
    // body's `this`), so the spread always reads the live state.
    findById: vi.fn(async () => ({ ...mockUserDoc })),
  },
}));

vi.mock('../refresh-token.model.js', () => ({
  default: { deleteMany: vi.fn(async () => ({ deletedCount: 3 })) },
}));

import { adminResetUserPassword } from '../auth.controller.js';
import User from '../user.model.js';
import RefreshToken from '../refresh-token.model.js';

const adminId = new Types.ObjectId();
const targetId = new Types.ObjectId();
function adminReq(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    user: { _id: adminId, role: 'admin' },
    params: { id: String(targetId) },
    body: { newPassword: 'NewSecure123' },
    ...overrides,
  };
}

interface MockRes {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}
function mockRes(): MockRes {
  const json = vi.fn();
  const res = { status: vi.fn(() => res), json } as unknown as MockRes;
  return res;
}

describe('adminResetUserPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the shared user doc to a clean non-admin state. The
    // save() spy needs to be re-asserted in each test, so we
    // re-stub it on the live object.
    mockUserDoc._id = new Types.ObjectId();
    mockUserDoc.email = 'target@example.com';
    mockUserDoc.role = 'user';
    mockUserDoc.password = '';
    mockUserDoc.onboardingAuditLog = [];
    mockUserDoc.save = vi.fn(async () => mockUserDoc);
    // The findById mock returns a fresh spread of the doc on each
    // call (so role mutations on the returned object don't leak
    // into the next test). The factory set this up; re-assert after
    // clearAllMocks nuked it. Mongoose's findById returns a Query
    // chain, not a Promise, so we cast through unknown to bypass
    // the type — at runtime the mock returns our plain object.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(User.findById as any).mockImplementation(async () => ({ ...mockUserDoc }));
  });

  it('returns 403 when caller is not admin', async () => {
    const req = adminReq({ user: { _id: adminId, role: 'user' } });
    const res = mockRes();
    await adminResetUserPassword(req as never, res as never);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].message).toMatch(/Admin access required/);
    expect(User.findById).not.toHaveBeenCalled();
  });

  it('returns 404 when target user does not exist', async () => {
    vi.mocked(User.findById as any).mockResolvedValue(null as never);
    const res = mockRes();
    await adminResetUserPassword(adminReq() as never, res as never);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].message).toMatch(/User not found/);
    expect(mockUserDoc.save).not.toHaveBeenCalled();
  });

  it('returns 403 (and audits) when target user is an admin', async () => {
    vi.mocked(User.findById as any).mockResolvedValue({ ...mockUserDoc, role: 'admin' });
    const res = mockRes();
    await adminResetUserPassword(adminReq() as never, res as never);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].message).toMatch(/Admin passwords cannot be reset/);
    expect(mockUserDoc.save).not.toHaveBeenCalled();
    expect(RefreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 400 when newPassword is missing', async () => {
    vi.mocked(User.findById as any).mockResolvedValue({ ...mockUserDoc });
    const req = adminReq({ body: {} });
    const res = mockRes();
    await adminResetUserPassword(req as never, res as never);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/newPassword is required/);
  });

  it('resets the password, appends audit log, and revokes refresh tokens on success', async () => {
    // Use a fixed _id so we can assert the deleteMany call.
    const userId = new Types.ObjectId();
    mockUserDoc._id = userId;
    // findById returns a fresh spread each call (see mock factory),
    // so we capture the returned object to assert the handler
    // mutated it. The shared `mockUserDoc` is unaffected — that's
    // intentional (the spread is the contract).
    let returned: typeof mockUserDoc | null = null;
    vi.mocked(User.findById as any).mockImplementation(async () => {
      returned = { ...mockUserDoc };
      return returned as never;
    });
    const res = mockRes();
    await adminResetUserPassword(adminReq() as never, res as never);
    // Password was assigned on the returned (spread) object.
    expect((returned as unknown as { password: string }).password).toBe('NewSecure123');
    // Save was called.
    expect((returned as unknown as { save: ReturnType<typeof vi.fn> }).save).toHaveBeenCalledTimes(1);
    // Audit log entry was appended with adminId + the REDACTED marker.
    expect((returned as unknown as { onboardingAuditLog: Array<Record<string, unknown>> }).onboardingAuditLog).toHaveLength(1);
    const entry = (returned as unknown as { onboardingAuditLog: Array<{ changedBy: string; oldValue: string; newValue: string; changedAt: Date }> })
      .onboardingAuditLog[0];
    expect(entry.changedBy).toBe(String(adminId));
    expect(entry.oldValue).toBe('[REDACTED:password]');
    expect(entry.newValue).toBe('[REDACTED:password]');
    expect(entry.changedAt).toBeInstanceOf(Date);
    // Refresh tokens for the target were deleted.
    expect(RefreshToken.deleteMany).toHaveBeenCalledWith({ userId });
    // Response shape.
    if (res.json.mock.calls.length === 0) {
      // Debug aid — surface whatever the handler DID call so we
      // can see where it bailed.
      throw new Error(
        `Handler never called res.json. status calls: ${JSON.stringify(res.status.mock.calls)}`,
      );
    }
    // The success path calls res.json() directly (no preceding
    // res.status() — Express defaults to 200). Assert on the
    // payload that came out of res.json instead.
    expect(res.json.mock.calls[0][0]).toMatchObject({
      userId: String(targetId),
      mustReLogin: true,
    });
    expect(res.json.mock.calls[0][0].message).toMatch(/Password reset successfully/);
  });

  it('returns 500 when save throws', async () => {
    mockUserDoc.save = vi.fn(async () => { throw new Error('db down'); });
    vi.mocked(User.findById as any).mockResolvedValue({ ...mockUserDoc });
    const res = mockRes();
    await adminResetUserPassword(adminReq() as never, res as never);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].message).toBe('Server error');
    // The handler should NOT have called deleteMany after save threw.
    expect(RefreshToken.deleteMany).not.toHaveBeenCalled();
  });
});
