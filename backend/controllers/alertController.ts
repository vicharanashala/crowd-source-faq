import { Request, Response } from 'express';
import GlobalAlert from '../models/GlobalAlert.js';
import { httpLog } from '../utils/http/logger.js';

/**
 * alertController.ts
 * Feature: Predictive Friction Clusters
 * Author: Mayank Garg (gargmayank1805@gmail.com)
 * Description: Controller for serving and resolving global incident alerts.
 */

export const getActiveAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const alerts = await GlobalAlert.find({ isActive: true }).sort({ createdAt: -1 });
    res.json({ alerts });
  } catch (error) {
    httpLog.error('getActiveAlerts.error', { error: (error as Error).message });
    res.status(500).json({ message: 'Server error fetching alerts' });
  }
};

export const getAllAlertsAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const alerts = await GlobalAlert.find().sort({ createdAt: -1 }).populate('resolvedBy', 'name email');
    res.json({ alerts });
  } catch (error) {
    httpLog.error('getAllAlertsAdmin.error', { error: (error as Error).message });
    res.status(500).json({ message: 'Server error fetching alerts' });
  }
};

export const resolveAlert = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = (req as any).user?._id;

    const alert = await GlobalAlert.findById(id);
    if (!alert) {
      res.status(404).json({ message: 'Alert not found' });
      return;
    }

    alert.isActive = false;
    alert.resolvedAt = new Date();
    alert.resolvedBy = adminId || null;
    await alert.save();

    res.json({ message: 'Alert resolved successfully', alert });
  } catch (error) {
    httpLog.error('resolveAlert.error', { error: (error as Error).message });
    res.status(500).json({ message: 'Server error resolving alert' });
  }
};
