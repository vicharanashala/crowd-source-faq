/**
 * Tests for the AI provider fallback chain.
 *
 * Strategy: stub `chatWithConfig` to return programmable
 * outcomes (success / retriable failure / non-retriable failure)
 * and assert that `runWithFallback` walks the chain correctly.
 *
 * The chain resolution + env mutation logic is tested through the
 * public `runWithFallback` interface — we don't need to mock the
 * AiConfig DB layer because we drive the chain via
 * `primaryOverride` (which skips the chain resolution) and
 * directly set FALLBACK_PROVIDERS / ENABLE_AI_FALLBACK env vars.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chatWithConfig + getPipelineProviderConfig before
// importing the module under test. vi.mock is hoisted, so this
// happens before the dynamic imports.
const mockChatWithConfig = vi.fn();

vi.mock('../../../utils/ai/aiProvider.js', async () => {
  const actual = await vi.importActual<typeof import('../../../utils/ai/aiProvider.js')>('../../../utils/ai/aiProvider.js');
  return {
    ...actual,
    chatWithConfig: (...args: unknown[]) => mockChatWithConfig(...args),
    // getPipelineProviderConfig stays un-mocked — we use
    // primaryOverride to bypass it.
  };
});

vi.mock('../../../modules/ai/ai-config.model.js', () => ({
  // The DB read happens in resolveFallbackChain. Return null
  // for these tests so the per-feature block is absent and
  // FALLBACK_PROVIDERS env takes over.
  default: {
    findOne: () => ({ lean: async () => null }),
  },
}));

import { runWithFallback, DEFAULT_FALLBACK_CHAIN } from '../fallbackChain.js';
import { chatWithConfig } from '../../../utils/ai/aiProvider.js';
import type { ProviderConfig } from '../../../utils/ai/aiProvider.js';

const ANTHROPIC_CFG: ProviderConfig = {
  provider: 'anthropic',
  apiKey: 'sk-test-anthropic',
  baseURL: 'https://api.anthropic.com/v1',
  modelName: 'claude-sonnet-4-20250514',
  authHeader: 'x-api-key',
  needsAnthropicVersion: true,
};
const OPENAI_CFG: ProviderConfig = {
  provider: 'openai',
  apiKey: 'sk-test-openai',
  baseURL: 'https://api.openai.com/v1',
  modelName: 'gpt-4o-mini',
  authHeader: 'Authorization',
  needsAnthropicVersion: false,
};
const XAI_CFG: ProviderConfig = {
  provider: 'xai',
  apiKey: 'sk-test-xai',
  baseURL: 'https://api.x.ai/v1',
  modelName: 'grok-3',
  authHeader: 'Authorization',
  needsAnthropicVersion: false,
};
const MINIMAX_CFG: ProviderConfig = {
  provider: 'minimax',
  apiKey: 'sk-test-minimax',
  baseURL: 'https://api.minimax.io/v1',
  modelName: 'MiniMax-M3',
  authHeader: 'Authorization',
  needsAnthropicVersion: false,
};

/** Convenience: program the mocked chatWithConfig to return
 *  the given replies in order, one per call. Throws after the
 *  last reply so tests fail loudly if the chain is longer
 *  than expected. */
function programCalls(replies: Array<{ ok: true; text: string } | { ok: false; status?: number; message: string }>): void {
  let i = 0;
  mockChatWithConfig.mockImplementation(() => {
    const r = replies[i++];
    if (!r) throw new Error(`Mock exhausted: attempted call #${i}`);
    if (r.ok) return Promise.resolve(r.text);
    const err = new Error(r.message) as Error & { status?: number };
    if (typeof r.status === 'number') err.status = r.status;
    return Promise.reject(err);
  });
}

