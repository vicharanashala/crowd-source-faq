export type Category = "General" | "Technical" | "ViBe" | "Standups" | "Other";

export const CATEGORIES: Category[] = [
  "General",
  "Technical",
  "ViBe",
  "Standups",
  "Other",
];

export interface Discussion {
  _id: string;
  title: string;
  description: string;
  category: Category;
  tags: string[];
  authorId: string;
  acceptedReplyId?: string | null;
  flagged: boolean;
  promotedToFaq: boolean;
  createdAt: string;
  updatedAt: string;
  // Present only on feed list responses (server-computed).
  replyCount?: number;
  upvoteTotal?: number;
  hasAcceptedAnswer?: boolean;
}

export interface Reply {
  _id: string;
  discussionId: string;
  authorId: string;
  content: string;
  upvoteCount: number;
  upvotedBy: string[];
  approved: boolean;
  accepted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DiscussionDetail extends Discussion {
  replies: Reply[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface InternalNote {
  text: string;
  createdAt: string;
}

export type EscalationPriority = "Low" | "Medium" | "High";
export type EscalationStatus = "Pending" | "In Progress" | "Resolved" | "Closed";

export interface Escalation {
  _id: string;
  title: string;
  description: string;
  category: string;
  priority: EscalationPriority;
  status: EscalationStatus;
  submittedBy: string;
  assignedTo?: string | null;
  attachments: string[];
  notes: InternalNote[];
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EscalationAnalytics {
  total: number;
  pending: number;
  inProgress: number;
  resolved: number;
  closed: number;
}
