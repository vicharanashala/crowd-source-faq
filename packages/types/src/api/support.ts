// ── Support API Contracts ────────────────────────────────────────

export interface CreateSupportRequest {
  issueType: string;
  description: string;
  contextFields?: Record<string, unknown>;
  evidence?: string[];
}

export interface SupportFollowUp {
  _id: string;
  body: string;
  author: string;
  authorRole: string;
  createdAt: string;
}
