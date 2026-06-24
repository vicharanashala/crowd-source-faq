import express from 'express';
import { getActiveAlerts, getAllAlertsAdmin, resolveAlert } from '../controllers/alertController.js';
import { protect, authorize } from '../middleware/auth.js';

/**
 * alerts.ts
 * Feature: Predictive Friction Clusters
 * Author: Mayank Garg (gargmayank1805@gmail.com)
 * Description: Express routes for active and admin-level friction alerts.
 */

const router = express.Router();

// Public: Get active alerts to show on the banner
router.get('/active', getActiveAlerts);

// Admin: Get all alerts history
router.get('/admin', protect, authorize('admin'), getAllAlertsAdmin);

// Admin: Resolve an alert
router.put('/admin/:id/resolve', protect, authorize('admin'), resolveAlert);

export default router;
