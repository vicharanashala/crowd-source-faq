// Shared types for the public FAQ page.
// Kept in a leaf file so server-side response shapes can evolve
// independently from the rest of the frontend types tree.

export interface PublicFaq {
  _id: string;
  question: string;
  answer: string;
  category: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  trustLevel?: 'expert' | 'high' | 'medium' | 'low';
  sourceType?: 'manual' | 'community_promotion' | 'expert_verified' | 'zoom_transcript';
  popularityScore: number;
  guestViewCount: number;
  avgReadCompletion: number;
  avgTimeSpentRatio: number;
  wordCount: number;
  expectedReadMs: number;
}

export interface PublicCategory {
  name: string;
  count: number;
  topFaqs?: PublicFaq[];
}

export interface PopularResponse {
  faqs: PublicFaq[];
  generatedAt: string;
}

export interface RecentResponse {
  faqs: PublicFaq[];
  generatedAt: string;
}

export interface CategoriesResponse {
  categories: PublicCategory[];
  totalCategories: number;
}

export interface SearchResponse {
  faqs: PublicFaq[];
  query: string;
  category: string | null;
  count: number;
}

// ─── Dynamic Categories (v1.70) ──────────────────────────────────────────
// Per-program cluster of FAQ category strings. The 24h backend cron
// (see utils/ai/categoryClusterer.ts) recomputes these from the live
// FAQ embeddings; the search overlay reads them via
// /api/public/category-clusters.
export interface CategoryCluster {
  canonicalName: string;
  aliases: string[];
  faqCount: number;
  lastRefreshedAt: string;
}

export interface CategoryClustersResponse {
  clusters: CategoryCluster[];
  total: number;
  limit: number;
}

export type TrackViewResponse = {
  recorded: boolean;
  deduped?: boolean;
  error?: string;
};

export type TrackReadingResponse = {
  recorded: boolean;
  type?: 'read' | 'completion';
  reason?: string;
  error?: string;
};
