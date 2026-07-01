import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────
//
// `vi.mock` factories are hoisted to the top of the file, so the mock
// implementation must be self-contained or use vi.hoisted(). Without
// vi.hoisted, the top-level `const mockFindOne = vi.fn()` declarations
// would be undefined when vi.mock's factory runs.
const { mockFindOne, mockFindOneAndUpdate, mockDeleteOne, mockAuditCreate } = vi.hoisted(() => {
  const mockFindOne = vi.fn();
  const mockFindOneAndUpdate = vi.fn();
  const mockDeleteOne = vi.fn();
  const mockAuditCreate = vi.fn();
  return { mockFindOne, mockFindOneAndUpdate, mockDeleteOne, mockAuditCreate };
});

vi.mock('../models/AdminConfig.js', () => ({
  default: {
    findOne: (...args: unknown[]) => ({ select: () => ({ lean: () => mockFindOne(...args) }) }),
    findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
    deleteOne: (...args: unknown[]) => mockDeleteOne(...args),
  },
}));

vi.mock('../models/AdminAuditLog.js', () => ({
  default: { create: (...args: unknown[]) => mockAuditCreate(...args) },
  // AdminAction + AdminSource types are referenced only via the union,
  // not at runtime, so the test doesn't need to export them.
}));

// Mock crypto to avoid pulling in the real encryption.
vi.mock('../utils/auth/crypto.js', () => ({
  encrypt: (s: string) => `ENC(${s})`,
  decrypt: (s: string) => s.replace(/^ENC\((.+)\)$/, '$1'),
}));

const { setConfig, deleteConfig, validateKey, normaliseProgramId } = await import(
  '../modules/admin/admin.config.service.js'
);

const SAMPLE_INPUT = {
  key: 'jwt.secret',
  value: 'shhh-this-is-a-secret',
  source: 'rest' as const,
  adminId: '65feadmin001',
  adminUsername: 'yashh',
  ipAddress: '127.0.0.1',
  userAgent: 'curl/8.0',
  note: 'test write',
};

beforeEach(() => {
  mockFindOne.mockReset();
  mockFindOneAndUpdate.mockReset();
  mockDeleteOne.mockReset();
  mockAuditCreate.mockReset();
  // Default: no existing row
  mockFindOne.mockResolvedValue(null);
  // Default: successful upsert returning a fake ObjectId
  mockFindOneAndUpdate.mockResolvedValue({ _id: 'fakeid123' });
  // Default: successful delete
  mockDeleteOne.mockResolvedValue({ deletedCount: 1 });
  // Default: audit create resolves
  mockAuditCreate.mockResolvedValue(undefined);
});

