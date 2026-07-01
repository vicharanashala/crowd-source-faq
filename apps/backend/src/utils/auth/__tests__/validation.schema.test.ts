import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  passwordPolicy,
  warnUserSchema,
} from '../validation.js';

/**
 * Security regression tests for the central Zod request schemas.
 *
 * These lock in three properties verified during the QA/security audit:
 *   1. Password policy strength (min 8, letter + digit, max 128).
 *   2. NoSQL-injection resistance — operator objects ({$ne, $gt, ...}) are
 *      rejected because the schema coerces nothing and requires `string`.
 *   3. Mass-assignment resistance — Zod `.object()` strips unknown keys, so a
 *      `role`/`isBanned` slipped into a register body never reaches the model.
 */
describe('auth validation — password policy', () => {
  const valid = ['passw0rd', 'Sup3rSecret', 'a1b2c3d4', 'Tr0ubadour!'];
  const invalid: Array<[string, unknown]> = [
    ['too short', 'pass1'],
    ['no digit', 'passwordonly'],
    ['no letter', '12345678'],
    ['empty', ''],
    ['legacy 6-char', 'abcde1'],
  ];

  it('accepts passwords that meet the policy', () => {
    for (const pw of valid) {
      expect(passwordPolicy.safeParse(pw).success, `expected "${pw}" to pass`).toBe(true);
    }
  });

  it('rejects weak passwords', () => {
    for (const [label, pw] of invalid) {
      expect(passwordPolicy.safeParse(pw).success, `expected "${label}" to fail`).toBe(false);
    }
  });

  it('rejects passwords longer than 128 chars (bcrypt-work / DoS bound)', () => {
    const huge = 'a1'.repeat(100); // 200 chars
    expect(passwordPolicy.safeParse(huge).success).toBe(false);
  });

  it('registerSchema enforces the policy on password', () => {
    expect(
      registerSchema.safeParse({ name: 'Ada', email: 'ada@example.com', password: 'short1' }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ name: 'Ada', email: 'ada@example.com', password: 'goodpass1' }).success,
    ).toBe(true);
  });

  it('changePasswordSchema enforces the policy on newPassword', () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'weak' }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'strongpass9' }).success,
    ).toBe(true);
  });

  it('loginSchema stays lenient so legacy accounts can still authenticate', () => {
    // Login must NOT enforce the new policy — a pre-existing 4-char password
    // should still pass schema validation (bcrypt compare decides correctness).
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'old' }).success).toBe(true);
  });
});

describe('auth validation — NoSQL injection resistance', () => {
  it('rejects an operator object where a string email is required (login)', () => {
    const res = loginSchema.safeParse({ email: { $ne: null }, password: { $gt: '' } });
    expect(res.success).toBe(false);
  });

  it('rejects an operator object on register email', () => {
    const res = registerSchema.safeParse({
      name: 'Eve',
      email: { $gt: '' },
      password: 'goodpass1',
    });
    expect(res.success).toBe(false);
  });

  it('rejects array-smuggled values', () => {
    expect(loginSchema.safeParse({ email: ['a@b.com'], password: 'x' }).success).toBe(false);
  });
});

describe('auth validation — mass-assignment / privilege escalation resistance', () => {
  it('strips unknown keys (role, isBanned) from a register payload', () => {
    const parsed = registerSchema.parse({
      name: 'Mallory',
      email: 'mallory@example.com',
      password: 'goodpass1',
      role: 'admin',
      isBanned: false,
      points: 9999,
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty('role');
    expect(parsed).not.toHaveProperty('isBanned');
    expect(parsed).not.toHaveProperty('points');
    expect(Object.keys(parsed).sort()).toEqual(['email', 'name', 'password']);
  });
});

describe('moderation validation — ObjectId guards reject injection payloads', () => {
  it('rejects non-ObjectId userId in warnUserSchema', () => {
    expect(warnUserSchema.safeParse({ userId: { $ne: null }, reason: 'spam abuse' }).success).toBe(false);
    expect(warnUserSchema.safeParse({ userId: 'not-an-id', reason: 'spam abuse' }).success).toBe(false);
  });

  it('accepts a well-formed 24-hex ObjectId', () => {
    expect(
      warnUserSchema.safeParse({ userId: '6a43444d9b5e9d5de147c739', reason: 'spam abuse' }).success,
    ).toBe(true);
  });
});
