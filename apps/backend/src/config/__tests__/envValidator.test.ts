/**
 * envValidator.ts — M7 fix tests.
 *
 * validateEnv() used to call process.exit(1) on failure, which made it
 * untestable (a failing validation killed the test runner). It now throws
 * a typed EnvValidationError carrying every individual failure message.
 *
 * Covers: missing/malformed MONGODB_URI, missing/short JWT_SECRET,
 *         non-numeric PORT, multiple errors aggregated, valid env passes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv, EnvValidationError } from '../envValidator.js';

const MANAGED_KEYS = ['MONGODB_URI', 'JWT_SECRET', 'PORT', 'NODE_ENV'] as const;

describe('validateEnv() — typed error instead of process.exit (M7)', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of MANAGED_KEYS) original[key] = process.env[key];

    // Baseline valid environment. NODE_ENV stays non-production so the
    // optional checks (GCS etc.) warn instead of erroring.
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/csfaq-test';
    process.env.JWT_SECRET = 'a-test-secret-that-is-at-least-32-chars!';
    delete process.env.PORT;
  });

  afterEach(() => {
    for (const key of MANAGED_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it('rejects a missing MONGODB_URI', () => {
    delete process.env.MONGODB_URI;

    try {
      validateEnv();
      expect.unreachable('validateEnv() should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).errors).toContain('MONGODB_URI is required');
    }
  });

  it('rejects a malformed MONGODB_URI', () => {
    process.env.MONGODB_URI = 'postgres://not-a-mongo-url';

    try {
      validateEnv();
      expect.unreachable('validateEnv() should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).errors).toContain(
        'MONGODB_URI must be a mongodb:// or mongodb+srv:// URL',
      );
    }
  });

  it('rejects a missing JWT_SECRET', () => {
    delete process.env.JWT_SECRET;

    try {
      validateEnv();
      expect.unreachable('validateEnv() should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).errors).toContain('JWT_SECRET is required');
    }
  });

  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    process.env.JWT_SECRET = 'too-short';

    try {
      validateEnv();
      expect.unreachable('validateEnv() should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).errors).toContain(
        'JWT_SECRET must be at least 32 characters',
      );
    }
  });

  it('rejects a non-numeric PORT', () => {
    process.env.PORT = 'eighty-eighty';

    try {
      validateEnv();
      expect.unreachable('validateEnv() should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).errors).toContain('PORT must be numeric');
    }
  });

  it('aggregates every failure into one error', () => {
    delete process.env.MONGODB_URI;
    process.env.JWT_SECRET = 'short';
    process.env.PORT = 'abc';

    try {
      validateEnv();
      expect.unreachable('validateEnv() should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const { errors, message } = err as EnvValidationError;
      expect(errors).toEqual(
        expect.arrayContaining([
          'MONGODB_URI is required',
          'JWT_SECRET must be at least 32 characters',
          'PORT must be numeric',
        ]),
      );
      // The message is a single readable summary of all failures.
      expect(message).toContain('Environment validation failed');
      expect(message).toContain('MONGODB_URI is required');
    }
  });

  it('accepts a valid environment without throwing', () => {
    expect(() => validateEnv()).not.toThrow();
  });

  it('accepts a numeric PORT', () => {
    process.env.PORT = '6767';
    expect(() => validateEnv()).not.toThrow();
  });
});
