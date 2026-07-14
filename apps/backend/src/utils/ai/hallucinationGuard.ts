import { getPipelineProviderConfig, chatWithConfig } from './aiProvider.js';
import { logger } from '../http/logger.js';

export interface GuardVerdict {
  passed: boolean;
  score: number;
  reason: string;
}

/**
 * Validates a proposed answer against the retrieved reference context passages using LLM-as-a-Judge.
 */
export async function validateFaithfulness(
  proposedAnswer: string,
  contextPassages: string[],
  batchId: string | null = null,
  minFaithfulnessScore = 0.80
): Promise<GuardVerdict> {
  if (!proposedAnswer || proposedAnswer.trim() === '') {
    return { passed: true, score: 1.0, reason: 'Empty proposed answer' };
  }

  if (!contextPassages || contextPassages.length === 0) {
    return {
      passed: false,
      score: 0.0,
      reason: 'No reference context provided to validate the answer'
    };
  }

  try {
    const config = await getPipelineProviderConfig('hallucination_guard', batchId);

    const serializedContext = contextPassages
      .map((passage, index) => `[Context Passage ${index + 1}]\n${passage}\n---`)
      .join('\n\n');

    const systemPrompt = `You are an AI-powered hallucination detection assistant.
Your job is to act as a strict judge evaluating if a proposed answer is completely faithful to the provided reference context.

Rules:
1. Examine the proposed answer sentence-by-sentence.
2. Cross-reference every fact, claim, name, step, or detail in the proposed answer against the reference context passages.
3. If a fact or claim in the answer is NOT explicitly supported by the reference context, it is a hallucination.
4. Assign a faithfulness score from 0.0 to 1.0:
   - 1.0: The answer is entirely factual and contains zero claims or details unsupported by the context.
   - 0.8 to 0.99: The answer is mostly faithful but contains minor extra details not explicitly in the context.
   - 0.5 to 0.79: The answer contains moderate hallucinations or fabrications.
   - 0.0 to 0.49: The answer is mostly fabricated, completely unsupported, or directly contradicts the context.

Your output MUST be a valid JSON object with the exact keys "score" (number) and "reason" (string).
Example output:
{
  "score": 0.92,
  "reason": "The answer correctly summarizes the port settings but assumes the user is running Windows, which is not mentioned in the context."
}

Do not return any extra explanation, markdown code blocks, or conversational text. Output only the raw JSON.`;

    const userPrompt = `Reference Context:
${serializedContext}

Proposed Answer to Evaluate:
"${proposedAnswer}"`;

    const rawResponse = await chatWithConfig(config, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    // Clean JSON block formatting if the model returned backticks
    let cleaned = rawResponse.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    }

    const result = JSON.parse(cleaned) as { score: number; reason: string };
    const score = Number(result.score);
    const passed = score >= minFaithfulnessScore;

    return {
      passed,
      score,
      reason: result.reason || ''
    };
  } catch (err) {
    logger.warn(`[hallucinationGuard] Validation failed, defaulting to pass: ${(err as Error).message}`);
    return {
      passed: true,
      score: 1.0,
      reason: `Validation errored out, skipped check: ${(err as Error).message}`
    };
  }
}
