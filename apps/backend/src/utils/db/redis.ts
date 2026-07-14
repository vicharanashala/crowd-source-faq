import { Redis } from 'ioredis';
import { loadConfig } from '../../config/loader.js';
import { logger } from '../http/logger.js';

let redisClient: Redis | null = null;

try {
  const config = loadConfig();
  const redisUrl = config.redis.tcpUrl || config.redis.url;
  if (redisUrl) {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      reconnectOnError: () => false,
    });
    redisClient.on('error', (err) => {
      // Log connection warning but do not crash the server
      logger.warn(`[redis] connection error: ${err.message}`);
    });
  }
} catch (e) {
  logger.warn(`[redis] initialization failed: ${(e as Error).message}`);
}

export default redisClient;
