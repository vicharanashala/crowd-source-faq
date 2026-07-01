import { logger } from '../../utils/http/logger.js';

export interface CronJob {
  name: string;
  handler: () => Promise<unknown>;
  intervalMs: number;
  runOnStartup?: boolean;
  startupDelayMs?: number;
}

export class CronManager {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private jobs: CronJob[] = [];

  register(job: CronJob): void {
    this.jobs.push(job);
  }

  startAll(): void {
    for (const job of this.jobs) {
      // Setup the recurring interval
      const interval = setInterval(async () => {
        try {
          await job.handler();
        } catch (e: any) {
          logger.error(`[cronManager] Job "${job.name}" failed: ${e.message}`);
        }
      }, job.intervalMs);
      this.intervals.set(job.name, interval);

      // Startup execution if required
      if (job.runOnStartup) {
        if (job.startupDelayMs) {
          setTimeout(async () => {
            try {
              await job.handler();
            } catch (e: any) {
              logger.error(`[cronManager] Job "${job.name}" initial delayed run failed: ${e.message}`);
            }
          }, job.startupDelayMs);
        } else {
          // Run immediately (asynchronously)
          (async () => {
            try {
              await job.handler();
            } catch (e: any) {
              logger.error(`[cronManager] Job "${job.name}" initial immediate run failed: ${e.message}`);
            }
          })();
        }
      }
    }
  }

  stopAll(): void {
    for (const [name, interval] of this.intervals.entries()) {
      clearInterval(interval);
    }
    this.intervals.clear();
    logger.info('[cronManager] All cron intervals cleared.');
  }
}

export const cronManager = new CronManager();
