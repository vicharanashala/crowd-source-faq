import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mockExists = vi.hoisted(() => vi.fn());
vi.mock('../../modules/program/program-enrollment.model.js', () => ({
  default: { exists: mockExists },
}));

const { enforceProgramMembership } = await import('../programScope.js');

function mockRes() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('enforceProgramMembership', () => {
  beforeEach(() => {
    mockExists.mockReset();
  });

  it('lets anonymous requests through unchanged (no req.user)', async () => {
    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn();
    await enforceProgramMembership()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(mockExists).not.toHaveBeenCalled();
  });

  it('lets requests with no requested batch through (no req.programContext)', async () => {
    const req = { user: { role: 'student' } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await enforceProgramMembership()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('lets global admins read any program', async () => {
    const req = {
      user: { role: 'admin' },
      programContext: { batchId: 'vriddhi', batchName: 'Vriddhi', isActive: true },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await enforceProgramMembership()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(mockExists).not.toHaveBeenCalled();
  });

  it('blocks a global moderator without admin access from another program they DO have other enrollments but not this one', async () => {
    mockExists.mockResolvedValue(true); // has SOME active enrollment, just not this batch
    const req = {
      user: { _id: 'u1', role: 'moderator' },
      programContext: { batchId: 'vriddhi', batchName: 'Vriddhi', isActive: true },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await enforceProgramMembership()(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('blocks a signed-in student requesting a program they are not enrolled in, when they DO have another active enrollment', async () => {
    mockExists.mockResolvedValue(true);
    const req = {
      user: { _id: 'u1', role: 'student' },
      programContext: { batchId: 'vriddhi', batchName: 'Vriddhi', isActive: true },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await enforceProgramMembership()(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/not enrolled/i) })
    );
  });

  it('incident fix: fails OPEN for a signed-in student with ZERO ProgramEnrollment rows at all (unmigrated legacy account)', async () => {
    // This is the regression this test guards: a real, already-enrolled
    // student (never went through the v2 SSO bridge / never backfilled)
    // has no ProgramEnrollment row for their own batch. Previously this
    // 403'd them off their own home page. They must be let through.
    mockExists.mockResolvedValue(false);
    const req = {
      user: { _id: 'u2', role: 'student' },
      programContext: { batchId: 'summership', batchName: 'summership', isActive: true },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await enforceProgramMembership()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('lets an enrolled student read their own program (req.programEnrollment already attached by programScope)', async () => {
    const req = {
      user: { _id: 'u3', role: 'student' },
      programContext: { batchId: 'summership', batchName: 'summership', isActive: true },
      programEnrollment: {
        userId: 'u3',
        batchId: 'summership',
        programRole: 'student',
        enrolledAt: new Date(),
      },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await enforceProgramMembership()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(mockExists).not.toHaveBeenCalled();
  });
});
