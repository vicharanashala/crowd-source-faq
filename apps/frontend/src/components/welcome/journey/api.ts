// Journey API client — used by both the admin tab and the
// user-side renderer. Splits cleanly into two halves so the user
// code can pull just the read-only calls and skip the admin paths.
import adminApi from '../../../admin/utils/adminApi';
import api from '../../../utils/api';
import type {
  JourneyAssignment,
  JourneyCheckpoint,
  JourneyItem,
  JourneyProgress,
  JourneyProgressRow,
  JourneySummary,
  JourneyTrack,
  JourneyTrackStatus,
} from './types';

// ─── Admin endpoints ──────────────────────────────────────────────────

export async function adminListTracks(status?: JourneyTrackStatus): Promise<JourneyTrack[]> {
  const params = status ? { status } : {};
  const res = await adminApi.get<{ tracks: JourneyTrack[] }>('/admin/welcome/tracks', { params });
  return res.data.tracks ?? [];
}

export async function adminGetTrack(id: string): Promise<JourneyTrack> {
  const res = await adminApi.get<{ track: JourneyTrack }>(`/admin/welcome/tracks/${id}`);
  return res.data.track;
}

export async function adminCreateTrack(body: {
  name: string;
  description?: string;
  icon?: string;
  accentColor?: string;
}): Promise<JourneyTrack> {
  const res = await adminApi.post<{ track: JourneyTrack }>('/admin/welcome/tracks', body);
  return res.data.track;
}

export async function adminUpdateTrack(
  id: string,
  patch: { name?: string; description?: string; icon?: string; accentColor?: string }
): Promise<JourneyTrack> {
  const res = await adminApi.patch<{ track: JourneyTrack }>(`/admin/welcome/tracks/${id}`, patch);
  return res.data.track;
}

export async function adminDeleteTrack(id: string): Promise<void> {
  await adminApi.delete(`/admin/welcome/tracks/${id}`);
}

export async function adminDuplicateTrack(id: string): Promise<JourneyTrack> {
  const res = await adminApi.post<{ track: JourneyTrack }>(`/admin/welcome/tracks/${id}/duplicate`);
  return res.data.track;
}

export async function adminSetTrackStatus(
  id: string,
  status: JourneyTrackStatus
): Promise<JourneyTrack> {
  const res = await adminApi.patch<{ track: JourneyTrack }>(`/admin/welcome/tracks/${id}/status`, { status });
  return res.data.track;
}

export async function adminReplaceCheckpoints(
  id: string,
  checkpoints: JourneyCheckpoint[]
): Promise<JourneyTrack> {
  const res = await adminApi.put<{ track: JourneyTrack }>(
    `/admin/welcome/tracks/${id}/checkpoints`,
    { checkpoints }
  );
  return res.data.track;
}

export async function adminAppendCheckpoint(
  id: string,
  body: { title: string; description?: string; icon?: string }
): Promise<JourneyTrack> {
  const res = await adminApi.post<{ track: JourneyTrack }>(
    `/admin/welcome/tracks/${id}/checkpoints`,
    body
  );
  return res.data.track;
}

export async function adminDeleteCheckpoint(id: string, cpId: string): Promise<JourneyTrack> {
  const res = await adminApi.delete<{ track: JourneyTrack }>(
    `/admin/welcome/tracks/${id}/checkpoints/${cpId}`
  );
  return res.data.track;
}

export async function adminReplaceItems(
  id: string,
  cpId: string,
  items: JourneyItem[]
): Promise<JourneyTrack> {
  const res = await adminApi.put<{ track: JourneyTrack }>(
    `/admin/welcome/tracks/${id}/checkpoints/${cpId}/items`,
    { items }
  );
  return res.data.track;
}

export async function adminAppendItem(
  id: string,
  cpId: string,
  item: JourneyItem
): Promise<JourneyTrack> {
  const res = await adminApi.post<{ track: JourneyTrack }>(
    `/admin/welcome/tracks/${id}/checkpoints/${cpId}/items`,
    item
  );
  return res.data.track;
}

export async function adminDeleteItem(
  id: string,
  cpId: string,
  itemId: string
): Promise<JourneyTrack> {
  const res = await adminApi.delete<{ track: JourneyTrack }>(
    `/admin/welcome/tracks/${id}/checkpoints/${cpId}/items/${itemId}`
  );
  return res.data.track;
}

// ─── Assignments ──────────────────────────────────────────────────────

export interface AssignmentPayload {
  scope: 'user' | 'batch' | 'program' | 'all';
  userIds?: string[];
  batchIds?: string[];
}

export async function adminListAssignments(trackId: string): Promise<JourneyAssignment[]> {
  const res = await adminApi.get<{ assignments: JourneyAssignment[] }>(
    `/admin/welcome/tracks/${trackId}/assignments`
  );
  return res.data.assignments ?? [];
}

export async function adminCreateAssignments(
  trackId: string,
  payload: AssignmentPayload
): Promise<{ assigned: number; total: number }> {
  const res = await adminApi.post<{ assigned: number; total: number }>(
    `/admin/welcome/tracks/${trackId}/assignments`,
    payload
  );
  return res.data;
}

export async function adminDeleteAssignment(trackId: string, assignmentId: string): Promise<void> {
  await adminApi.delete(`/admin/welcome/tracks/${trackId}/assignments/${assignmentId}`);
}

export async function adminGetTrackProgress(trackId: string): Promise<{
  rows: JourneyProgressRow[];
  requiredTotal: number;
}> {
  const res = await adminApi.get<{ rows: JourneyProgressRow[]; requiredTotal: number }>(
    `/admin/welcome/tracks/${trackId}/progress`
  );
  return res.data;
}

export async function adminGetCrossProgress(filters: {
  trackId?: string;
  batchId?: string;
  programId?: string;
  status?: JourneyTrackStatus;
}): Promise<{ rows: JourneyProgressRow[] }> {
  const res = await adminApi.get<{ rows: JourneyProgressRow[] }>(
    '/admin/welcome/tracks/progress',
    { params: filters }
  );
  return res.data;
}

// ─── User endpoints ───────────────────────────────────────────────────

export async function listMyJourneys(): Promise<JourneySummary[]> {
  const res = await api.get<{ journeys: JourneySummary[] }>('/welcome/journeys');
  return res.data.journeys ?? [];
}

export async function getMyJourney(
  trackId: string
): Promise<{ track: JourneyTrack; progress: JourneyProgress }> {
  const res = await api.get<{ track: JourneyTrack; progress: JourneyProgress }>(
    `/welcome/journeys/${trackId}`
  );
  return res.data;
}

export async function completeJourneyItem(trackId: string, itemId: string): Promise<void> {
  await api.post(`/welcome/journeys/${trackId}/items/${itemId}/complete`);
}

export async function uncompleteJourneyItem(trackId: string, itemId: string): Promise<void> {
  await api.delete(`/welcome/journeys/${trackId}/items/${itemId}/complete`);
}

// Ask the AI a question about the user's assigned journey tracks
// (checkpoints + items). Distinct from the resources-ask endpoint
// because the data source is trek content, not onboarding knowledge.
export async function askJourneyQuestion(question: string): Promise<{ answer: string; tracksUsed: number }> {
  const res = await api.post<{ answer: string; tracksUsed: number }>(
    '/welcome/journeys/ask',
    { question }
  );
  return res.data ?? { answer: 'No answer.', tracksUsed: 0 };
}