describe('admin.config.service — setConfig()', () => {
  it('encrypts the value when the key is critical', async () => {
    const result = await setConfig(SAMPLE_INPUT);
    expect(result.ok).toBe(true);
    expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
    const writeCall = mockFindOneAndUpdate.mock.calls[0];
    const update = writeCall[1] as { $set: { value: string; encrypted: boolean } };
    expect(update.$set.encrypted).toBe(true);
    // Value is encrypted (NOT plaintext)
    expect(update.$set.value).not.toBe('shhh-this-is-a-secret');
    expect(update.$set.value).toMatch(/^ENC\(/);
  });

  it('stores plaintext when the key is non-critical', async () => {
    const result = await setConfig({ ...SAMPLE_INPUT, key: 'featureFlag.goldenTicket.enabled', value: true });
    expect(result.ok).toBe(true);
    const update = mockFindOneAndUpdate.mock.calls[0][1] as { $set: { value: string; encrypted: boolean } };
    expect(update.$set.encrypted).toBe(false);
    expect(update.$set.value).toBe('true'); // Stringify: boolean -> 'true'
  });

  it('stores JSON objects as JSON strings', async () => {
    const result = await setConfig({
      ...SAMPLE_INPUT,
      key: 'rateLimit.login',
      value: { max: 10, windowMinutes: 15 },
    });
    expect(result.ok).toBe(true);
    const update = mockFindOneAndUpdate.mock.calls[0][1] as { $set: { value: string } };
    expect(JSON.parse(update.$set.value)).toEqual({ max: 10, windowMinutes: 15 });
  });

  it('rejects malformed keys', async () => {
    const result = await setConfig({ ...SAMPLE_INPUT, key: 'jwt..secret' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/INVALID_KEY/);
  });

  it('rejects keys with invalid characters', async () => {
    const result = await setConfig({ ...SAMPLE_INPUT, key: 'jwt secret' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/INVALID_KEY/);
  });

  it('rejects keys that exceed the max length', async () => {
    const longKey = 'a'.repeat(250);
    const result = await setConfig({ ...SAMPLE_INPUT, key: longKey });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/INVALID_KEY/);
  });

  it('uses programId null for global writes', async () => {
    await setConfig({ ...SAMPLE_INPUT });
    const filter = mockFindOneAndUpdate.mock.calls[0][0] as { programId: string | null };
    expect(filter.programId).toBe(null);
  });

  it('scopes writes by programId when provided', async () => {
    await setConfig({ ...SAMPLE_INPUT, programId: '65feprogram01' });
    const filter = mockFindOneAndUpdate.mock.calls[0][0] as { programId: string };
    expect(filter.programId).toBe('65feprogram01');
  });

  it('sets category from the categorizer on the upsert', async () => {
    await setConfig({ ...SAMPLE_INPUT, key: 'anthropic.apiKey', value: 'sk-test' });
    const update = mockFindOneAndUpdate.mock.calls[0][1] as { $set: { category: string } };
    expect(update.$set.category).toBe('ai');
  });

  it('always appends an audit log entry — success or failure', async () => {
    await setConfig(SAMPLE_INPUT);
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const audit = mockAuditCreate.mock.calls[0][0] as {
      action: string;
      success: boolean;
      key: string;
      source: string;
      wasCritical: boolean;
    };
    expect(audit.action).toBe('config.set');
    expect(audit.success).toBe(true);
    expect(audit.key).toBe('jwt.secret');
    expect(audit.source).toBe('rest');
    expect(audit.wasCritical).toBe(true);
  });

  it('logs value as redacted for critical keys', async () => {
    await setConfig(SAMPLE_INPUT);
    const audit = mockAuditCreate.mock.calls[0][0] as {
      oldValue: string;
      newValue: string;
    };
    expect(audit.oldValue).toBe('***REDACTED***');
    expect(audit.newValue).toBe('***REDACTED***');
  });

  it('logs the actual value for non-critical keys', async () => {
    await setConfig({ ...SAMPLE_INPUT, key: 'featureFlag.goldenTicket.enabled', value: true });
    const audit = mockAuditCreate.mock.calls[0][0] as {
      oldValue: string;
      newValue: string;
    };
    expect(audit.newValue).toBe('true');
  });

  it('reports failure when the upsert throws', async () => {
    mockFindOneAndUpdate.mockRejectedValue(new Error('mongo down'));
    const result = await setConfig(SAMPLE_INPUT);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/mongo down/);
    // Audit still gets written, with success=false
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const audit = mockAuditCreate.mock.calls[0][0] as { success: boolean; errorMessage: string };
    expect(audit.success).toBe(false);
    expect(audit.errorMessage).toMatch(/mongo down/);
  });

  it('compares old vs new value for valueChanged (non-critical)', async () => {
    mockFindOne.mockResolvedValue({ value: 'false', encrypted: false });
    await setConfig({ ...SAMPLE_INPUT, key: 'featureFlag.goldenTicket.enabled', value: true });
    const audit = mockAuditCreate.mock.calls[0][0] as { valueChanged: boolean };
    expect(audit.valueChanged).toBe(true);
  });

  it('marks valueChanged=true when old is encrypted (cannot diff)', async () => {
    mockFindOne.mockResolvedValue({ value: 'ENC(old)', encrypted: true });
    await setConfig(SAMPLE_INPUT);
    const audit = mockAuditCreate.mock.calls[0][0] as { valueChanged: boolean };
    expect(audit.valueChanged).toBe(true);
  });
});

describe('admin.config.service — deleteConfig()', () => {
  it('deletes a global override', async () => {
    const result = await deleteConfig({
      key: 'featureFlag.discordAdmin.enabled',
      source: 'rest',
      adminId: '65feadmin001',
      adminUsername: 'yashh',
    });
    expect(result.ok).toBe(true);
    expect(mockDeleteOne).toHaveBeenCalledWith({ key: 'featureFlag.discordAdmin.enabled', programId: null });
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
  });

  it('returns NOT_FOUND when no row exists', async () => {
    mockDeleteOne.mockResolvedValue({ deletedCount: 0 });
    const result = await deleteConfig({
      key: 'featureFlag.nonexistent.enabled',
      source: 'rest',
      adminId: '65feadmin001',
      adminUsername: 'yashh',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/NOT_FOUND/);
  });

  it('still appends an audit log on failure', async () => {
    mockDeleteOne.mockResolvedValue({ deletedCount: 0 });
    await deleteConfig({
      key: 'featureFlag.nonexistent.enabled',
      source: 'rest',
      adminId: '65feadmin001',
      adminUsername: 'yashh',
    });
    const audit = mockAuditCreate.mock.calls[0][0] as { success: boolean; action: string };
    expect(audit.success).toBe(false);
    expect(audit.action).toBe('config.delete');
  });
});

describe('admin.config.service — validateKey() (internal)', () => {
  it.each([
    ['jwt.secret', true],
    ['a.b.c.d.e', true],
    ['featureFlag.goldenTicket.enabled', true],
    ['program.65fe.jwt.secret', true],         // per-program override, program id starts with digit
    ['program.65feabc123abc123abc123ab.ai.threshold', true], // realistic ObjectId
    ['AI_DUPLICATE_THRESHOLD', true],          // all-caps key works
    ['_starts_with_underscore', true],          // leading _ allowed for system keys
    ['has spaces', false],
    ['jwt..secret', false],                    // consecutive dots
    ['jwt!secret', false],
    ['', false],
    // Per the regex [a-zA-Z0-9][a-zA-Z0-9_]*, segments may start with
    // either a letter OR a digit — required for per-program keys
    // (program.<24-char-hex>.<rest>). 123numbers IS valid.
    ['123numbers', true],
  ])('validates %s -> %s', (key, valid) => {
    if (valid) {
      expect(() => validateKey(key)).not.toThrow();
    } else {
      expect(() => validateKey(key)).toThrow();
    }
  });
});

describe('admin.config.service — normaliseProgramId() (internal)', () => {
  it('returns null for null/undefined', () => {
    expect(normaliseProgramId(null)).toBe(null);
    expect(normaliseProgramId(undefined)).toBe(null);
  });

  it('returns strings unchanged', () => {
    expect(normaliseProgramId('65feprogram01')).toBe('65feprogram01');
  });

  it('converts ObjectId-like objects to string', () => {
    const fakeObjectId = { toString: () => '65feprogram02' };
    expect(normaliseProgramId(fakeObjectId as never)).toBe('65feprogram02');
  });
});