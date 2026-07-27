// Types for v1.76 — Welcome Package: Journey Tracks.
//
// Used by both the admin tab (CRUD + drag-and-drop) and the
// user-side renderer. The renderer is data-driven: there is no
// concept of a "Summership" track or a "Phase 1" checkpoint
// anywhere — the admin defines the structure; the renderer paints it.

export type JourneyItemType =
  | 'task'
  | 'note'
  | 'warning'
  | 'external_link'
  | 'internal_link'
  | 'action'
  | 'divider';

export type JourneyTrackStatus = 'draft' | 'published' | 'unpublished' | 'archived';

export interface JourneyItem {
  _id: string;
  type: JourneyItemType;
  title: string;
  body: string;
  /** Task only — when true, this item counts toward progress. */
  required: boolean;
  /** Link types (external + internal). */
  href: string;
  /** Action type only — the event name the UI dispatches. */
  action: string;
  actionLabel: string;
  metadata: Record<string, unknown>;
  icon: string;
  accentColor: string;
}

export interface JourneyCheckpoint {
  _id: string;
  title: string;
  description: string;
  icon: string;
  items: JourneyItem[];
}

export interface JourneyTrack {
  _id: string;
  name: string;
  description: string;
  icon: string;
  accentColor: string;
  status: JourneyTrackStatus;
  checkpoints: JourneyCheckpoint[];
  createdBy?: string;
  publishedAt?: string | null;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Per-user progress overlay returned by /welcome/journeys. */
export interface JourneyProgress {
  required: number;
  done: number;
  percent: number;
  currentCheckpointId: string | null;
  lastActivityAt: string | null;
  completedItemIds: string[];
}

/** A row in the admin "progress monitor" table. */
export interface JourneyProgressRow {
  assignmentId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  batchName?: string | null;
  trackId: string;
  trackName: string;
  completedRequired: number;
  requiredTotal: number;
  percent: number;
  currentCheckpoint?: string;
  lastActivityAt?: string | null;
  scope?: string;
}

export interface JourneyAssignment {
  _id: string;
  trackId: string;
  userId: { _id: string; name: string; email: string } | string;
  scope: 'user' | 'batch' | 'program' | 'all';
  batchId?: { _id: string; name: string } | string | null;
  programId?: string | null;
  assignedAt: string;
  assignedBy?: string;
}

/** The lightweight summary used in the "my journeys" list. */
export interface JourneySummary {
  _id: string;
  name: string;
  description: string;
  icon: string;
  accentColor: string;
  checkpointCount: number;
  required: number;
  done: number;
  percent: number;
  currentCheckpointId: string | null;
  lastActivityAt: string | null;
}
