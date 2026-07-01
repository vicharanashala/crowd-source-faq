// ── FAQ API Contracts ─────────────────────────────────────────────

export interface FAQSearchResult {
  _id: string;
  question: string;
  answer: string;
  category: string;
  score: number;
  source: 'vector' | 'keyword' | 'hybrid';
}

export interface FAQCreateRequest {
  question: string;
  answer: string;
  category: string;
  batchId?: string;
  freshnessTier?: string;
}
