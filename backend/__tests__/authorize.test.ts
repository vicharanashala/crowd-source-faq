import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { authorize, type AuthedRequest } from '../middleware/authShared.js';

function createResponse() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { response: { status } as unknown as Response, status, json };
}

describe('authorize', () => {
  it('returns 403 without calling next when the user lacks an allowed role', () => {
    const req = { user: { role: 'user' } } as unknown as AuthedRequest;
    const { response, status, json } = createResponse();
    const next = vi.fn() as NextFunction;

    authorize('admin', 'moderator')(req as Request, response, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ message: 'Insufficient permissions.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next without writing a response when the user has an allowed role', () => {
    const req = { user: { role: 'moderator' } } as unknown as AuthedRequest;
    const { response, status, json } = createResponse();
    const next = vi.fn() as NextFunction;

    authorize('admin', 'moderator')(req as Request, response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });
});
