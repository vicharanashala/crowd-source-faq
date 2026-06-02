// Shared types across UI components

export interface Comment {
  _id: string;
  author?: { name?: string; _id?: string };
  body: string;
  createdAt?: string;
  upvotes?: (string | { _id?: string })[];
  downvotes?: (string | { _id?: string })[];
  verified?: boolean;
  isExpertAnswer?: boolean;
  depth?: number;
  parentId?: string | null;
  replies?: Comment[];
  // First Responder badge
  isFirstResponder?: boolean;
  firstResponderAwardedAt?: string | null;
}

export interface SolutionDNA {
  steps: string[];
  tools: string[];
  timeToComplete?: string;
  difficulty?: 'Easy' | 'Moderate' | 'Tricky';
}

export interface Post {
  _id: string;
  title: string;
  body?: string;
  tags?: string[];
  status?: 'answered' | 'open' | string;
  author?: { name?: string; _id?: string };
  createdAt?: string;
  upvotes?: (string | { _id?: string })[];
  comments?: Comment[];
  answer?: string | null;
  answerIsExpert?: boolean;
  answerAuthorId?: string;
  dna?: SolutionDNA;
  // Time-Trial fields
  timeTrialStatus?: 'none' | 'pending' | 'awarded';
  timeTrialStartedAt?: string | null;
  timeTrialFirstResponder?: string | null;
  timeTrialFirstResponderAt?: string | null;
  timeTrialHoursRemaining?: number | null;
  // Escalation fields
  escalationStatus?: 'none' | 'escalated' | 'resolved' | 'dismissed';
  escalatedAt?: string | null;
  escalationReason?: string | null;
  [key: string]: unknown;
}

export interface TrendingQuery {
  query: string;
  count: number;
}

export interface FAQItem {
  _id: string;
  question: string;
  answer: string;
  category?: string;
  // Freshness system
  reviewStatus?: 'verified' | 'pending_review' | 'update_requested';
  lastVerifiedDate?: string;
  reviewIntervalDays?: number;
  freshnessTier?: 'evergreen' | 'seasonal' | 'volatile';
  helpfulVotes?: number;
  unhelpfulVotes?: number;
}

export interface SearchResult {
  _id: string;
  question?: string;
  title?: string;
  answer?: string;
  body?: string;
  source?: 'faq' | 'community';
  status?: 'answered' | 'open' | string;
  category?: string;
  upvotes?: unknown[];
  comments?: unknown[];
  vectorScore?: number;
  textScore?: number;
  helpfulVotes?: number;
  unhelpfulVotes?: number;
}

export interface FAQMatch {
  _id: string;
  question: string;
  answer?: string;
  category?: string;
  similarity?: number;
}

export interface Category {
  name: string;
  icon: React.ReactNode;
}

// Lightweight shape for the HomePage "From Meetings" section — only fields
// the card actually renders. Kept narrow so the public endpoint can stay small.
export interface RecentFAQ {
  _id: string;
  question: string;
  answer: string;
  category: string;
  createdAt: string;
  sourceType: 'manual' | 'community_promotion' | 'expert_verified' | 'zoom_transcript';
  sourceMeetingTopic?: string | null;
  helpfulVotes?: number;
}

// Anonymized aggregate stats from the Zoom pipeline. Shown as a "data is
// alive" indicator on the home page.
export interface ZoomPublicStats {
  meetingsProcessed: number;
  insightsExtracted: number;
  knowledgeExtracted: number;
  faqsPromoted: number;
}