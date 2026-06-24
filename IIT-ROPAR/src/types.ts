export interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  upvotes: number;
  downvotes: number;
  popularity: number;
  lastUpdated: string;
  related: string[];
  tags: string[];
}

export interface DiscussionThread {
  id: string;
  user: string;
  question: string;
  answer?: string;
  status: "open" | "answered" | "published";
  timestamp: string;
}

export interface ModerationLog {
  id: string;
  user: string;
  action: string;
  score: string;
  status: "Clean" | "Auto-Blocked" | "Flagged" | "Reviewed";
  timestamp: string;
}

export interface UserProfile {
  email: string;
  name: string;
  role: string;
  contributionScore: number;
  rosettaLogsCount: number;
  nocStatus: "verified" | "pending" | "none";
  activeStreak: number;
}
