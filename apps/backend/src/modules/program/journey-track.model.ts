/**
 * JourneyTrack — generic, admin-authored onboarding journey.
 *
 * v1.76 — Welcome Package: Journey Tracks.
 *
 * Architecture goal: NO program-specific frontend code. The
 * admin creates a track by name; the backend stores it as a
 * tree of checkpoints → items. The user-side renderer paints
 * the data with no program-specific code paths. The same
 * renderer displays a track called "Summership Trek" or
 * "Monsoonship Journey" — the only difference is what the admin
 * authored.
 *
 * A track is a document with an embedded `checkpoints[]` array
 * (each with an embedded `items[]` array). We keep the tree
 * inline rather than splitting into separate collections so
 * the admin edit-screen can save the whole structure in one
 * request (avoids the N+1 saves dance that complex CMS
 * schemas often fall into).
 *
 * Status lifecycle:
 *   draft      — admin is still editing, invisible to users
 *   published  — assigned users see it; assignment is gated on
 *                this status (not draft/unpublished/archived)
 *   unpublished— admin temporarily hid it; users lose access
 *                but the track + assignments are preserved
 *   archived   — soft-removed from the active pool; assignments
 *                + progress are kept for the audit trail
 *
 *   draft → published → unpublished → published (cycle)
 *   published → archived (terminal-ish; admin can re-publish
 *   after editing)
 */
import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type JourneyTrackStatus = 'draft' | 'published' | 'unpublished' | 'archived';

/**
 * Item types. Each type drives:
 *   - which optional fields are required (e.g. href for link types)
 *   - how the renderer paints it (checkbox / note / warning / link…)
 *   - whether it affects progress (only `required: true` tasks
 *     count toward checkpoint + track completion)
 */
export type JourneyItemType =
  | 'task'             // required / optional checkbox task
  | 'note'             // informational block (no progress effect)
  | 'warning'          // advisory block (no progress effect)
  | 'external_link'    // opens a new tab to an absolute URL
  | 'internal_link'    // in-app navigation, e.g. /support/new
  | 'action'           // calls a named client event (UI handles it)
  | 'divider';         // visual separator with a label

export interface IJourneyItem {
  _id?: Types.ObjectId;
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
  /** Free-form metadata for custom UI behaviour on action types. */
  metadata: Record<string, unknown>;
  icon: string;
  accentColor: string;
}

export interface IJourneyCheckpoint {
  _id?: Types.ObjectId;
  title: string;
  description: string;
  icon: string;
  items: IJourneyItem[];
}

export interface IJourneyTrack extends Document {
  name: string;
  description: string;
  icon: string;
  accentColor: string;
  status: JourneyTrackStatus;
  checkpoints: IJourneyCheckpoint[];
  createdBy: Types.ObjectId;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const itemSchema = new MongooseSchema<IJourneyItem>(
  {
    type: {
      type: String,
      enum: ['task', 'note', 'warning', 'external_link', 'internal_link', 'action', 'divider'],
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200, default: '' },
    body: { type: String, required: true, trim: true, maxlength: 4000, default: '' },
    required: { type: Boolean, default: false },
    href: { type: String, default: '', maxlength: 2000 },
    action: { type: String, default: '', maxlength: 100 },
    actionLabel: { type: String, default: '', maxlength: 100 },
    metadata: { type: MongooseSchema.Types.Mixed, default: {} },
    icon: { type: String, default: '', maxlength: 50 },
    accentColor: { type: String, default: '', maxlength: 30 },
  },
  { _id: true, id: true, versionKey: false }
);

const checkpointSchema = new MongooseSchema<IJourneyCheckpoint>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200, default: '' },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    icon: { type: String, default: '', maxlength: 50 },
    items: { type: [itemSchema], default: [] },
  },
  { _id: true, id: true, versionKey: false }
);

const journeyTrackSchema = new MongooseSchema<IJourneyTrack>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    icon: { type: String, default: '🛤️', maxlength: 50 },
    accentColor: { type: String, default: 'accent', maxlength: 30 },
    status: {
      type: String,
      enum: ['draft', 'published', 'unpublished', 'archived'],
      default: 'draft',
      index: true,
    },
    checkpoints: { type: [checkpointSchema], default: [] },
    createdBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
    publishedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// List all tracks (admins + filters by status).
journeyTrackSchema.index({ status: 1, createdAt: -1 });
// "Latest published tracks" listing (admin progress monitor).
journeyTrackSchema.index({ status: 1, publishedAt: -1 });

export default mongoose.model<IJourneyTrack>(
  'JourneyTrack',
  journeyTrackSchema,
  'yaksha_journey_tracks'
);
