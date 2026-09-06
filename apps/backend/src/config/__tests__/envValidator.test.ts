// ─────────────────────────────────────────────────────────────────────────
// Tests for #232 — by Aswini Kumar Dhar
//
// WHAT THIS FILE PROVES: validateEnv() now throws a catchable
// EnvValidationError instead of calling process.exit(1) directly, so it
// can finally be unit-tested — which was impossible before this fix,
// since calling validateEnv() with a broken environment used to kill the
// entire Vitest process along with whatever else was running.
// ─────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateEnv, EnvValidationError } from '../envValidator.js';
import { logger } from '../../utils/http/logger.js';

// validateEnv() reads process.env directly (no separate config-loading
// step), so we snapshot and restore it around every test to avoid one
// test's broken environment leaking into the next.
const ORIGINAL_ENV = { ...process.env };

describe('validateEnv (#232 — catchable EnvValidationError)', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    // Baseline valid environment — each test below breaks exactly one
    // thing, so we know precisely which check fired.
    process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/db';
    process.env.JWT_SECRET = 'a'.repeat(32);
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('does not throw when MONGODB_URI and JWT_SECRET are both valid', () => {
    expect(() => validateEnv()).not.toThrow();
  });

  it('throws EnvValidationError (not process.exit) when MONGODB_URI is missing', () => {
    delete process.env.MONGODB_URI;
    expect(() => validateEnv()).toThrow(EnvValidationError);
  });

  it('includes the specific missing-var message in err.errors', () => {
    delete process.env.MONGODB_URI;
    try {
      validateEnv();
      expect.fail('validateEnv() should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).errors).toContain('MONGODB_URI is required');
    }
  });

  it('throws when JWT_SECRET is shorter than 32 characters', () => {
    process.env.JWT_SECRET = 'too-short';
    expect(() => validateEnv()).toThrow(EnvValidationError);
  });

  it('collects multiple errors in a single throw rather than failing fast', () => {
    delete process.env.MONGODB_URI;
    delete process.env.JWT_SECRET;
    try {
      validateEnv();
      expect.fail('validateEnv() should have thrown');
    } catch (err) {
      const e = err as EnvValidationError;
      expect(e.errors.length).toBeGreaterThanOrEqual(2);
      expect(e.errors).toContain('MONGODB_URI is required');
      expect(e.errors).toContain('JWT_SECRET is required');
    }
  });

  // This is the exact scenario the issue was filed about: before this
  // fix, this test would have killed the whole Vitest process instead of
  // producing a clean pass/fail.
  it('can be asserted with expect().toThrow() without killing the test runner', () => {
    delete process.env.MONGODB_URI;
    expect(() => validateEnv()).toThrow('MONGODB_URI is required');
  });
});

// Mirrors the exact try/catch now living in server.ts, without importing
// server.ts itself — server.ts has real side effects (app.listen(), a
// live Mongo connection) at import time, which a unit test shouldn't
// trigger just to check this one behavior.
describe('boot-boundary behavior (mirrors server.ts)', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.MONGODB_URI; // force a failure to exercise the catch path
    vi.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('logs each error line and exits with code 1 when validation fails', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    try {
      validateEnv();
    } catch (err) {
      if (err instanceof EnvValidationError) {
        logger.error('Environment validation failed:');
        err.errors.forEach((e) => logger.error(`  - ${e}`));
        process.exit(1);
      } else {
        throw err;
      }
    }

    expect(logger.error).toHaveBeenCalledWith('Environment validation failed:');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('MONGODB_URI is required'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});