/**
 * Centralised request validation schemas using Zod.
 * Import the schemas you need in controllers and call .parse() early.
 * Zod throws ZodError on failure — catch it in your controller and return 400.
 */
import { z } from 'zod';
import type { Response } from 'express';

// ─── Auth ───────────────────────────────────────────────────────────────────────
// Password policy (OWASP A07 / NIST 800-63B aligned): minimum length 8,
// capped at 128 to bound bcrypt work, and must mix letters + digits so that
// trivial passwords ("password", "111111") are rejected at the boundary.
// NOTE: `loginSchema` deliberately keeps `min(1)` — tightening login would
// lock out existing accounts created under the old 6-char rule. The stronger
// policy applies only at registration and password-change time.
export const passwordPolicy = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const registerSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters').max(100),
  email:    z.string().email('Invalid email address'),
  password: passwordPolicy,
});

export const loginSchema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword:     passwordPolicy,
});

export const updateProfileSchema = z.object({
  name:  z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
});

// ─── FAQ ────────────────────────────────────────────────────────────────────────
const objectIdLike = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId');

export const createFAQSchema = z.object({
  question:           z.string().min(3, 'Question is too short').max(500),
  answer:             z.string().min(3, 'Answer is too short').max(10000),
  category:           z.string().min(1, 'Category is required').max(100),
  batchId:            objectIdLike,
  freshnessTier:      z.enum(['evergreen', 'seasonal', 'volatile']).optional(),
  reviewIntervalDays: z.number().int().min(0).max(365).optional(),
});

export const updateFAQSchema = z.object({
  question:           z.string().min(3).max(500).optional(),
  answer:             z.string().min(3).max(10000).optional(),
  category:           z.string().min(1).max(100).optional(),
  batchId:            objectIdLike.optional(),
  status:             z.enum(['approved', 'pending', 'rejected']).optional(),
  freshnessTier:      z.enum(['evergreen', 'seasonal', 'volatile']).optional(),
  reviewIntervalDays: z.number().int().min(0).max(365).optional(),
});

export const flagFAQSchema = z.object({
  reason: z.string().max(200, 'Reason must be 200 characters or less').optional(),
});

export const voteReviewSchema = z.object({
  verdict:     z.enum(['still_accurate', 'needs_update']),
  suggestion:  z.string().max(300, 'Suggestion must be 300 characters or less').optional(),
});

// ─── Community ──────────────────────────────────────────────────────────────────
export const createPostSchema = z.object({
  title: z.string().min(10, 'Title must be at least 10 characters').max(300),
  body:  z.string().min(20, 'Body must be at least 20 characters').max(5000),
});

export const checkDuplicateSchema = z.object({
  query:      z.string().min(3),
  isShortQuery: z.boolean().optional(),
});

export const addCommentSchema = z.object({
  body:     z.string().min(1).max(1000),
  parentId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid parentId').optional(),
});

export const resolvePostSchema = z.object({
  answer: z.string().min(10).max(5000),
});

export const reportPostSchema = z.object({
  reason: z.string().min(3).max(300),
});

// ─── Search ─────────────────────────────────────────────────────────────────────
export const searchSchema = z.object({
  q:      z.string().min(1),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(50).default(10),
  source: z.enum(['all', 'faq', 'community']).optional(),
});

export const submitUnresolvedSchema = z.object({
  query:  z.string().min(1).max(500),
  faqId:  z.string().regex(/^[0-9a-fA-F]{24}$/).nullish(),
});

export const resolveUnresolvedSchema = z.object({
  resolution: z.enum(['faq_updated', 'community_post_created', 'dismissed']),
});

// ─── Moderation ────────────────────────────────────────────────────────────────
export const warnUserSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  reason: z.string().min(3).max(500),
});

export const suspendUserSchema = z.object({
  userId:   z.string().regex(/^[0-9a-fA-F]{24}$/),
  days:     z.coerce.number().int().min(1).max(365),
  reason:   z.string().min(3).max(500),
});

export const banUserSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  reason: z.string().min(3).max(500),
});

export const softDeleteSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/),
});

// ─── Reputation ────────────────────────────────────────────────────────────────
export const awardPointsSchema = z.object({
  userId:   z.string().regex(/^[0-9a-fA-F]{24}$/),
  delta:    z.number().int().min(-1000).max(1000),
  reason:   z.string().max(200).optional(),
});

export const issueBadgeSchema = z.object({
  userId:   z.string().regex(/^[0-9a-fA-F]{24}$/),
  badgeId:  z.string().regex(/^[0-9a-fA-F]{24}$/),
  reason:   z.string().max(200).optional(),
});

// ─── Helper ─────────────────────────────────────────────────────────────────────
/**
 * Parse a Zod schema and return 400 JSON response on failure.
 * Usage in controller:
 *   const body = await validate(req.body, createPostSchema, res);
 *   if (!body) return; // response already sent
 */
export async function validate<T extends z.ZodTypeAny>(
  data: unknown,
  schema: T,
  res: Response
): Promise<z.infer<T> | null> {
  try {
    return await schema.parseAsync(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        message: 'Validation error',
        errors: (err as z.ZodError).issues.map((e: z.ZodIssue) => ({ field: e.path.join('.'), message: e.message })),
      });
    } else {
      res.status(500).json({ message: 'Validation error' });
    }
    return null;
  }
}

// ─── Express middleware factory ─────────────────────────────────────────────────

import type { Request, RequestHandler } from 'express';

/**
 * Creates an Express middleware that validates req.body against a Zod schema.
 * Returns 400 with detailed errors on failure; passes to next() on success.
 *
 * Usage:
 *   router.post('/register', registerLimiter, validateBody(registerSchema), register);
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T): RequestHandler {
  return (req: Request, res: Response, next) => {
    schema
      .parseAsync(req.body)
      .then((body) => { req.body = body; next(); })
      .catch((err) => {
        if (err instanceof z.ZodError) {
          res.status(400).json({
            message: 'Validation error',
            errors: err.issues.map((e: z.ZodIssue) => ({ field: e.path.join('.'), message: e.message })),
          });
        } else {
          res.status(500).json({ message: 'Validation error' });
        }
      });
  };
}