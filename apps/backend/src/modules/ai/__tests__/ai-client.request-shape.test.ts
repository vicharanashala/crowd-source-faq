/**
 * ai-client.request-shape.test — Regression guard for v1.80's
 * per-provider request-body shape fix.
 *
 * Each provider has a different canonical field name for the output
 * token cap (`max_tokens` vs `max_completion_tokens`), and Anthropic
 * takes the system prompt as a top-level `system` field instead of
 * a `role:'system'` message. These tests spy on `fetch` and assert
 * the body shape sent per provider, so a future refactor that
 * regresses the per-provider branching trips these tests loudly
 * instead of silently producing 4xx errors at runtime.
 *
 * Strategy: seed ONE AiConfig with all 6 providers configured and
 * `activeProvider` set via `setProviderOverride()` per test. The
 * unique partial index on (batchId, isActive:true) only allows one
 * active doc per (batchId); we use that single slot and just change
 * `activeProvider` per test.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo: MongoMemoryServer;
let fetchSpy: ReturnType<typeof vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>>;
let lastRequest: { url: string; init: RequestInit } | null = null;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  // The AiClient `chat()` short-circuits to a mock response when
  // process.env.NODE_ENV === 'test'. We need REAL fetch traffic
  // to assert against body shape, so force NODE_ENV to 'development'
  // here and restore in afterEach. Each test re-imports the module
  // (vi.resetModules) below so the env var is read at module-load
  // time, not at call time.
  process.env.NODE_ENV = 'development';
  // Wipe and recreate the AiConfig collection so each test starts
  // with a known baseline. The partial unique index on
  // (batchId, isActive:true) only permits one active doc per
  // (batchId) — so we always use the single `batchId: null` slot
  // and rewrite `activeProvider` per test.
  const db = mongoose.connection.db;
  if (db) await db.collection('yaksha_faq_ai_configs').deleteMany({});
  for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY', 'MINIMAX_API_KEY', 'GEMINI_API_KEY', 'CUSTOM_API_KEY']) {
    delete process.env[k];
  }
  // Spy on fetch — every chat() call goes through it. We don't
  // care about the response, only what the code tries to send.
  fetchSpy = vi.fn(async (_url: any, init?: RequestInit) => {
    lastRequest = { url: String(_url), init: init ?? {} };
    return new Response(
      JSON.stringify({
        id: 'fake',
        model: 'fake',
        choices: [{ message: { content: 'ok' }, index: 0, finish_reason: 'stop' }],
        usage: { total_tokens: 5, prompt_tokens: 3, completion_tokens: 2 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  // Replacing the global for this test only — `global.fetch` is
  // typed as `typeof fetch` in vitest's env so no `@ts-expect-error`
  // is needed.
  global.fetch = fetchSpy as unknown as typeof fetch;
  lastRequest = null;
});

afterEach(() => {
  vi.restoreAllMocks();
  // Reset NODE_ENV so other tests in the same file (if added later)
  // aren't accidentally affected.
  delete process.env.NODE_ENV;
});

/**
 * Drive the chat pipeline end-to-end with a known provider as the
 * active one. Returns the parsed body and URL the request was sent
 * with.
 *
 * The provider's API key + base URL come from env vars (one of each
 * per provider, mapped below). We use env vars instead of the DB
 * `providers` override so we get unambiguous URLs in the assertions.
 */
