/**
 * AiConfig Model
 *
 * Stores the AI configuration for the application.
 * Only ONE active config document should exist at any time.
 * Admin-only access via the AI Settings page.
 *
 * This replaces the ad-hoc provider detection in duplicateDetector.ts
 * and knowledgeBase.ts with a unified, admin-configurable AI layer.
 */

import mongoose, { Schema } from 'mongoose';

export type AIProviderType = 'anthropic' | 'openai' | 'xai' | 'minimax';

export interface IAiConfig extends mongoose.Document {
  // Which provider is currently active
  activeProvider: AIProviderType;

  // Per-feature configuration
  features: {
    // Duplicate question detection (community post creation)
    duplicateDetection: {
      enabled: boolean;
      model: string;            // e.g. 'claude-sonnet-4-20250514' or 'gpt-4o-mini'
      temperature: number;
      maxTokens: number;
    };
    // Knowledge base extraction from Zoom/community
    knowledgeExtraction: {
      enabled: boolean;
      model: string;
      temperature: number;
      maxTokens: number;
    };
    // Search result summarization
    searchSummarization: {
      enabled: boolean;
      model: string;
      temperature: number;
      maxTokens: number;
    };
    // FAQ generation / auto-answer
    faqGeneration: {
      enabled: boolean;
      model: string;
      temperature: number;
      maxTokens: number;
    };
  };

  // Cost tracking
  usage: {
    totalRequests: number;
    totalEstimatedCost: number; // USD
    lastResetAt: Date;
  };

  // Only one config should be active at a time
  isActive: boolean;
  updatedAt: Date;
}

const aiConfigSchema = new Schema<IAiConfig>(
  {
    activeProvider: {
      type: String,
      enum: ['anthropic', 'openai', 'xai', 'minimax'] as AIProviderType[],
      required: true,
      default: 'anthropic',
    },

    features: {
      type: Object,
      required: true,
      default: () => ({
        duplicateDetection: {
          enabled: true,
          model: 'claude-sonnet-4-20250514',
          temperature: 0.1,
          maxTokens: 1024,
        },
        knowledgeExtraction: {
          enabled: true,
          model: 'claude-sonnet-4-20250514',
          temperature: 0.2,
          maxTokens: 2048,
        },
        searchSummarization: {
          enabled: true,
          model: 'claude-sonnet-4-20250514',
          temperature: 0.3,
          maxTokens: 512,
        },
        faqGeneration: {
          enabled: true,
          model: 'claude-sonnet-4-20250514',
          temperature: 0.4,
          maxTokens: 1024,
        },
      }),
    },

    usage: {
      totalRequests: { type: Number, default: 0 },
      totalEstimatedCost: { type: Number, default: 0 },
      lastResetAt: { type: Date, default: Date.now },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: { updatedAt: true } }
);

// Only one active config at a time
aiConfigSchema.pre('save', function (next) {
  if (this.isActive) {
    AiConfig.updateMany({ _id: { $ne: this._id } }, { isActive: false }).catch(() => {});
  }
  next();
});

const AiConfig = mongoose.model<IAiConfig>('AiConfig', aiConfigSchema, 'yaksha_faq_ai_config');

export default AiConfig;