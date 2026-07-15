/**
 * tee.model.ts — Sign My Tee
 *
 * One tee per user. Configuration is captured at the end of the
 * wizard and the doc is upserted by `ownerId`. The `shareId` is
 * generated client-side (UUID v4 string) and stored alongside so
 * the public share URL maps cleanly to a single tee.
 *
 * `signatures[]` is an array of subdocs, each with a deterministic
 * 24-hex client-side `_id` (same pattern as Journey Tracks — see
 * the v1.76 skill). That lets the FE render signed overlays by
 * their stable id and lets us delete a single signature on owner
 * request without a "find index, splice, save" loop.
 *
 * The signature `dataUrl` field is the BG-removed PNG the visitor's
 * browser uploaded directly. We don't try to re-host it on Cloudinary
 * or GCS — the image is small, infrequently changed, and storing it
 * inline keeps the share page a single GET. Maximum raw length is
 * bounded by the controller so this can't bloat a doc.
 *
 * Coordinates (`x`, `y`, `scale`, `rotation`) are normalised to the
 * T-shirt's back-face content rect (0..1 each) so signatures
 * display correctly on any screen size without re-encoding.
 */

import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ShirtColor = 'black' | 'white' | 'navy' | 'maroon' | 'olive' | 'sand';
export type TextColor = 'white' | 'black' | 'gold' | 'silver' | 'cream';

export const SHIRT_COLORS: readonly ShirtColor[] = [
  'black',
  'white',
  'navy',
  'maroon',
  'olive',
  'sand',
] as const;

export const TEXT_COLORS: readonly TextColor[] = [
  'white',
  'black',
  'gold',
  'silver',
  'cream',
] as const;

export interface ITeeSignature {
  _id: Types.ObjectId;
  /** Logged-in signer, or null for a guest. */
  signerUserId?: Types.ObjectId | null;
  /** Display name (required even for guests). */
  signerName: string;
  /**
   * Raw data-URL of the BG-removed PNG. Saved inline so the share
   * page is a single GET. Maximum ~3MB on disk; capped by validator.
   */
  signerDataUrl: string;
  /** Which face of the tee the signature was placed on. Default 'back'. */
  face?: 'front' | 'back';
  /** 0..1 — fraction of tee width. */
  x: number;
  /** 0..1 — fraction of tee height. */
  y: number;
  /** 0.2..1.5 */
  scale: number;
  /** -45..45 degrees */
  rotation: number;
  createdAt: Date;
}

export interface ITee extends Document {
  ownerId: Types.ObjectId;
  shareId: string;
  /** v1.87.4 — named palette key OR an arbitrary `#rrggbb` hex.
      The FE's `paletteFromHex` derives a full palette from either
      so the renderer doesn't care about the shape. Existing rows
      stay valid because the validator accepts both. */
  shirtColor: ShirtColor | string;
  textColor: TextColor | string;
  /** Optional explicit hex overrides — win over `shirtColor` /
      `textColor` when present (e.g. when v1.87.4 FE sends a hex
      but skips the named-key path, or vice versa). Either field
      independently may be set; the FE falls back to the matching
      named key when the override is null. */
  customShirtHex?: string | null;
  customTextHex?: string | null;
  /** Name that prints on the back (1..30 chars). */
  nameOnBack: string;
  /** Public signature overlay cards. */
  signatures: ITeeSignature[];
  /** Lightweight view counter for the share page. */
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Subdoc ──────────────────────────────────────────────────────────────────

// Signatures subdoc. `_id` is on by default; we want the 24-hex
// client-generated id to round-trip to the FE so it can match
// signatures by stable id. The parent `{ _id: true, id: true }` are
// the schema-level options, NOT per-field options (a v1.76 pitfall).
const teeSignatureSchema = new MongooseSchema<ITeeSignature>(
  {
    signerUserId: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    signerName: { type: String, required: true, trim: true, maxlength: 60 },
    signerDataUrl: {
      type: String,
      required: true,
      maxlength: 4_000_000,
      validate: {
        validator: (v: string) => /^data:image\/(png|jpeg|webp);base64,/.test(v) || /^https?:\/\//.test(v),
        message: 'signerDataUrl must be a data: URL or a valid Cloudinary/HTTP URL',
      },
    },
    /** Which face the signature was placed on — defaults to 'back'. */
    face: { type: String, enum: ['front', 'back'], default: 'back' },
    x: { type: Number, required: true, min: 0, max: 1, default: 0.5 },
    y: { type: Number, required: true, min: 0, max: 1, default: 0.5 },
    scale: { type: Number, required: true, min: 0.2, max: 1.5, default: 0.6 },
    rotation: { type: Number, required: true, min: -45, max: 45, default: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true, id: true },
);

// ─── Parent ──────────────────────────────────────────────────────────────────

const teeSchema = new MongooseSchema<ITee>(
  {
    ownerId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    shareId: {
      type: String,
      required: true,
      unique: true,
      // UUID v4 → 36 chars. Bounded so the URL stays sane.
      maxlength: 64,
      index: true,
    },
    shirtColor: {
      // v1.87.4 — accept either a named palette key OR a hex. The
      // wizard's new picker sends a hex; older tees in the DB still
      // hold a named key (the FE has its own fallback at render time).
      type: String,
      default: 'black',
    },
    textColor: {
      type: String,
      default: 'white',
    },
    customShirtHex: { type: String, default: null },
    customTextHex: { type: String, default: null },
    nameOnBack: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 30,
    },
    signatures: {
      type: [teeSignatureSchema],
      default: [],
    },
    viewCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const Tee = mongoose.model<ITee>('Tee', teeSchema);
export default Tee;