async function driveChat(provider: 'anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom', baseURL: string) {
  const { default: AiConfig } = await import('../ai-config.model.js');
  // The default create() in the model refuses to insert a second
  // active (batchId:null, isActive:true) doc because of the partial
  // unique index. Upsert-via-findOneAndUpdate sidesteps that.
  const config = await AiConfig.findOneAndUpdate(
    { batchId: null, isActive: true },
    {
      $set: {
        activeProvider: provider,
      },
      $setOnInsert: {
        batchId: null,
        isActive: true,
        features: {
          duplicateDetection:  { enabled: true, model: '', temperature: 0.3, maxTokens: 256 },
          knowledgeExtraction: { enabled: true, model: '', temperature: 0.3, maxTokens: 256 },
          searchSummarization: { enabled: true, model: '', temperature: 0.3, maxTokens: 256 },
          faqGeneration:       { enabled: true, model: '', temperature: 0.3, maxTokens: 256 },
        },
        embedding: { provider: 'local', model: 'fake', dimensions: 0, apiKeyCipher: '', baseURL: '' },
        usage: { totalRequests: 0, totalEstimatedCost: 0, lastResetAt: new Date() },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const envMap: Record<typeof provider, { key: string; url: string }> = {
    anthropic: { key: 'ANTHROPIC_API_KEY', url: 'ANTHROPIC_BASE_URL' },
    openai:    { key: 'OPENAI_API_KEY',    url: 'OPENAI_BASE_URL' },
    xai:       { key: 'XAI_API_KEY',       url: 'XAI_BASE_URL' },
    minimax:   { key: 'MINIMAX_API_KEY',   url: 'MINIMAX_BASE_URL' },
    gemini:    { key: 'GEMINI_API_KEY',    url: 'GEMINI_BASE_URL' },
    custom:    { key: 'CUSTOM_API_KEY',    url: 'CUSTOM_BASE_URL' },
  };
  process.env[envMap[provider].key] = 'sk-test';
  process.env[envMap[provider].url] = baseURL;

  // vi.resetModules() clears the 5s DbOverrides cache AND forces
  // a fresh import of everything — but Mongoose refuses to
  // overwrite an already-registered model name. The ai-client
  // module transitively imports both `AiConfig` (from
  // modules/ai/ai-config.model.ts) and `AiApiCall` (from
  // utils/ai/apiUsageLog.ts → modules/ai/ai-api-call.model.ts),
  // and only deletes its own one. To get a clean re-import, walk
  // all known model names and delete each. We use a allowlist
  // rather than `mongoose.modelNames()` because some tests in
  // other files also register models on the same Mongoose
  // connection and we don't want to yank theirs.
  for (const name of ['AiConfig', 'AiApiCall']) {
    try { mongoose.deleteModel(name); } catch { /* not registered yet */ }
  }
  vi.resetModules();

  const { AiClient } = await import('../ai-client.service.js');
  const client = new AiClient();
  try {
    await client.chat(
      [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'ping' },
      ],
      'duplicateDetection',
      { temperature: 0.2, maxTokens: 64 },
    );
  } catch (err) {
    throw new Error(`chat() threw before fetch: ${(err as Error).message}`);
  }

  // Silence the "unused variable" lint — keep a handle on the
  // returned doc for debug clarity, even though we don't use it.
  void config;

  if (!lastRequest) throw new Error('fetch was not called');
  return {
    url: lastRequest.url,
    body: JSON.parse(String(lastRequest.init.body)),
    headers: lastRequest.init.headers as Record<string, string>,
  };
}

describe('ai-client request body shape (v1.80)', () => {
  it('Anthropic: extracts system prompt to top-level `system` field', async () => {
    const { url, body, headers } = await driveChat('anthropic', 'https://api.anthropic.com/v1');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    // The system message should NOT appear in the messages array.
    expect(body.messages).toEqual([{ role: 'user', content: 'ping' }]);
    // It should appear at the top level.
    expect(body.system).toBe('You are a helpful assistant.');
    // Anthropic uses `max_tokens`, not `max_completion_tokens`.
    expect(body).toHaveProperty('max_tokens', 64);
    expect(body).not.toHaveProperty('max_completion_tokens');
    // Header check — x-api-key, not Bearer.
    expect(headers['x-api-key']).toBe('sk-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['Authorization']).toBeUndefined();
  });

  it('OpenAI: sends BOTH max_tokens and max_completion_tokens for forward-compat', async () => {
    const { url, body, headers } = await driveChat('openai', 'https://api.openai.com/v1');
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'ping' },
    ]);
    // Both fields, both set to the same cap.
    expect(body).toHaveProperty('max_tokens', 64);
    expect(body).toHaveProperty('max_completion_tokens', 64);
    expect(headers['Authorization']).toBe('Bearer sk-test');
  });

  it('MiniMax: sends max_completion_tokens only (canonical), not deprecated max_tokens', async () => {
    // minimax exposes the standard OpenAI-compatible /chat/completions
    // path on api.minimax.io/v1 (the legacy text/chatcompletion_v2
    // is deprecated per minimax's own docs).
    const { url, body } = await driveChat('minimax', 'https://api.minimax.io/v1');
    expect(url).toBe('https://api.minimax.io/v1/chat/completions');
    expect(body).toHaveProperty('max_completion_tokens', 64);
    expect(body).not.toHaveProperty('max_tokens');
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'ping' },
    ]);
  });

  it('Gemini: sends max_completion_tokens (max_tokens is silently dropped on the OpenAI-compat shim)', async () => {
    const { url, body } = await driveChat('gemini', 'https://generativelanguage.googleapis.com/v1beta/openai');
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(body).toHaveProperty('max_completion_tokens', 64);
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('xAI: classic OpenAI shape with max_tokens', async () => {
    const { url, body } = await driveChat('xai', 'https://api.x.ai/v1');
    expect(url).toBe('https://api.x.ai/v1/chat/completions');
    expect(body).toHaveProperty('max_tokens', 64);
    // xAI doesn't document `max_completion_tokens` — we should
    // NOT send it for them.
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it('Custom: classic OpenAI shape, and baseURL gets /v1 auto-appended if missing', async () => {
    process.env.CUSTOM_MODEL = 'llama3'; // custom default is ''
    // No /v1 — should be auto-inserted.
    const { url, body } = await driveChat('custom', 'http://localhost:11434');
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(body).toHaveProperty('max_tokens', 64);
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it('Custom: existing /v1 in baseURL is preserved (no double-append)', async () => {
    process.env.CUSTOM_MODEL = 'llama3';
    const { url } = await driveChat('custom', 'http://localhost:11434/v1');
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
  });

  // v1.81 — third-party-proxy compatibility for the `custom`
  // provider. Some admins route through an in-house proxy that
  // expects OpenAI's snake_case `model` field to be presented as
  // camelCase `modelName`. Setting CUSTOM_MODEL_FIELD=modelName
  // flips the field name on the wire so the proxy's downstream
  // Groq-style caller stops rejecting the body with `property
  // 'modelName' is unsupported`. Default (env unset) keeps `model`.
  it('Custom: CUSTOM_MODEL_FIELD=modelName swaps model → modelName on the wire', async () => {
    process.env.CUSTOM_MODEL = 'llama3';
    process.env.CUSTOM_MODEL_FIELD = 'modelName';
    try {
      const { body } = await driveChat('custom', 'http://localhost:11434/v1');
      expect(body).toHaveProperty('modelName', 'llama3');
      expect(body).not.toHaveProperty('model');
    } finally {
      delete process.env.CUSTOM_MODEL_FIELD;
    }
  });

  it('Custom: default field is `model` when CUSTOM_MODEL_FIELD is unset', async () => {
    process.env.CUSTOM_MODEL = 'llama3';
    delete process.env.CUSTOM_MODEL_FIELD;
    const { body } = await driveChat('custom', 'http://localhost:11434/v1');
    expect(body).toHaveProperty('model', 'llama3');
    expect(body).not.toHaveProperty('modelName');
  });
});
