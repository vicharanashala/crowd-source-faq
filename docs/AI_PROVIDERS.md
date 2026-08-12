# aiProvider.ts — Bug Fix Documentation

**File:** `apps/backend/src/utils/ai/aiProvider.ts`
**Function affected:** `chatWithConfig()`
**Bug:** No timeout on AI provider `fetch()` calls → a hung provider could
block requests forever and prevent the fallback chain from failing over.

---

## What I changed — 3 parts

### Part 1 — Added a timeout-enforcing fetch wrapper (new code, top of file, after the imports)

```ts
// ─── Per-request timeout ────────────────────────────────────────────────────
// Bug: chatWithConfig's fetch() calls had no timeout. A provider that
// hangs (accepts the connection, never sends a response) instead of
// erroring would leave the request pending indefinitely — not just for
// this attempt, but for the whole runWithFallback() chain in
// fallbackChain.ts, since that chain only advances to the next provider
// when the current attempt *throws*. A stuck fetch never throws, so a
// single unresponsive provider could stall a cron pipeline (autoAnswer,
// faqAudit) or a user-facing /ask-ai request forever.
//
// AI_PROVIDER_TIMEOUT_MS (env, ms) overrides the default; falls back to
// 30s, which is generous for a single chat completion but still bounded.
// On timeout we abort the fetch via AbortController, which rejects with
// an AbortError whose message contains "aborted" — isRetriableError()
// in fallbackChain.ts already matches on that substring, so a timeout
// on the primary provider correctly triggers failover to the next one
// with no changes needed there.
const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;

function getProviderTimeoutMs(): number {
  const raw = Number(process.env.AI_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_PROVIDER_TIMEOUT_MS;
}

/** fetch() with an enforced wall-clock timeout. Aborts and rejects with
 *  an Error whose message includes "timeout" if the provider hasn't
 *  responded within `timeoutMs`. Always clears the timer so the abort
 *  handle doesn't leak past a normal (fast) response. */
async function fetchWithTimeout(
  url: string,
  init: Parameters<typeof fetch>[1],
  timeoutMs: number = getProviderTimeoutMs(),
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      // NOTE: keep the literal substring "timeout" in this message —
      // isRetriableError() in services/ai/fallbackChain.ts matches on
      // it (msg.includes('timeout')) to decide whether to advance the
      // fallback chain to the next provider. Don't reword this without
      // updating that check too.
      throw new Error(`provider request timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
```

### Part 2 — Anthropic branch inside `chatWithConfig()` (~line 871)

Only the function name on the call changed. Nothing else in the block.

```diff
- res = await fetch(`${baseURL}/messages`, {
+ res = await fetchWithTimeout(`${baseURL}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...(needsAnthropicVersion ? { 'anthropic-version': '2023-06-01' } : {}),
    },
    body: JSON.stringify({ model: modelName, messages, max_tokens: 512 }),
  });
```

### Part 3 — OpenAI-compatible branch inside `chatWithConfig()` (~line 924)

Same, single-line swap — this branch handles OpenAI, xAI, MiniMax, Gemini,
and custom providers.

```diff
- res = await fetch(`${baseURL}/chat/completions`, {
+ res = await fetchWithTimeout(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      [authHeader]: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(customBody),
  });
```

---

## Why each part exists

| Change | Why |
|---|---|
| `AbortController` + `setTimeout(..., timeoutMs)` | Only way to cancel a native `fetch()` mid-flight — there's no built-in timeout option. |
| `getProviderTimeoutMs()` reading `AI_PROVIDER_TIMEOUT_MS` | Lets the timeout be tuned per deployment/environment without touching code. |
| `clearTimeout(timer)` in `finally` | Prevents the abort timer from firing after a normal, fast response has already resolved. |
| Error message keeps the word `"timeout"` | `fallbackChain.ts`'s `isRetriableError()` does a plain substring check (`msg.includes('timeout')`) to decide whether to fail over to the next provider. If the wording didn't match, a timeout would incorrectly abort the whole chain instead of trying the next provider. |
| Two call sites swapped, not one | `chatWithConfig` has two branches — Anthropic's native API shape and an OpenAI-compatible shape used by every other provider. Both needed the same fix. |

---

## README.md — what changed there

Two edits to the repo's root `README.md`:

1. **"Environment Variables" section** — added the new env var to the
   optional list:
   ```diff
   - Optional: at least one AI provider key (...), Zoom OAuth credentials, `CLOUDINARY_*`, `SENTRY_DSN`, ...
   + Optional: at least one AI provider key (...), `AI_PROVIDER_TIMEOUT_MS` (per-request timeout for AI provider calls, in ms; default `30000`), Zoom OAuth credentials, `CLOUDINARY_*`, `SENTRY_DSN`, ...
   ```

2. **New "Recent Fixes" section**, added just above the "License" section
   at the bottom of the file:
   ```md
   ## Recent Fixes

   **AI provider request timeout** — `chatWithConfig()` (used by every AI
   pipeline: auto-answer, FAQ audit, `/ask-ai`) previously made `fetch()`
   calls to AI providers with no timeout, so a provider that hung instead
   of erroring could block a request indefinitely and stall the whole
   provider-fallback chain. Fixed by wrapping provider calls in a
   timeout-enforcing `fetchWithTimeout()` (configurable via
   `AI_PROVIDER_TIMEOUT_MS`, default 30s); a timeout now correctly triggers
   automatic failover to the next configured provider. See
   [`apps/backend/src/utils/ai/aiProvider.ts`](apps/backend/src/utils/ai/aiProvider.ts).
   ```

---

## Verification performed

- `tsc --noEmit` on the backend — no new type errors.
- Existing `fallbackChain.test.ts` (11 tests) — all pass unmodified.
- Manual repro: local server that never responds, hit with a 500ms
  timeout — request correctly aborted at ~505ms with a retriable error
  message.