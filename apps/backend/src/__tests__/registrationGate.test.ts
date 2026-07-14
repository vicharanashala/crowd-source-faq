/**
 * registrationGate.test.ts — unit tests for the controlled registration gate
 * and email domain restriction.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRegistrationAllowed } from '../utils/auth/registrationGate.js';

const { mockFindById } = vi.hoisted(() => ({
  mockFindById: vi.fn(),
}));

vi.mock('../modules/program/registration-config.model.js', () => ({
  default: {
    findById: (...args: unknown[]) => mockFindById(...args),
  },
  ensureRegistrationConfig: vi.fn(),
}));

describe('registrationGate', () => {
  beforeEach(() => {
    mockFindById.mockClear();
  });

  it('should block registration if config does not exist', async () => {
    mockFindById.mockImplementation(() => ({
      select: () => ({
        lean: () => Promise.resolve(null),
      }),
    }));
    const decision = await checkRegistrationAllowed('token123', 'test@example.com');
    expect(decision.ok).toBe(false);
    expect((decision as any).reason).toBe('disabled');
  });

  it('should block registration if disabled', async () => {
    mockFindById.mockImplementation(() => ({
      select: () => ({
        lean: () => Promise.resolve({
          registrationEnabled: false,
          openForAll: true,
          inviteToken: 'token123',
          allowedDomains: [],
        }),
      }),
    }));
    const decision = await checkRegistrationAllowed('token123', 'test@example.com');
    expect(decision.ok).toBe(false);
    expect((decision as any).reason).toBe('disabled');
  });

  it('should block registration if email domain is not in allowedDomains list', async () => {
    mockFindById.mockImplementation(() => ({
      select: () => ({
        lean: () => Promise.resolve({
          registrationEnabled: true,
          openForAll: true,
          inviteToken: 'token123',
          allowedDomains: ['flowkey.io', 'college.edu'],
        }),
      }),
    }));
    const decision = await checkRegistrationAllowed('token123', 'test@gmail.com');
    expect(decision.ok).toBe(false);
    expect((decision as any).reason).toBe('unauthorized_domain');
  });

  it('should allow registration if email domain matches allowedDomains list', async () => {
    mockFindById.mockImplementation(() => ({
      select: () => ({
        lean: () => Promise.resolve({
          registrationEnabled: true,
          openForAll: true,
          inviteToken: 'token123',
          allowedDomains: ['flowkey.io', 'college.edu'],
        }),
      }),
    }));
    const decision1 = await checkRegistrationAllowed('token123', 'test@flowkey.io');
    expect(decision1.ok).toBe(true);

    const decision2 = await checkRegistrationAllowed('token123', 'student@college.edu');
    expect(decision2.ok).toBe(true);
  });

  it('should allow any domain if allowedDomains is empty', async () => {
    mockFindById.mockImplementation(() => ({
      select: () => ({
        lean: () => Promise.resolve({
          registrationEnabled: true,
          openForAll: true,
          inviteToken: 'token123',
          allowedDomains: [],
        }),
      }),
    }));
    const decision = await checkRegistrationAllowed('token123', 'test@gmail.com');
    expect(decision.ok).toBe(true);
  });

  it('should require a valid token if openForAll is false', async () => {
    mockFindById.mockImplementation(() => ({
      select: () => ({
        lean: () => Promise.resolve({
          registrationEnabled: true,
          openForAll: false,
          inviteToken: 'token123',
          allowedDomains: [],
        }),
      }),
    }));
    const decision1 = await checkRegistrationAllowed(undefined, 'test@gmail.com');
    expect(decision1.ok).toBe(false);
    expect((decision1 as any).reason).toBe('missing_token');

    const decision2 = await checkRegistrationAllowed('wrongtoken', 'test@gmail.com');
    expect(decision2.ok).toBe(false);
    expect((decision2 as any).reason).toBe('invalid_token');

    const decision3 = await checkRegistrationAllowed('token123', 'test@gmail.com');
    expect(decision3.ok).toBe(true);
  });
});
