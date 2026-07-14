import { getPipelineProviderConfig, chatWithConfig } from './aiProvider.js';
import { logger } from '../http/logger.js';

export interface RerankCandidate {
  id: string;
  title: string;
  body: string;
  source: string;
  originalScore?: number;
  doc: any;
}

export interface RerankResult {
  id: string;
  score: number;
  candidate: RerankCandidate;
}

/**
 * Reranks search candidates using a Cross-Encoder prompt over the active LLM provider.
 */
export async function rerankCandidates(
  query: string,
  candidates: RerankCandidate[],
  batchId: string | null = null
): Promise<RerankResult[]> {
  if (!candidates || candidates.length === 0) return [];

  try {
    const config = await getPipelineProviderConfig('search_rerank', batchId);
    
    // Build a serialized candidate list for the prompt
    const docList = candidates.map((c, i) => {
      return `[Candidate ID: ${c.id}]
Title: ${c.title}
Content: ${c.body.slice(0, 800)}
---`;
    }).join('\n');

    const systemPrompt = `You are an AI-powered search reranking assistant.
Given a user query and a numbered list of candidate documents, evaluate the semantic relevance of each document to the query.
Assign a relevance score from 0.0 to 1.0 (where 1.0 means the document directly and completely answers the query, and 0.0 means completely irrelevant).

Your output MUST be a valid JSON array of objects with the exact keys "id" (string) and "score" (number).
Example output:
[
  { "id": "doc_id_1", "score": 0.95 },
  { "id": "doc_id_2", "score": 0.23 }
]

Do not return any extra explanation, markdown code blocks, or conversational text. Output only the raw JSON.`;

    const userPrompt = `Query: "${query}"

Candidates:
${docList}`;

    const rawResponse = await chatWithConfig(config, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    // Clean JSON block formatting if the model returned backticks
    let cleaned = rawResponse.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    }

    const scoresList = JSON.parse(cleaned) as { id: string; score: number }[];
    const scoreMap = new Map<string, number>();
    for (const item of scoresList) {
      scoreMap.set(String(item.id), Number(item.score));
    }

    const results: RerankResult[] = candidates.map(c => {
      const score = scoreMap.has(c.id) ? (scoreMap.get(c.id) ?? 0) : 0;
      return {
        id: c.id,
        score,
        candidate: c
      };
    });

    // Sort descending by Cross-Encoder score
    return results.sort((a, b) => b.score - a.score);
  } catch (err) {
    logger.warn(`[reranker] Reranking failed, falling back to original rank: ${(err as Error).message}`);
    // Fallback to original order
    return candidates.map((c, i) => ({
      id: c.id,
      score: c.originalScore ?? (1.0 - i * 0.05),
      candidate: c
    }));
  }
}
