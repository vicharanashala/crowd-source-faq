/**
 * provider-resolver.test — Phase 1 R5: unit tests for the AI
 * provider resolver. Covers the resolution chain (DB → env → default)
 * and feature config layering. Uses mongodb-memory-server.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('no db');
  await db.collection('yaksha_faq_ai_configs').deleteMany({});
  for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY', 'MINIMAX_API_KEY']) {
    delete process.env[k];
  }
});

const { aiProviderResolver } = await import(
  '../../ai/provider-resolver.service.js'
);
const { default: AiConfig } = await import(
  '../../../modules/ai/ai-config.model.js'
);

async function seedConfig(opts: {
  batchId?: Types.ObjectId | null;
  activeProvider?: string;
  features?: Record<string, { enabled?: boolean; model?: string; temperature?: number; maxTokens?: number }>;
} = {}): Promise<void> {
  // Wipe then insert — simpler than upsert given the partial unique
  // index on (batchId) where isActive: true.
  await AiConfig.deleteMany({
    batchId: opts.batchId ?? null,
    isActive: true,
  });
  await AiConfig.create({
    batchId: opts.batchId ?? null,
    isActive: true,
    activeProvider: opts.activeProvider ?? 'anthropic',
    features: opts.features ?? {},
  });
}

describe('aiProviderResolver.resolve — DB config', () => {
  it('reads the global default with no batchId', async () => {
    await seedConfig({ activeProvider: 'openai' });
    const result = await aiProviderResolver.resolve({
      feature: 'duplicateDetection',
    });
    expect(result.source).toBe('db:global');
    expect(result.provider).toBe('openai');
  });

  it('reads per-program config when batchId is specified', async () => {
    const batchId = new Types.ObjectId();
    await seedConfig({ batchId, activeProvider: 'xai' });
    const result = await aiProviderResolver.resolve({
      feature: 'duplicateDetection',
      batchId,
    });
    expect(result.source).toBe('db:program');
    expect(result.provider).toBe('xai');
  });

  it('layers per-feature enabled override', async () => {
    await seedConfig({
      features: { duplicateDetection: { enabled: false } },
    });
    const result = await aiProviderResolver.resolve({
      feature: 'duplicateDetection',
    });
    expect(result.enabled).toBe(false);
  });

  it('layers per-feature model + temperature + maxTokens', async () => {
    await seedConfig({
      features: {
        duplicateDetection: { model: 'custom-model', temperature: 0.5, maxTokens: 256 },
      },
    });
    const result = await aiProviderResolver.resolve({
      feature: 'duplicateDetection',
    });
    expect(result.model).toBe('custom-model');
    expect(result.temperature).toBe(0.5);
    expect(result.maxTokens).toBe(256);
  });

  it('falls back to global when no per-program config exists for the batchId', async () => {
    const batchId = new Types.ObjectId();
    await seedConfig({ activeProvider: 'minimax' });
    const result = await aiProviderResolver.resolve({
      feature: 'duplicateDetection',
      batchId,
    });
    expect(result.source).toBe('db:global');
    expect(result.provider).toBe('minimax');
  });
});