describe('runWithFallback', () => {
  beforeEach(() => {
    mockChatWithConfig.mockReset();
    // Reset env between tests so FALLBACK_PROVIDERS + provider
    // keys from one test don't leak into the next. (The
    // process-level env may have keys from the dev shell;
    // clear them so the chain resolution only sees what each
    // test explicitly sets.)
    delete process.env.FALLBACK_PROVIDERS;
    delete process.env.ENABLE_AI_FALLBACK;
    delete process.env.PIPELINE_PROVIDER_KEY_AUTO_ANSWER;
    for (const k of [
      'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY',
      'MINIMAX_API_KEY', 'GEMINI_API_KEY', 'CUSTOM_API_KEY',
    ]) {
      delete process.env[k];
    }
  });

  it('returns the primary reply when it succeeds (no fallback)', async () => {
    programCalls([{ ok: true, text: 'primary reply' }]);
    const r = await runWithFallback('auto_answer', [{ role: 'user', content: 'hi' }], {
      primaryOverride: ANTHROPIC_CFG,
    });
    expect(r.usedProvider).toBe('anthropic');
    expect(r.reply).toBe('primary reply');
    expect(r.attempts).toHaveLength(1);
    expect(r.attempts[0].ok).toBe(true);
    expect(mockChatWithConfig).toHaveBeenCalledTimes(1);
  });

  it('walks the fallback chain on 401 (key revoked)', async () => {
    // Configure the chain so openai is a candidate.
    process.env.OPENAI_API_KEY = 'sk-test';
    programCalls([
      { ok: false, status: 401, message: '401 unauthorized' },
      { ok: true, text: 'fallback reply' },
    ]);
    const r = await runWithFallback('auto_answer', [{ role: 'user', content: 'hi' }], {
      primaryOverride: ANTHROPIC_CFG,
    });
    expect(r.usedProvider).toBe(OPENAI_CFG.provider);
    expect(r.reply).toBe('fallback reply');
    expect(r.attempts).toHaveLength(2);
    expect(r.attempts[0].provider).toBe('anthropic');
    expect(r.attempts[0].ok).toBe(false);
    expect(r.attempts[1].provider).toBe('openai');
    expect(r.attempts[1].ok).toBe(true);
  });

  it('walks the chain on 429 (rate limited)', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    programCalls([
      { ok: false, status: 429, message: '429 too many requests' },
      { ok: true, text: 'recovered' },
    ]);
    const r = await runWithFallback('auto_answer', [{ role: 'user', content: 'hi' }], {
      primaryOverride: ANTHROPIC_CFG,
    });
    expect(r.usedProvider).toBe('openai');
    expect(r.reply).toBe('recovered');
  });

  it('walks the chain on 5xx (upstream error)', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    programCalls([
      { ok: false, status: 500, message: '500 internal' },
      { ok: true, text: '5xx recovered' },
    ]);
    const r = await runWithFallback('auto_answer', [{ role: 'user', content: 'hi' }], {
      primaryOverride: ANTHROPIC_CFG,
    });
    expect(r.usedProvider).toBe('openai');
    expect(r.reply).toBe('5xx recovered');
  });

  it('walks the chain on network errors (fetch failed)', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    programCalls([
      { ok: false, message: 'fetch failed' },
      { ok: true, text: 'network recovered' },
    ]);
    const r = await runWithFallback('auto_answer', [{ role: 'user', content: 'hi' }], {
      primaryOverride: ANTHROPIC_CFG,
    });
    expect(r.usedProvider).toBe('openai');
    expect(r.reply).toBe('network recovered');
  });

  it('throws immediately on 400 (non-retriable) — does not walk chain', async () => {
    programCalls([
      { ok: false, status: 400, message: '400 bad request: prompt too long' },
    ]);
    await expect(
      runWithFallback('auto_answer', [{ role: 'user', content: 'hi' }], {
        primaryOverride: ANTHROPIC_CFG,
      }),
    ).rejects.toThrow(/400 bad request/);
    // Only the primary was tried.
    expect(mockChatWithConfig).toHaveBeenCalledTimes(1);
  });

  it('throws the last error when the entire chain fails', async () => {
    // Set env keys for the full default chain so resolveFallbackChain
    // considers every provider configured.
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.XAI_API_KEY = 'sk-test';
    process.env.MINIMAX_API_KEY = 'sk-test';
    process.env.GEMINI_API_KEY = 'sk-test';
    programCalls([
      { ok: false, status: 401, message: 'anthropic 401' },
      { ok: false, status: 401, message: 'openai 401' },
      { ok: false, status: 401, message: 'xai 401' },
      { ok: false, status: 401, message: 'minimax 401' },
      { ok: false, status: 401, message: 'gemini 401' },
    ]);
    // The custom provider has no env key, so the chain will
    // skip it. The test's mock has only 5 calls programmed.
    await expect(
      runWithFallback('auto_answer', [{ role: 'user', content: 'hi' }], {
        primaryOverride: ANTHROPIC_CFG,
      }),
    ).rejects.toThrow(/gemini 401/);
    // The default chain is anthropic → openai → xai → minimax → gemini
    // → custom. With only the env keys set above, custom is skipped
    // (no CUSTOM_API_KEY). The other 5 are tried. 5 mock calls.
    expect(mockChatWithConfig).toHaveBeenCalledTimes(5);
  });

  it('respects ENABLE_AI_FALLBACK=false — no chain walk', async () => {
    process.env.ENABLE_AI_FALLBACK = 'false';
    programCalls([
      { ok: false, status: 429, message: 'rate limited' },
    ]);
    await expect(
      runWithFallback('auto_answer', [{ role: 'user', content: 'hi' }], {
        primaryOverride: ANTHROPIC_CFG,
      }),
    ).rejects.toThrow();
    // Only the primary — no fallback attempted.
    expect(mockChatWithConfig).toHaveBeenCalledTimes(1);
  });

  it('respects FALLBACK_PROVIDERS env — limited chain', async () => {
    // Only fall back to minimax, not to openai/xai/gemini. Need
    // MINIMAX_API_KEY for resolveFallbackChain to consider it
    // configured.
    process.env.FALLBACK_PROVIDERS = JSON.stringify(['minimax']);
    process.env.MINIMAX_API_KEY = 'sk-test';
    // Note: no OPENAI_API_KEY — openai should be filtered out even
    // if it were in the chain.
    programCalls([
      { ok: false, status: 500, message: '500' },
      { ok: true, text: 'minimax reply' },
    ]);
    const r = await runWithFallback('auto_answer', [{ role: 'user', content: 'hi' }], {
      primaryOverride: ANTHROPIC_CFG,
    });
    expect(r.usedProvider).toBe('minimax');
    expect(r.reply).toBe('minimax reply');
  });

  it('skips providers without a configured key (env or DB)', async () => {
    // No FALLBACK_PROVIDERS set, no env keys for the other
    // providers — chain resolves to just [primary].
    delete process.env.OPENAI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.CUSTOM_API_KEY;
    programCalls([{ ok: true, text: 'only primary' }]);
    const r = await runWithFallback('auto_answer', [{ role: 'user', content: 'hi' }], {
      primaryOverride: ANTHROPIC_CFG,
    });
    expect(r.usedProvider).toBe('anthropic');
    expect(r.attempts).toHaveLength(1);
  });
});

describe('DEFAULT_FALLBACK_CHAIN', () => {
  it('orders providers with anthropic first (highest quality) and custom last (proxy fallback)', () => {
    expect(DEFAULT_FALLBACK_CHAIN[0]).toBe('anthropic');
    expect(DEFAULT_FALLBACK_CHAIN).toContain('openai');
    expect(DEFAULT_FALLBACK_CHAIN).toContain('xai');
    expect(DEFAULT_FALLBACK_CHAIN).toContain('minimax');
    expect(DEFAULT_FALLBACK_CHAIN).toContain('gemini');
    expect(DEFAULT_FALLBACK_CHAIN[DEFAULT_FALLBACK_CHAIN.length - 1]).toBe('custom');
  });
});
