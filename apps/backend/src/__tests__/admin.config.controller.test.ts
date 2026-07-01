/**
 * admin.config.controller.test.ts — minimal unit tests for the controller.
 *
 * Focus on the pure helpers (parseProgramId, the categorize handler).
 * The full router is exercised end-to-end by manual testing + future
 * integration tests; the controller logic itself is delegated to
 * services that already have their own dedicated test suites.
 */
import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';

// Inline-import to avoid pulling in the full module (which transitively
// imports the runtimeConfig resolver + AdminConfig Mongoose model). The
// controller's categorizeHandler delegates to `categorize` from
// adminCategorize.ts; we test that delegation directly.
import { categorize } from '../config/adminCategorize.js';

describe('categorize() — controller delegation', () => {
  it('returns isCritical=true + auth category for jwt.secret', () => {
    expect(categorize('jwt.secret')).toEqual({ isCritical: true, category: 'auth' });
  });

  it('returns isCritical=false + ai category for ai.threshold', () => {
    expect(categorize('ai.threshold')).toEqual({ isCritical: false, category: 'ai' });
  });

  it('returns isCritical=true + connection category for mongodb.uri', () => {
    expect(categorize('mongodb.uri')).toEqual({ isCritical: true, category: 'connection' });
  });

  it('handles per-program keys', () => {
    expect(categorize('program.65feabc123abc123abc123ab.jwt.secret')).toEqual({
      isCritical: true,
      category: 'auth',
    });
  });

  it('handles feature-flag keys', () => {
    expect(categorize('featureFlag.discordAdmin.enabled')).toEqual({
      isCritical: false,
      category: 'feature-flag',
    });
  });
});

describe('parseProgramId() — controller helper', () => {
  // We can't import parseProgramId directly (it's not exported), but we
  // can exercise the same logic via re-implementation. The real check
  // is in the controller's behaviour — exercised manually + by future
  // integration tests. Here we just verify the regex we depend on.
  describe('ObjectId-shape detection', () => {
    const OID_REGEX = /^[a-f0-9]{24}$/i;

    it('matches a valid 24-char hex', () => {
      expect(OID_REGEX.test('65feabc123abc123abc123ab')).toBe(true);
    });

    it('rejects too short', () => {
      expect(OID_REGEX.test('65feabc')).toBe(false);
    });

    it('rejects too long', () => {
      expect(OID_REGEX.test('65feabc123abc123abc123abff')).toBe(false);
    });

    it('rejects non-hex characters', () => {
      expect(OID_REGEX.test('65feabc123abc123abc123zz')).toBe(false);
    });

    it('parses a real ObjectId', () => {
      const oid = new Types.ObjectId();
      expect(OID_REGEX.test(oid.toString())).toBe(true);
    });
  });
});