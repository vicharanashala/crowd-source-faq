import { Router } from 'express';
import { login, register, getMe, getAllUsers, updateUserRole, deleteUser, updateProfile, changePassword, exportUserData, logout } from '../controllers/authController.js';
import { protect, authorize } from '../middleware/auth.js';
import { loginLimiter, registerLimiter, passwordChangeLimiter } from '../utils/auth/rateLimit.js';
import { validateBody, registerSchema, loginSchema, updateProfileSchema, changePasswordSchema } from '../utils/auth/validation.js';

const router = Router();

// POST /api/auth/register (Public) — rate-limited, validated
router.post('/register', registerLimiter, validateBody(registerSchema), register);

// POST /api/auth/login (Public) — rate-limited, validated
router.post('/login', loginLimiter, validateBody(loginSchema), login);


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
