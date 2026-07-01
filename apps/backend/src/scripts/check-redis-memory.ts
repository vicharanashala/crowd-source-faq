import dotenv from 'dotenv';
import IoRedis from 'ioredis';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  const redisUrl = process.env.REDIS_TCP_URL || 'redis://127.0.0.1:6379';
  console.log(`Connecting to Redis at: ${redisUrl}`);

  const IoRedisClass = (IoRedis as any).default || IoRedis;
  const client = new IoRedisClass(redisUrl);

  client.on('error', (err: any) => {
    console.error('Redis Connection Error:', err.message);
  });

  try {
    // Ping to check if alive
    const pingRes = await client.ping();
    console.log(`Redis Ping Response: ${pingRes}`);

    // Fetch memory info
    const infoStr = await client.info('memory');
    const dbSize = await client.dbsize();

    console.log('\n--- Redis Database Info ---');
    console.log(`Total cached keys: ${dbSize}`);

    console.log('\n--- Redis Memory Usage ---');
    // Parse info memory output
    const lines = infoStr.split('\r\n');
    const memoryDetails: Record<string, string> = {};
    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const parts = line.split(':');
        if (parts.length === 2) {
          memoryDetails[parts[0]] = parts[1];
        }
      }
    }

    const keyMetrics = [
      { key: 'used_memory_human', label: 'Used Memory (Total)' },
      { key: 'used_memory_rss_human', label: 'Used Memory (RSS)' },
      { key: 'used_memory_peak_human', label: 'Peak Used Memory' },
      { key: 'used_memory_lua_human', label: 'Used Memory (Lua Engine)' },
      { key: 'maxmemory_human', label: 'Max Memory Limit' },
      { key: 'mem_fragmentation_ratio', label: 'Memory Fragmentation Ratio' }
    ];

    for (const metric of keyMetrics) {
      if (memoryDetails[metric.key]) {
        console.log(`${metric.label}: ${memoryDetails[metric.key]}`);
      }
    }

    console.log('\n--- Full Memory Details ---');
    for (const [key, val] of Object.entries(memoryDetails)) {
      console.log(`  ${key}: ${val}`);
    }

  } catch (err: any) {
    console.error('Failed to query Redis:', err.message);
  } finally {
    await client.quit();
  }
}

main().catch(err => {
  console.error('Error running script:', err);
});
