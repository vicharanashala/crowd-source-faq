/**
 * scopedQuery.test — Phase 1 R7: tests for assertSameProgram
 * (strict-by-default). Verifies that the helper now refuses with
 * 404 when there's no program context, instead of silently
 * returning false (the audit flagged this as a cross-tenant
 * write gap).
 */
import { describe, it, expect } from 'vitest';
import { assertSameProgram } from './scopedQuery.js';

function mockRes() {
  const body: { value: unknown } = { value: null };
  let statusCode = 200;
  const res = {
    status(n: number) { statusCode = n; return res; },
    json(b: unknown) { body.value = b; return res; },
    get statusCode() { return statusCode; },
    get body() { return body.value; },
  };
  return res;
}

describe('assertSameProgram — strict by default (Phase 1 R7)', () => {
  it('returns true with 404 when programContext is missing', () => {
    const res = mockRes();
    const result = assertSameProgram({ batchId: 'a'.repeat(24) }, undefined, res);
    expect(result).toBe(true);
    expect(res.statusCode).toBe(404);
    expect((res.body as { message: string }).message).toBe('Not found.');
  });

  it('returns true with 404 when programContext is null', () => {
    const res = mockRes();
    const result = assertSameProgram({ batchId: 'a'.repeat(24) }, null, res);
    expect(result).toBe(true);
    expect(res.statusCode).toBe(404);
  });

  it('returns true with 404 when doc.batchId does not match programContext', () => {
    const res = mockRes();
    const result = assertSameProgram(
      { batchId: 'b'.repeat(24) },
      { batchId: 'a'.repeat(24) },
      res,
    );
    expect(result).toBe(true);
    expect(res.statusCode).toBe(404);
  });

  it('returns true with 404 when doc.batchId is null', () => {
    const res = mockRes();
    const result = assertSameProgram(
      { batchId: null },
      { batchId: 'a'.repeat(24) },
      res,
    );
    expect(result).toBe(true);
    expect(res.statusCode).toBe(404);
  });

  it('returns false (no-op) when doc.batchId matches programContext', () => {
    const res = mockRes();
    const id = 'a'.repeat(24);
    const result = assertSameProgram({ batchId: id }, { batchId: id }, res);
    expect(result).toBe(false);
    expect(res.statusCode).toBe(200); // unchanged
    expect(res.body).toBeNull();
  });
});
