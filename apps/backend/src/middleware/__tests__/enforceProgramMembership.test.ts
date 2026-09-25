import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { enforceProgramMembership } from '../programScope.js';

function mockRes() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('enforceProgramMembership', () => {
  it('lets anonymous requests through unchanged (no req.user)', () => {
    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn();
    enforceProgramMembership()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('lets requests with no requested batch through (no req.programContext)', () => {
    const req = { user: { role: 'student' } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    enforceProgramMembership()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('lets global admins read any program', () => {
    const req = {
      user: { role: 'admin' },
      programContext: { batchId: 'vriddhi', batchName: 'Vriddhi', isActive: true },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    enforceProgramMembership()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('lets moderators read any program', () => {
    const req = {
      user: { role: 'moderator' },
      programContext: { batchId: 'vriddhi', batchName: 'Vriddhi', isActive: true },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    enforceProgramMembership()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('blocks a signed-in student requesting a program they are not enrolled in (the reported bug)', () => {
    // A summership-only student switches the "program" dropdown to Vriddhi:
    // programScope() resolved the batchId to a real, active batch, but found
    // no matching ProgramEnrollment for this user, so req.programEnrollment
    // is unset.
    const req = {
      user: { role: 'student' },
      programContext: { batchId: 'vriddhi', batchName: 'Vriddhi', isActive: true },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    enforceProgramMembership()(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/not enrolled/i) })
    );
  });

  it('lets an enrolled student read their own program', () => {
    const req = {
      user: { role: 'student' },
      programContext: { batchId: 'summership', batchName: 'summership', isActive: true },
      programEnrollment: {
        userId: 'u1',
        batchId: 'summership',
        programRole: 'student',
        enrolledAt: new Date(),
      },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    enforceProgramMembership()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
