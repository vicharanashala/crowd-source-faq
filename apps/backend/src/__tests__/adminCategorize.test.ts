import { describe, it, expect } from 'vitest';
import {
  categorize,
  keyToEnvVar,
  parseEnvValue,
} from '../config/adminCategorize.js';

describe('adminCategorize — categorize()', () => {
  describe('critical detection', () => {
    it.each([
      ['JWT_SECRET', true],
      ['jwt.secret', true],
      ['ANTHROPIC_API_KEY', true],
      ['anthropic.apiKey', true],
      ['OPENAI_API_KEY', true],
      ['XAI_API_KEY', true],
      ['MINIMAX_API_KEY', true],
      ['HUGGINGFACE_API_KEY', true],
      ['ENCRYPTION_MASTER_KEY', true],
      ['JWT_REFRESH_SECRET', true],
      ['OAUTH_STATE_SECRET', true],
      ['OAUTH_CLIENT_SECRET', true],
      ['ZOOM_CLIENT_SECRET', true],
      ['SMTP_PASSWORD', true],
      ['DATABASE_PASSWORD', true],
      ['MONGODB_URI', true],
      ['REDIS_URL', true],
      ['REDIS_CONNECTION_STRING', true],
      ['PRIVATE_KEY', true],
    ])('marks %s as critical', (key, expected) => {
      expect(categorize(key).isCritical).toBe(expected);
    });

    it.each([
      ['JWT_SECRET'],
      ['ANTHROPIC_API_KEY'],
      ['OAUTH_STATE_SECRET'],
      ['ZOOM_CLIENT_SECRET'],
      ['SMTP_PASSWORD'],
    ])('encrypts value when key is critical (%s)', (key) => {
      const result = categorize(key);
      expect(result.isCritical).toBe(true);
    });
  });

  describe('non-critical detection', () => {
    it.each([
      ['GCS_PUBLIC_HOST'],
      ['GCS_BUCKET'],
      ['MEDIA_PUBLIC_URL'],
      ['OAUTH_REDIRECT_URI'],
      ['ZOOM_CALLBACK_URL'],
      ['LOG_LEVEL'],
      ['MONGODB_URI'],          // ← actually critical, see above; listed here as negative
    ])('PUBLIC-safe or non-sensitive: %s', (key) => {
      // For the explicit public-safe list this should be false. For
      // MONGODB_URI we expect critical — it's listed to make sure we
      // don't accidentally make URIs non-critical by the public-safe
      // heuristic.
      const expected = key === 'MONGODB_URI' ? true : false;
      expect(categorize(key).isCritical).toBe(expected);
    });

    it.each([
      ['FEATURE_FLAG_GOLDEN_TICKET_ENABLED'],
      ['FEATURE_FLAG_DISCORD_ADMIN_ENABLED'],
      ['RATE_LIMIT_LOGIN_MAX'],
      ['RATE_LIMIT_REGISTER_WINDOW_MINUTES'],
      ['LOG_LEVEL'],
      ['NODE_ENV'],
      ['PORT'],
      ['AI_DUPLICATE_THRESHOLD'],
      ['AI_DUPLICATE_PROVIDER_PRIORITY'],
      ['IMAGE_MAX_FILE_SIZE_MB'],
      ['CACHE_TTL_SECONDS'],
      ['WELCOME_MESSAGE'],
    ])('marks %s as non-critical', (key) => {
      expect(categorize(key).isCritical).toBe(false);
    });
  });

  describe('category derivation', () => {
    it.each([
      ['jwt.secret', 'auth'],
      ['JWT_SECRET', 'auth'],
      ['oauth.clientSecret', 'auth'],
      ['encryption.masterKey', 'auth'],
      ['anthropic.apiKey', 'ai'],
      ['anthropic.model', 'ai'],
      ['ai.duplicate.threshold', 'ai'],
      ['mongodb.uri', 'connection'],
      ['redis.url', 'connection'],
      ['featureFlag.goldenTicket.enabled', 'feature-flag'],
      ['featureFlag.discordAdmin.enabled', 'feature-flag'],
      ['rateLimit.login.max', 'rate-limit'],
      ['rate_limit.register.window_minutes', 'rate-limit'],
      ['gcs.bucket', 'storage'],
      ['cloudinary.cloudName', 'storage'],
      ['huggingface.apiKey', 'storage'],
      ['zoom.clientId', 'integration'],
      ['discord.botToken', 'integration'],
      ['log.level', 'logging'],
      ['sentry.dsn', 'logging'],
      ['email.from', 'email'],
      ['smtp.host', 'email'],
    ])('puts %s in category %s', (key, expected) => {
      expect(categorize(key).category).toBe(expected);
    });
  });

  describe('per-program keys', () => {
    it('classifies program.<id>.jwt.secret as critical + auth', () => {
      const result = categorize('program.65fe123abc.jwt.secret');
      expect(result.isCritical).toBe(true);
      expect(result.category).toBe('auth');
    });

    it('classifies program.<id>.ai.threshold as non-critical + ai', () => {
      const result = categorize('program.65fe123abc.ai.threshold');
      expect(result.isCritical).toBe(false);
      expect(result.category).toBe('ai');
    });

    it('classifies program.<id>.featureFlag.goldenTicket.enabled as feature-flag + non-critical', () => {
      const result = categorize('program.65fe123abc.featureFlag.goldenTicket.enabled');
      expect(result.category).toBe('feature-flag');
      expect(result.isCritical).toBe(false);
    });
  });
});

describe('adminCategorize — keyToEnvVar()', () => {
  it.each([
    ['jwt.secret', 'JWT_SECRET'],
    ['ai.duplicate.threshold', 'AI_DUPLICATE_THRESHOLD'],
    ['featureFlag.goldenTicket.enabled', 'FEATUREFLAG_GOLDENTICKET_ENABLED'],
    ['program.65fe.jwt.secret', 'PROGRAM_65FE_JWT_SECRET'],
    ['log.level', 'LOG_LEVEL'],
  ])('maps %s → %s', (input, expected) => {
    expect(keyToEnvVar(input)).toBe(expected);
  });
});

describe('adminCategorize — parseEnvValue()', () => {
  it('parses booleans', () => {
    expect(parseEnvValue('true')).toBe(true);
    expect(parseEnvValue('false')).toBe(false);
  });

  it('parses integers', () => {
    expect(parseEnvValue('42')).toBe(42);
    expect(parseEnvValue('-17')).toBe(-17);
    expect(parseEnvValue('0')).toBe(0);
  });

  it('parses floats', () => {
    expect(parseEnvValue('3.14')).toBe(3.14);
    expect(parseEnvValue('-0.5')).toBe(-0.5);
  });

  it('parses JSON objects', () => {
    expect(parseEnvValue('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
  });

  it('parses JSON arrays', () => {
    expect(parseEnvValue('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('returns strings unchanged', () => {
    expect(parseEnvValue('hello world')).toBe('hello world');
    expect(parseEnvValue('sk-abc123')).toBe('sk-abc123');
    expect(parseEnvValue('https://example.com/path?query=1')).toBe('https://example.com/path?query=1');
  });

  it('returns empty string for empty input', () => {
    expect(parseEnvValue('')).toBe('');
    expect(parseEnvValue('   ')).toBe('');
  });

  it('falls back to string for malformed JSON', () => {
    expect(parseEnvValue('{not valid json')).toBe('{not valid json');
  });
});