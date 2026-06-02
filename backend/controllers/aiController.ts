/**
 * aiController.ts
 *
 * Backend controller for AI configuration management.
 *
 * Routes:
 *   GET    /api/admin/ai/config          → get current config
 *   PATCH  /api/admin/ai/config          → update features / provider
 *   POST   /api/admin/ai/config/reset-usage → reset usage stats
 *   GET    /api/admin/ai/providers       → list available providers + health
 *
 * Only admin/ai_moderator roles can access these endpoints.
 */

import { Request, Response } from 'express';
import AiConfig, { type IAiConfig } from '../models/AiConfig.js';
import { logAction } from './adminController.js';

// ─── GET /api/admin/ai/config ───────────────────────────────────────────────

export const getAiConfig = async (_req: Request, res: Response): Promise<void> => {
  try {
    let config = await AiConfig.findOne({ isActive: true }).lean();

    // Bootstrap default config if none exists
    if (!config) {
      config = await AiConfig.create({
        activeProvider: 'anthropic',
        features: {
          duplicateDetection: { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.1, maxTokens: 1024 },
          knowledgeExtraction: { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.2, maxTokens: 2048 },
          searchSummarization: { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.3, maxTokens: 512 },
          faqGeneration: { enabled: true, model: 'claude-sonnet-4-20250514', temperature: 0.4, maxTokens: 1024 },
        },
        usage: { totalRequests: 0, totalEstimatedCost: 0, lastResetAt: new Date() },
        isActive: true,
      }) as any;
    }

    // Determine which provider is actually available (has API key)
    const activeProvider = detectActiveProvider();

    res.json({ ...config, activeProvider });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── PATCH /api/admin/ai/config ─────────────────────────────────────────────

export const updateAiConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { activeProvider, features } = req.body as {
      activeProvider?: 'anthropic' | 'openai' | 'xai' | 'minimax';
      features?: IAiConfig['features'];
    };

    const config = await AiConfig.findOne({ isActive: true });

    if (!config) {
      res.status(404).json({ message: 'AI config not found.' });
      return;
    }

    if (activeProvider !== undefined) {
      config.activeProvider = activeProvider;
    }

    if (features !== undefined) {
      config.features = { ...config.features, ...features };
    }

    await config.save();
    await logAction((req as any).user?.id ?? 'system', 'update_ai_config', config._id.toString(), 'ai_config', JSON.stringify({ activeProvider, features }));

    res.json({ message: 'AI config updated.', config });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── POST /api/admin/ai/config/reset-usage ───────────────────────────────────

export const resetAiUsage = async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await AiConfig.findOne({ isActive: true });
    if (config) {
      config.usage = { totalRequests: 0, totalEstimatedCost: 0, lastResetAt: new Date() };
      await config.save();
    }

    await logAction((req as any).user?.id ?? 'system', 'reset_ai_usage', 'ai_config', 'ai_config', 'Usage statistics reset');

    res.json({ message: 'Usage statistics reset.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── GET /api/admin/ai/providers ─────────────────────────────────────────────

export const getAiProviders = async (_req: Request, res: Response): Promise<void> => {
  type ProviderKey = 'anthropic' | 'openai' | 'xai' | 'minimax';

  const providerMeta: Record<ProviderKey, {
    label: string;
    defaultModel: string;
    hasKey: boolean;
    configuredModel: string;
  }> = {
    anthropic: {
      label: 'Anthropic Claude',
      defaultModel: 'claude-sonnet-4-20250514',
      hasKey: !!process.env.ANTHROPIC_API_KEY,
      configuredModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
    },
    openai: {
      label: 'OpenAI GPT',
      defaultModel: 'gpt-4o-mini',
      hasKey: !!process.env.OPENAI_API_KEY,
      configuredModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    },
    xai: {
      label: 'xAI Grok',
      defaultModel: 'grok-3',
      hasKey: !!process.env.XAI_API_KEY,
      configuredModel: process.env.XAI_MODEL ?? 'grok-3',
    },
    minimax: {
      label: 'MiniMax',
      defaultModel: 'MiniMax-Text-01',
      hasKey: !!process.env.MINIMAX_API_KEY,
      configuredModel: process.env.MINIMAX_MODEL ?? 'MiniMax-Text-01',
    },
  };

  const activeProvider = detectActiveProvider();

  const providers = (Object.keys(providerMeta) as ProviderKey[]).map((key) => ({
    id: key,
    ...providerMeta[key],
    isActive: key === activeProvider,
  }));

  res.json({ providers, activeProvider });
};

// ─── GET /api/admin/ai/providers/test ────────────────────────────────────────

export const testProvider = async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.query as { provider?: string };
  const validProviders = ['anthropic', 'openai', 'xai', 'minimax'];

  if (!provider || !validProviders.includes(provider)) {
    res.status(400).json({ ok: false, message: 'Invalid provider' });
    return;
  }

  try {
    const { chat } = await import('../utils/aiProvider.js');
    await chat(provider as 'anthropic' | 'openai' | 'xai' | 'minimax', [{ role: 'user', content: 'ping' }]);
    res.json({ ok: true, message: 'Connection successful' });
  } catch (err: any) {
    res.json({ ok: false, message: err.message || 'Connection failed' });
  }
};

// ─── Helper ─────────────────────────────────────────────────────────────────

function detectActiveProvider(): 'anthropic' | 'openai' | 'xai' | 'minimax' {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.XAI_API_KEY) return 'xai';
  return 'minimax';
}