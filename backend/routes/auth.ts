import { Router } from 'express';
import { login, register, getMe, getAllUsers, updateUserRole, deleteUser, updateProfile, changePassword, exportUserData } from '../controllers/authController.js';
import { protect, authorize } from '../middleware/auth.js';
import { loginLimiter, registerLimiter, passwordChangeLimiter } from '../utils/rateLimit.js';

const router = Router();

// POST /api/auth/register (Public) — rate-limited
router.post('/register', registerLimiter, register);

// POST /api/auth/login (Public) — rate-limited
router.post('/login', loginLimiter, login);

// GET /api/auth/me (Protected)
// Uses the 'protect' middleware to verify the token before fetching the user's profile
router.get('/me', protect, getMe);

// GET /api/auth/export (Protected)
// Exports the authenticated user's data as a JSON file
router.get('/export', protect, exportUserData);

// PATCH /api/auth/profile (Protected)
// Updates the authenticated user's own name and/or email
router.patch('/profile', protect, updateProfile);

// PUT /api/auth/password (Protected) — rate-limited
router.put('/password', protect, passwordChangeLimiter, changePassword);

// GET /api/auth/users (Protected: Admin only)
router.get('/users', protect, authorize('admin'), getAllUsers);

// PATCH /api/auth/users/:id/role (Protected: Admin only)
router.patch('/users/:id/role', protect, authorize('admin'), updateUserRole);

// DELETE /api/auth/users/:id (Protected: Admin only)
router.delete('/users/:id', protect, authorize('admin'), deleteUser);

export default router;
