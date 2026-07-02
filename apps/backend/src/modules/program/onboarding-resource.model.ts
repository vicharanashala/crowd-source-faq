/**
 * OnboardingResource — generalized orientation material.
 *
 * v1.69 — Welcome Package Management: Generalizes the legacy
 * Orientation model into a typed resource collection. Existing
 * Orientation rows are NOT migrated into this collection — the
 * legacy model, its routes, and its student viewer continue to
 * work unchanged. New resources created via this model live in
 * parallel and are served by the new /welcome/resources endpoint.
 *
 * Discriminator: `kind` is the routing field that controls
 *   - which fields are required (e.g. externalUrl for kind=link,
 *     filePath for non-link kinds),
 *   - how completion is computed (video = watch%, everything else =
 *     time-based progress),
 *   - which React viewer component renders it on the front-end.
 *
 * Resource types:
 *   - video     : mp4/webm file upload, watch% completion (existing
 *                 Orientation behavior is unchanged; this is a new
 *                 resource slot that admins can use in addition to
 *                 the legacy Orientation).
 *   - pdf       : PDF document upload. Completion is time-based
 *                 (page dwell time). Original file kept on disk.
 *   - pptx      : PowerPoint upload. Same completion model as PDF.
 *   - svg       : SVG flowchart. Inline rendering; completion = time
 *                 spent viewing ≥ threshold.
 *   - markdown  : .md file upload, rendered with a markdown viewer.
 *   - txt       : Plain text upload, rendered as a scrollable
 *                 preformatted block.
 *   - link      : External URL. No file upload. Opens in a new tab.
 *                 Completion = mark-as-read.
 *
 * Each resource belongs to exactly one program (`batchId`) so the
 * admin-cms stays program-scoped, matching the multi-program
 * isolation guarantee applied to Orientation, Mentor, Project, etc.
 *
 * Ordering is per-program via `order` (drag-drop). Visibility is a
 * boolean — hidden resources are visible to admins but excluded
 * from the public student list.
 */

import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type OnboardingResourceKind =
  | 'video'
  | 'pdf'
  | 'pptx'
  | 'svg'
  | 'markdown'
  | 'txt'
  | 'link';

export interface IOnboardingResource extends Document {
  batchId: Types.ObjectId | null;
  kind: OnboardingResourceKind;

  /** Title shown in the student list and the viewer header. */
  title: string;
  /** Long description; markdown allowed for non-video kinds. */
  description: string;

  /**
   * For file kinds (video/pdf/pptx/svg/markdown/txt): relative path
   * served from the backend (e.g. `/uploads/onboarding-resources/<id>.<ext>`).
   * For kind=link: external absolute URL.
   * For kind=svg (Cloudinary): Cloudinary secure_url (https://res.cloudinary.com/...).
   * For backwards compat with the legacy Orientation model this is
   * also used for video URLs that already point to a CDN.
   */
  url: string;

  /**
   * Cloudinary public_id for kind=svg assets hosted on Cloudinary.
   * Stored so we can construct transformation URLs or delete by ID.
   * Null for all other kinds.
   */
  publicId?: string | null;

  /** Original file metadata, only set for uploaded kinds. */
  filePath?: string | null;
  fileMime?: string | null;
  fileSizeBytes?: number | null;

  /**
   * For kind=video: percent of playback that must be watched (0-100).
   * For other kinds: minimum seconds of view time required for
   * completion. Frontend and backend both honor this — when in
   * doubt the backend stores it and the frontend reads it.
   */
  completionThreshold: number;

  /** Drag-and-drop order within the program. Lower = earlier. */
  order: number;

  /** When false, the resource is hidden from the student list. */
  visible: boolean;

  /** Free-form tags; useful for filtering. */
  tags: string[];

  createdAt: Date;
  updatedAt: Date;
}

const onboardingResourceSchema = new MongooseSchema<IOnboardingResource>(
  {
    batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    kind: {
      type: String,
      enum: ['video', 'pdf', 'pptx', 'svg', 'markdown', 'txt', 'link'],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    description: { type: String, default: '', maxlength: 4000 },
    url: { type: String, required: true, maxlength: 2000 },
    publicId: { type: String, default: null },
    filePath: { type: String, default: null },
    fileMime: { type: String, default: null },
    fileSizeBytes: { type: Number, default: null },
    completionThreshold: { type: Number, default: 90 },
    order: { type: Number, default: 0, index: true },
    visible: { type: Boolean, default: true, index: true },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Compound indexes support the common admin / student queries.
onboardingResourceSchema.index({ batchId: 1, visible: 1, order: 1 });
onboardingResourceSchema.index({ batchId: 1, kind: 1, order: 1 });

export default mongoose.model<IOnboardingResource>(
  'OnboardingResource',
  onboardingResourceSchema,
  'yaksha_faq_onboarding_resources'
);