/**
 * aiController.ts — re-export shim
 *
 * All AI config functions moved to aiConfigController.ts.
 * All AI promotion functions moved to aiPromotionController.ts.
 *
 * Routes should import directly from the new files.
 * This file exists only for backward compatibility.
 */
export {
  getAiConfig,
  updateAiConfig,
  resetAiUsage,
  getAiProviders,
  testProvider,
  revealApiKey,
  detectActiveProvider,
} from './ai-config.controller.js';

export {
  runCommunityPromotionReview,
  triggerAIReview,
  triggerAIReviewBatch,
  type AIReviewResult,
} from './ai-promotion.controller.js';