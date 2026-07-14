// API client for the Session Support feature. Reuses the existing
// `api` axios instance (so JWT auth, error toasts, file uploads all
// work consistently).

import api from '../../utils/api';
import type {
  SupportGuidance,
  SupportListResponse,
  SupportAnalytics,
  SupportRequest,
  SupportIssueType,
  SupportStatus,
  SupportContextFieldDefinition,
  SupportCategory,
  GoldenHistoryResponse,
  GoldenTicket,
} from './types';

export const SUPPORT_ISSUE_OPTIONS: { key: SupportIssueType; label: string; shortLabel: string; icon: 'wifi' | 'camera' | 'mic' | 'device' | 'power' | 'other' }[] = [
  { key: 'internet',   label: 'Internet Problem', shortLabel: 'Internet', icon: 'wifi' },
  { key: 'camera',     label: 'Camera Issue',     shortLabel: 'Camera',   icon: 'camera' },
  { key: 'microphone', label: 'Microphone Issue', shortLabel: 'Mic',      icon: 'mic' },
  { key: 'device',     label: 'Device Failure',   shortLabel: 'Device',   icon: 'device' },
  { key: 'power',      label: 'Power Outage',     shortLabel: 'Power',    icon: 'power' },
  { key: 'other',      label: 'Other Reason',     shortLabel: 'Other',    icon: 'other' },
];

export async function fetchTroubleshoot(issueType: string): Promise<SupportGuidance> {
  const res = await api.get<SupportGuidance>(`/support/troubleshoot/${issueType}`);
  return res.data;
}

export interface ListFilters {
  status?: SupportStatus;
  issueType?: SupportIssueType;
  q?: string;
  userName?: string;
  email?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  // v1.65 — Golden filter. Wired through to
  // GET /api/support/requests?isGolden=true|false on the backend.
  isGolden?: boolean;
}

export async function listSupportRequests(filters: ListFilters = {}): Promise<SupportListResponse> {
  const res = await api.get<SupportListResponse>('/support/requests', { params: filters });
  return res.data;
}

export async function getSupportRequest(id: string): Promise<SupportRequest> {
  const res = await api.get<{ request: SupportRequest }>(`/support/requests/${id}`);
  return res.data.request;
}

export interface SubmitPayload {
  issueType: SupportIssueType | string;
  title?: string;
  details: string;
  attemptedSteps: string[];
  documents?: { name: string; url: string; type: string }[];
  guidanceShownAt?: string;
  contextFields?: Array<{ key: string; label: string; value: string | number | boolean | null }>;
}

export async function submitSupportRequest(payload: SubmitPayload): Promise<SupportRequest> {
  const res = await api.post<{ request: SupportRequest }>('/support/requests', payload);
  return res.data.request;
}

export async function replyToSupportRequest(
  id: string,
  message: string,
  documents: { name: string; url: string; type: string }[] = [],
  requestProof = false,
): Promise<SupportRequest> {
  const res = await api.post<{ request: SupportRequest }>(`/support/requests/${id}/follow-ups`, {
    message,
    documents,
    requestProof,
  });
  return res.data.request;
}

export interface StatusUpdatePayload {
  status: SupportStatus;
  adminNote?: string;
  internalNote?: string;
  resolutionSummary?: string;
  sessionAccessUrl?: string;
  followUpMessage?: string;
  requestProof?: boolean;
}

export async function updateSupportStatus(
  id: string,
  payload: StatusUpdatePayload,
): Promise<SupportRequest> {
  const res = await api.patch<{ request: SupportRequest }>(`/support/requests/${id}/status`, payload);
  return res.data.request;
}

// ─── v1.65 — Golden Ticket (user-driven flow) ───────────────────────────────

export interface GoldenQueueItem {
  _id: string;
  isOwn: boolean;
  userName: string;
  title: string;
  details: string;
  spCost: number;
  status: string;
  createdAt: string;
}

export interface SpurtiStatus {
  sp: number;
  cooldownHours: number;
  cooldownEndsAt: string | null;
  canSubmitGolden: boolean;
}

/**
 * GET /api/support/me/sp
 * Returns the user's SP balance + Golden cooldown status. Used by
 * the GoldenTicket page header and by the navbar SpurtiChip.
 */
export async function fetchSpurtiStatus(): Promise<SpurtiStatus> {
  const res = await api.get<SpurtiStatus>('/support/me/sp');
  return res.data;
}

export interface GoldenQueueResponse {
  items: GoldenQueueItem[];
  myQueuePosition?: number;
  ticketsAhead?: number;
  mySpCost?: number;
}

