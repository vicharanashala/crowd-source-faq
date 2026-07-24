// Shared types for the Session Support feature (frontend side).
// Mirrors the backend model in `backend/models/SupportRequest.ts`.

export type SupportIssueType = 'internet' | 'camera' | 'microphone' | 'device' | 'power' | 'other';
export type SupportStatus = 'Pending' | 'In Review' | 'Resolved' | 'Rejected';
export type SupportSenderRole = 'admin' | 'student';

export type SupportFieldType = 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'dropdown';
export const SUPPORT_FIELD_TYPES: SupportFieldType[] = ['text', 'textarea', 'number', 'date', 'boolean', 'dropdown'];

export interface SupportContextFieldOption {
  value: string;
  label: string;
}

/** Schema definition (admin-editable on a SupportCategory). */
export interface SupportContextFieldDefinition {
  _id?: string;
  key: string;
  label: string;
  type: SupportFieldType;
  required: boolean;
  placeholder: string;
  helpText: string;
  options: SupportContextFieldOption[];
  displayOrder: number;
  archived: boolean;
  archivedAt: string | null;
}

/** Category as returned by the admin / public APIs. */
export interface SupportCategory {
  _id: string;
  issueType: string;
  label: string;
  shortLabel: string;
  description: string;
  iconKey: 'wifi' | 'camera' | 'mic' | 'device' | 'power' | 'generic';
  steps: string[];
  fields: SupportContextFieldDefinition[];
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Per-ticket context-field value. The label is snapshotted at submit
 *  time so the admin view always renders the *current* label even if
 *  the field was renamed or archived. */
export interface SupportContextFieldValue {
  key: string;
  label: string;
  value: string | number | boolean | null;
}

export interface SupportDocument {
  name: string;
  url: string;
  type: string;
}

export interface SupportFollowUp {
  _id: string;
  senderRole: SupportSenderRole;
  senderId: string;
  senderName: string;
  message: string;
  requestProof: boolean;
  documents: SupportDocument[];
  createdAt: string;
}

export interface SupportInternalNote {
  _id: string;
  note: string;
  addedBy: string;
  addedByName: string;
  createdAt: string;
}

export interface SupportStatusHistoryEntry {
  _id: string;
  status: SupportStatus;
  note: string;
  updatedBy: string;
  updatedByName: string;
  timestamp: string;
}

export interface SupportRequest {
  _id: string;
  userId: string;
  userName: string;
  userEmail: string;
  issueType: SupportIssueType | string;
  issueLabel: string;
  title: string;
  details: string;
  attemptedSteps: string[];
  status: SupportStatus;
  adminNote: string;
  /** Only present in admin responses. */
  internalNotes?: SupportInternalNote[];
  resolutionSummary: string;
  sessionAccessUrl: string;
  followUps: SupportFollowUp[];
  statusHistory: SupportStatusHistoryEntry[];
  guidanceShownAt: string | null;
  contextFields: SupportContextFieldValue[];
  createdAt: string;
  updatedAt: string;
  // ── v1.65 — Golden Ticket fields (additive). All optional so
  // pre-v1.65 documents read as non-Golden through the type system
  // without forcing a migration of the response shape.
  isGolden?: boolean;
  spCost?: number;
  goldenConvertedAt?: string | null;
  goldenConvertedBy?: string | null;
  goldenConvertedByName?: string;
  goldenRejectionReason?: string;
  goldenRejectionEndsAt?: string | null;
}

export interface SupportIssueOption {
  key: SupportIssueType;
  label: string;
  shortLabel: string;
}

export interface SupportSummary {
  total: number;
  unresolvedCount: number;
  byStatus: Record<SupportStatus, number>;
  byIssueType: Record<SupportIssueType, number>;
  recent: Array<{
    _id: string;
    userId: string;
    userName: string;
    issueType: SupportIssueType;
    status: SupportStatus;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface SupportListResponse {
  requests: SupportRequest[];
  summary: SupportSummary;
  pagination: { total: number; page: number; limit: number; pages: number };
  issueOptions: SupportIssueOption[];
}

export interface SupportGuidance {
  issueType: SupportIssueType | string;
  label: string;
  shortLabel: string;
  steps: string[];
  fields: SupportContextFieldDefinition[];
}

export interface SupportAnalytics {
  totals: {
    total: number;
    resolved: number;
    rejected: number;
    pending: number;
    inReview: number;
    withAttachments: number;
  };
  byStatus: Record<SupportStatus, number>;
  byIssueType: Record<SupportIssueType, number>;
  byDay: Array<{ _id: string; count: number }>;
  recent: Array<{
    _id: string;
    userId: string;
    userName: string;
    issueType: SupportIssueType;
    status: SupportStatus;
    createdAt: string;
  }>;
}

// ── Golden Ticket user-side types (v1.73) ──────────────────────────────

/**
 * A single admin answer stored in `goldenResolutions[]` on a Golden
 * SupportRequest. The bell deep-links to the corresponding user-side
 * page so the user can read these.
 */
export interface GoldenResolutionPublic {
  text: string;
  adminId: string;
  adminName: string;
  createdAt: string;
  notificationSent: boolean;
}

/**
 * One row of the user-facing Golden history list. Includes the
 * resolved/rejected state, the admin answers (when resolved), and
 * any rejection reason (when rejected).
 */
export interface GoldenHistoryItem {
  _id: string;
  title: string;
  details: string;
  status: SupportStatus | string;
  spCost: number;
  userName: string;
  createdAt: string;
  resolvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string;
  goldenResolutions: GoldenResolutionPublic[];
  /** The caller's user-level ban timestamp, if set. */
  bannedUntil: string | null;
  isBanned: boolean;
}

/** Active ban window for the caller, derived from `user.goldenBannedUntil`. */
export interface GoldenHistoryBanned {
  userId: string;
  bannedUntil: string;
  isActiveBan: boolean;
  banHours: number;
}

/**
 * One row of the activity log timeline reconstructed server-side
 * from each ticket's statusHistory + goldenResolutions. Sorted
 * newest-first by the backend.
 */
export interface GoldenActivityEvent {
  type: 'ticket_raised' | 'resolved' | 'rejected' | 're_resolved';
  ticketId: string;
  title: string;
  at: string;
  status: string;
  details: string;
}

/** Response shape for `GET /api/support/golden/history`. */
export interface GoldenHistoryResponse {
  history: GoldenHistoryItem[];
  banned: GoldenHistoryBanned[];
  activity: GoldenActivityEvent[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

/** Response shape for `GET /api/support/golden/:id` (single ticket thread). */
export interface GoldenTicket {
  _id: string;
  title: string;
  details: string;
  status: SupportStatus | string;
  spCost: number;
  userId: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string;
  goldenResolutions: GoldenResolutionPublic[];
  userName: string;
  userEmail: string;
  // v1.74 — Golden Ticket discussion thread. After the first
  // admin answer is posted, both the user and any admin can reply
  // in `goldenTicketDiscussion` for 7 days. The first admin answer
  // is flagged `isProminent: true` so the UI can pin it to the top.
  // `discussionOpen` is computed at response time, so the UI
  // doesn't have to know the 7-day constant.
  goldenTicketDiscussion: GoldenDiscussionEntry[];
  firstAdminAnswerAt: string | null;
  discussionClosesAt: string | null;
  discussionOpen: boolean;
}

/**
 * v1.74 — One row of the Golden Ticket discussion thread. Either
 * the ticket owner (`senderRole: 'user'`) or an admin/moderator
 * (`senderRole: 'admin'`). The first admin answer of all time
 * carries `isProminent: true`; every other entry is just a
 * chronological message.
 */
export interface GoldenDiscussionEntry {
  _id?: string;
  text: string;
  senderRole: 'admin' | 'user';
  senderId: string;
  senderName: string;
  createdAt: string;
  isProminent: boolean;
}
