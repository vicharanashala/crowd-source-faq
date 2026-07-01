// ── Search API Contracts ─────────────────────────────────────────

export interface SearchRequest {
  query: string;
  batchId?: string;
  category?: string;
  limit?: number;
}

export interface SearchResponse {
  results: Array<{
    _id: string;
    question: string;
    answer: string;
    category: string;
    score: number;
    source: string;
  }>;
  total: number;
  query: string;
}

export interface TrendingQuery {
  query: string;
  count: number;
}

export interface SearchSuggestion {
  _id: string;
  question: string;
  category: string;
  score: number;
}
