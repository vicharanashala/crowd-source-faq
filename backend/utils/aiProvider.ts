/**
 * Shared AI provider resolution.
 *
 * Used by any module that makes direct AI API calls (duplicateDetector,
 * knowledgeBase, etc.) BEFORE AiClient is available or when you just need
 * the provider config without instantiating a full client.
 *
 * Provider priority: Anthropic > OpenAI > xAI > MiniMax
 * Reads API keys from env vars — keys are never stored in the database.
 */

export type AIProvider = 'anthropic' | 'openai' | 'xai' | 'minimax';

export interface ProviderConfig {
  provider: AIProvider;
  apiKey: string;
  baseURL: string;
  model: string;
  authHeader: 'x-api-key' | 'Authorization';
  needsAnthropicVersion: boolean;
}

const PROVIDER_DEFS: Record<AIProvider, Omit<ProviderConfig, 'apiKey'>> = {
  anthropic: {
    provider: 'anthropic',
    baseURL: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-20250514',
    authHeader: 'x-api-key',
    needsAnthropicVersion: true,
  },
  openai: {
    provider: 'openai',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    authHeader: 'Authorization',
    needsAnthropicVersion: false,
  },
  xai: {
    provider: 'xai',
    baseURL: 'https://api.x.ai/v1',
    model: 'grok-3',
    authHeader: 'Authorization',
    needsAnthropicVersion: false,
  },
  minimax: {
    provider: 'minimax',
    baseURL: (process.env.MINIMAX_BASE_URL ?? 'https://api.minimax.io/v1').replace(/\/$/, ''),
    model: process.env.MINIMAX_MODEL ?? 'MiniMax-Text-01',
    authHeader: 'Authorization',
    needsAnthropicVersion: false,
  },
};

let _resolved: ProviderConfig | null = null;

/**
 * Resolve and cache the active AI provider from env vars.
 * Lazy — should only be called after dotenv has loaded.
 */
export function resolveProvider(): ProviderConfig {
  if (_resolved) return _resolved;

  if (process.env.ANTHROPIC_API_KEY) {
    _resolved = { ...PROVIDER_DEFS.anthropic, apiKey: process.env.ANTHROPIC_API_KEY };
    return _resolved;
  }
  if (process.env.OPENAI_API_KEY) {
    _resolved = { ...PROVIDER_DEFS.openai, apiKey: process.env.OPENAI_API_KEY };
    return _resolved;
  }
  if (process.env.XAI_API_KEY) {
    _resolved = { ...PROVIDER_DEFS.xai, apiKey: process.env.XAI_API_KEY };
    return _resolved;
  }
  if (process.env.MINIMAX_API_KEY || process.env.MINIMAX_BASE_URL) {
    _resolved = { ...PROVIDER_DEFS.minimax, apiKey: process.env.MINIMAX_API_KEY ?? '' };
    return _resolved;
  }

  throw new Error(
    'No AI API key configured. Set one of:\n' +
    '  ANTHROPIC_API_KEY  — https://console.anthropic.com/settings/keys\n' +
    '  OPENAI_API_KEY     — https://platform.openai.com/api-keys\n' +
    '  XAI_API_KEY        — https://console.x.ai/\n' +
    '  MINIMAX_API_KEY    — https://platform.minimax.io'
  );
}

/** Returns true if at least one AI API key is configured. */
export function hasAIKey(): boolean {
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.XAI_API_KEY ||
    process.env.MINIMAX_API_KEY
  );
}

/** Resolve config for a specific provider (does not cache — always fresh). */
export function getProvider(provider: AIProvider): ProviderConfig {
  const def = PROVIDER_DEFS[provider];
  const keyMap: Record<AIProvider, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    xai: 'XAI_API_KEY',
    minimax: 'MINIMAX_API_KEY',
  };
  const apiKey = process.env[keyMap[provider]] ?? '';
  return { ...def, apiKey };
}

/** Low-level chat() for a specific provider (bypasses active selection). Used for test connections. */
export async function chat(provider: AIProvider, messages: { role: string; content: string }[], model?: string): Promise<string> {
  const config = getProvider(provider);
  const modelName = model || config.model;

  if (provider === 'anthropic') {
    const res = await fetch(`${config.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: modelName, messages, max_tokens: 4 }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic error: ${err}`);
    }
    const data = await res.json() as { content?: { text?: string }[] };
    return data.content?.[0]?.text ?? '';
  }

  // OpenAI / xAI / MiniMax all use chat completions
  const body: Record<string, unknown> = { model: modelName, messages };
  const res = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      [config.authHeader]: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${provider} error: ${err}`);
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}