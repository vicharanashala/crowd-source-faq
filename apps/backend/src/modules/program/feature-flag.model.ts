import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

/**
 * FeatureFlag — admin-toggleable experimental / optional features.
 *
 * A single document per feature key, identified by a stable string
 * `key` (e.g. 'sessionSupport'). Documents are upserted lazily by the
 * backend on first use; admins toggle via the dedicated admin endpoint
 * and the admin UI surfaces the current state.
 *
 * This model is intentionally generic — it is NOT specific to the
 * Session Support feature. Future experimental features can register
 * their own keys and reuse the same toggle infrastructure.
 *
 * Per-flag access is server-enforced. The /api/feature-flags GET
 * endpoint returns the live state to authenticated users (so the
 * frontend can hide / show the feature); the PUT endpoint is admin
 * only.
 */

export type FeatureFlagKey = 'sessionSupport';

export interface IFeatureFlag extends Document {
  /** Stable, machine-readable identifier. */
  key: FeatureFlagKey | string;
  /** Whether the feature is currently enabled for end users. */
  enabled: boolean;
  /** Short label for admin UI. */
  label: string;
  /** Longer description for the admin "what does this do" tooltip. */
  description: string;
  /** Last admin to flip the switch. */
  updatedBy: Types.ObjectId | null;
  /** Last flip timestamp. */
  updatedAt: Date;
  /**
   * v1.69 — Phase 8: per-program flag overrides. When set, this
   * flag applies only within the named program; when null, it's
   * the global default. The lookup in isFeatureEnabled() walks
   * the override first, falling back to the global default.
   *
   * The existing `key: 1` unique index gets a compound twin so a
   * single key can have one global default AND one per-program
   * override without collision.
   */
  batchId: Types.ObjectId | null;
  /** When the feature was first enabled (if ever). */
  firstEnabledAt: Date | null;
  /** When the feature was most recently disabled (if ever). */
  lastDisabledAt: Date | null;
  /** When this document was created (for audit). */
  createdAt: Date;
}

const featureFlagSchema = new MongooseSchema<IFeatureFlag>(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    enabled: { type: Boolean, default: false, index: true },
    label: { type: String, required: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 500 },
    updatedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    // v1.69 — Phase 8: per-program override scoping. null = global
    // default; non-null = per-program override.
    batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    firstEnabledAt: { type: Date, default: null },
    lastDisabledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// v1.69 — Phase 8: compound unique index (key, batchId) so a
// single feature key can have at most one global default (where
// batchId: null) AND one per-program override per batch. The
// sparse option means the global default with batchId: null is
// indexed; programmatic overrides are also indexed (batchId is
// always a real ObjectId when not null).
featureFlagSchema.index(
  { key: 1, batchId: 1 },
  { unique: true, partialFilterExpression: { $or: [{ key: { $type: 'string' } }] } }
);

export default mongoose.model<IFeatureFlag>('FeatureFlag', featureFlagSchema, 'yaksha_faq_feature_flags');
