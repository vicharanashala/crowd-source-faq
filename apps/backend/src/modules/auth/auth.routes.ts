import { Router } from 'express';
import { login, register, getMe, getAllUsers, updateUserRole, deleteUser, updateProfile, changePassword, exportUserData, logout, refresh, adminResetUserPassword } from './auth.controller.js';
import { protect, authorize } from '../../middleware/auth.js';
import { loginLimiter, registerLimiter, passwordChangeLimiter, refreshLimiter } from '../../utils/auth/rateLimit.js';
import { validateBody, refreshSchema, registerSchema, loginSchema, updateProfileSchema, changePasswordSchema, adminResetPasswordSchema } from '../../utils/auth/validation.js';
// v1.70 — Controlled-registration gate. Mounted BEFORE validateBody so
// closed/invalid-token requests 403 before the Zod schema runs.
import { registrationGate } from '../../utils/auth/registrationGate.js';
// v1.7x — Public registration-status endpoint (no auth, no rate limit
// because it's a single tiny read; the AuthModal calls it on mount of
// the register tab to render the right copy).
import { publicGetRegistrationStatus } from '../program/registration-control.controller.js';

const router = Router();

// POST /api/auth/register (Public) — rate-limited, gated, validated
router.post('/register', registerLimiter, registrationGate, validateBody(registerSchema), register);

// GET /api/auth/registration-status (Public) — used by the AuthModal
// to render "closed / invite required / open" copy without forcing the
// user to submit and discover via a 403. Returns only `enabled` +
// `openForAll` — never the invite token or link.
router.get('/registration-status', publicGetRegistrationStatus);

// POST /api/auth/login (Public) — rate-limited, validated
router.post('/login', loginLimiter, validateBody(loginSchema), login);

// POST /api/auth/refresh (Public) — rotates access + refresh tokens.
// H4-1 (HIGH) fix: previously this route had no rate limiter. The
// refresh endpoint is the natural target for token-reuse brute force
// attacks — an attacker who has extracted an old refresh token can
// fire it repeatedly. Apply `refreshLimiter` (5/min per identity).
// H4-2 (HIGH) fix: previously `req.body.refreshToken` was read raw
// with no Zod validation — unbounded length means a 10MB string
// can hit `jwt.verify`. Add `validateBody(refreshSchema)` to enforce
// `min(20).max(2048)` length. (Schema added in validation.ts below.)
router.post('/refresh', refreshLimiter, validateBody(refreshSchema), refresh);

// POST /api/auth/logout (Protected) — revokes the JWT carried by the request
router.post('/logout', protect, logout);

// GET /api/auth/me (Protected)
// Uses the 'protect' middleware to verify the token before fetching the user's profile
router.get('/me', protect, getMe);

// GET /api/auth/export (Protected)
// Exports the authenticated user's data as a JSON file
router.get('/export', protect, exportUserData);

// PATCH /api/auth/profile (Protected)
// Updates the authenticated user's own name and/or email
router.patch('/profile', protect, validateBody(updateProfileSchema), updateProfile);

// PUT /api/auth/password (Protected) — rate-limited, validated
router.put('/password', protect, passwordChangeLimiter, validateBody(changePasswordSchema), changePassword);

// GET /api/auth/users (Protected: Admin only)
router.get('/users', protect, authorize('admin'), getAllUsers);

// PATCH /api/auth/users/:id/role (Protected: Admin only)
router.patch('/users/:id/role', protect, authorize('admin'), updateUserRole);

// DELETE /api/auth/users/:id (Protected: Admin only)
router.delete('/users/:id', protect, authorize('admin'), deleteUser);

// PUT /api/auth/users/:id/password (Protected: Admin only) — v1.85.
// Admin-initiated password reset. Rate-limited via the same
// passwordChangeLimiter bucket as the user-self-change path so
// a runaway admin script can't hammer the bcryptjs pre-save hook
// (12 rounds × N requests is a real cost). Validated via
// adminResetPasswordSchema (same passwordPolicy as user-self).
// The handler itself enforces the hard floor that admins cannot
// be reset by other admins — see auth.controller.ts.
router.put(
  '/users/:id/password',
  protect,
  authorize('admin'),
  passwordChangeLimiter,
  validateBody(adminResetPasswordSchema),
  adminResetUserPassword,
);

export default router;
