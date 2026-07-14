import DashboardMetric from './dashboard-metric.model.js';
import SearchLog from '../search/search-log.model.js';
import FAQ from '../faq/faq.model.js';
import User from '../auth/user.model.js';
import { Types } from 'mongoose';
import { logger } from '../../utils/http/logger.js';

export async function incrementSearchMetric(userId: string | null, batchId: string | null): Promise<void> {
  try {
    const dateStr = new Date().toISOString().split('T')[0];
    const bId = batchId ? new Types.ObjectId(batchId) : null;
    const uId = userId ? new Types.ObjectId(userId) : null;

    const update: any = { $inc: { searchesCount: 1 } };
    if (uId) {
      update.$addToSet = { uniqueUsers: uId };
    }

    await DashboardMetric.findOneAndUpdate(
      { date: dateStr, batchId: bId },
      update,
      { upsert: true, new: true }
    );
  } catch (err) {
    logger.warn(`[dashboard-metric] Failed to increment search metric: ${(err as Error).message}`);
  }
}

export async function incrementFaqMetric(batchId: string | null): Promise<void> {
  try {
    const dateStr = new Date().toISOString().split('T')[0];
    const bId = batchId ? new Types.ObjectId(batchId) : null;

    await DashboardMetric.findOneAndUpdate(
      { date: dateStr, batchId: bId },
      { $inc: { faqsCreatedCount: 1 } },
      { upsert: true, new: true }
    );
  } catch (err) {
    logger.warn(`[dashboard-metric] Failed to increment faq metric: ${(err as Error).message}`);
  }
}

export async function incrementUserMetric(): Promise<void> {
  try {
    const dateStr = new Date().toISOString().split('T')[0];

    await DashboardMetric.findOneAndUpdate(
      { date: dateStr, batchId: null },
      { $inc: { usersRegisteredCount: 1 } },
      { upsert: true, new: true }
    );
  } catch (err) {
    logger.warn(`[dashboard-metric] Failed to increment user metric: ${(err as Error).message}`);
  }
}

export async function backfillDashboardMetrics(): Promise<void> {
  try {
    const count = await DashboardMetric.countDocuments();
    if (count > 0) return;

    logger.info('[dashboard-metric] Empty metrics collection detected. Starting historical backfill...');

    // 1. Backfill from SearchLogs
    const searchLogs = await SearchLog.find({});
    for (const log of searchLogs) {
      const dateStr = new Date((log as any).createdAt || new Date()).toISOString().split('T')[0];
      const update: any = { $inc: { searchesCount: 1 } };
      if (log.userId) {
        update.$addToSet = { uniqueUsers: log.userId };
      }
      await DashboardMetric.findOneAndUpdate(
        { date: dateStr, batchId: log.batchId ?? null },
        update,
        { upsert: true }
      );
    }

    // 2. Backfill from FAQs
    const faqs = await FAQ.find({});
    for (const faq of faqs) {
      const dateStr = new Date(faq.createdAt || new Date()).toISOString().split('T')[0];
      await DashboardMetric.findOneAndUpdate(
        { date: dateStr, batchId: faq.batchId ?? null },
        { $inc: { faqsCreatedCount: 1 } },
        { upsert: true }
      );
    }

    // 3. Backfill from Users
    const users = await User.find({});
    for (const user of users) {
      const dateStr = new Date(user.createdAt || new Date()).toISOString().split('T')[0];
      await DashboardMetric.findOneAndUpdate(
        { date: dateStr, batchId: null },
        { $inc: { usersRegisteredCount: 1 } },
        { upsert: true }
      );
    }

    logger.info('[dashboard-metric] Historical backfill complete.');
  } catch (err) {
    logger.error(`[dashboard-metric] Historical backfill failed: ${(err as Error).message}`);
  }
}
