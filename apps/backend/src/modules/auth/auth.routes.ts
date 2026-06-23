import { Router } from 'express';
import { login, register, getMe, getAllUsers, updateUserRole, deleteUser, updateProfile, changePassword, exportUserData, logout, refresh } from './auth.controller.js';
import { protect, authorize } from '../../middleware/auth.js';
import { loginLimiter, registerLimiter, passwordChangeLimiter } from '../../utils/auth/rateLimit.js';
import { validateBody, registerSchema, loginSchema, updateProfileSchema, changePasswordSchema } from '../../utils/auth/validation.js';
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

// POST /api/auth/refresh (Public) — rotates access + refresh tokens
router.post('/refresh', refresh);

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

export default router;
