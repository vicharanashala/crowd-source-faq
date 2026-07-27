/**
 * tee.validation.ts — Zod schemas for /api/tee request bodies.
 */
import { z } from 'zod';
import { SHIRT_COLORS, TEXT_COLORS } from './tee.model.js';

const objectIdLike = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

// 6- or 8-digit `#rrggbb` / `#rrggbbaa` hex. We strip alpha on the
// way into the model — PremiumTee's `paletteFromHex` only needs RGB.
const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Must be a #rrggbb hex')
  .transform((v) => v.slice(0, 7).toLowerCase());

export const teeConfigSchema = z.object({
  // v1.87.4 — accept either a named palette key OR a hex (the FE
  // sends both during the migration window so older share cards
  // and the wizard's custom-picker payloads coexist).
  shirtColor: z.string().refine(
    (v) =>
      (SHIRT_COLORS as readonly string[]).includes(v) || /^#[0-9a-f]{6}$/i.test(v),
    { message: 'shirtColor must be a known palette key or #rrggbb hex' },
  ),
  textColor: z.string().refine(
    (v) =>
      (TEXT_COLORS as readonly string[]).includes(v) || /^#[0-9a-f]{6}$/i.test(v),
    { message: 'textColor must be a known palette key or #rrggbb hex' },
  ),
  /** Optional explicit hex overrides — win over the keys above. */
  customShirtHex: hexColor.optional(),
  customTextHex: hexColor.optional(),
  nameOnBack: z
    .string()
    .trim()
    .min(1, 'Enter a name')
    .max(30, 'Max 30 characters'),
});

export const teeSignatureSchema = z.object({
  signerName: z.string().trim().min(1).max(60),
  signerDataUrl: z
    .string()
    .max(4_000_000)
    .regex(/^data:image\/(png|jpeg|webp);base64,/, 'Must be a data: image URL'),
  /** Which face the signature was placed on. Defaults to 'back'. */
  face: z.enum(['front', 'back']).default('back'),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().min(0.2).max(1.5),
  rotation: z.number().min(-45).max(45),
});

/** Used by PATCH /tee/share/:shareId/sign/:sigId to move/resize a placed signature */
export const teeSignaturePositionSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().min(0.2).max(1.5),
  rotation: z.number().min(-45).max(45),
});

export const teeSignatureIdParamSchema = z.object({
  shareId: z.string().min(1).max(64),
  sigId: objectIdLike,
});

export const teeShareIdParamSchema = z.object({ shareId: z.string().min(1).max(64) });