/**
 * GET /api/support/golden/queue
 * Returns recent Golden tickets for the live Escalation Queue panel.
 * Non-admin callers see requester name as 'ANONYMOUS' for tickets
 * they didn't submit.
 */
export async function fetchGoldenQueue(limit = 8, q?: string): Promise<GoldenQueueResponse> {
  const res = await api.get<GoldenQueueResponse>('/support/golden/queue', {
    params: { limit, q },
  });
  return res.data;
}

/**
 * POST /api/support/requests with isGolden=true + spCost.
 * Submits a user-driven Golden Ticket escalation. Deducts the SP
 * upfront; 429 if the user is in cooldown; 400 if they don't have
 * enough SP for the chosen investment.
 */
export async function submitGoldenTicket(
  title: string,
  details: string,
  spCost: number,
): Promise<SupportRequest> {
  const res = await api.post<{ request: SupportRequest }>('/support/requests', {
    issueType: 'other',
    title,
    details,
    isGolden: true,
    spCost,
  });
  return res.data.request;
}

/**
 * GET /api/support/golden/history (v1.73)
 * Returns the caller's own past Golden tickets, the active ban
 * window, and a chronological activity log. The page uses this to
 * render the History section below the live Escalation Queue.
 */
export async function fetchGoldenHistory(
  page = 1,
  limit = 25,
): Promise<GoldenHistoryResponse> {
  const res = await api.get<GoldenHistoryResponse>('/support/golden/history', {
    params: { page, limit },
  });
  return res.data;
}

/**
 * GET /api/support/golden/:id (v1.73)
 * Single Golden ticket thread scoped to the caller (404 for
 * someone else's ticket). The in-app bell deep-links here when an
 * admin resolves a Golden ticket — the dedicated page is the only
 * view that renders `goldenResolutions[]` for the user.
 */
export async function getMyGoldenTicket(id: string): Promise<GoldenTicket> {
  const res = await api.get<{ ticket: GoldenTicket }>(`/support/golden/${id}`);
  return res.data.ticket;
}

export async function listGuidance(): Promise<SupportGuidance[]> {
  const res = await api.get<SupportGuidance[]>('/support/guidance');
  return res.data;
}

export async function updateGuidance(issueType: string, steps: string[]): Promise<SupportGuidance> {
  const res = await api.put<{ guidance: SupportGuidance }>(`/support/guidance/${issueType}`, { steps });
  return res.data.guidance;
}

export async function fetchSupportAnalytics(): Promise<SupportAnalytics> {
  const res = await api.get<SupportAnalytics>('/support/analytics');
  return res.data;
}

// ─── Category CRUD (admin) ────────────────────────────────────────────────

export async function listCategories(): Promise<SupportCategory[]> {
  const res = await api.get<{ categories: SupportCategory[] }>('/support/categories');
  return res.data.categories ?? [];
}

export async function getCategory(issueType: string): Promise<SupportCategory> {
  const res = await api.get<{ category: SupportCategory }>(`/support/categories/${issueType}`);
  return res.data.category;
}

export interface CategoryPayload {
  issueType: string;
  label: string;
  shortLabel: string;
  description?: string;
  iconKey?: string;
  steps?: string[];
  isActive?: boolean;
}

export async function createCategory(payload: CategoryPayload): Promise<SupportCategory> {
  const res = await api.post<{ category: SupportCategory }>('/support/categories', payload);
  return res.data.category;
}

export async function updateCategory(issueType: string, patch: Partial<CategoryPayload>): Promise<SupportCategory> {
  const res = await api.patch<{ category: SupportCategory }>(`/support/categories/${issueType}`, patch);
  return res.data.category;
}

export async function deleteCategory(issueType: string): Promise<void> {
  await api.delete(`/support/categories/${issueType}`);
}

// ─── Per-field CRUD (admin) ───────────────────────────────────────────────

export interface FieldPayload {
  key?: string;
  label: string;
  type: SupportContextFieldDefinition['type'];
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: { value: string; label: string }[];
  displayOrder?: number;
}

export async function addField(issueType: string, payload: FieldPayload): Promise<SupportCategory> {
  const res = await api.post<{ category: SupportCategory }>(`/support/categories/${issueType}/fields`, payload);
  return res.data.category;
}

export async function updateField(issueType: string, fieldKey: string, patch: Partial<FieldPayload>): Promise<SupportCategory> {
  const res = await api.patch<{ category: SupportCategory }>(`/support/categories/${issueType}/fields/${fieldKey}`, patch);
  return res.data.category;
}

export async function archiveField(issueType: string, fieldKey: string): Promise<SupportCategory> {
  const res = await api.delete<{ category: SupportCategory }>(`/support/categories/${issueType}/fields/${fieldKey}`);
  return res.data.category;
}
