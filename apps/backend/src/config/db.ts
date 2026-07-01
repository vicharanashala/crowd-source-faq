// Import Mongoose to interact with MongoDB
import dns from 'node:dns';
import mongoose, { Connection } from 'mongoose';
import { dbLog } from '../utils/http/logger.js';

// Cache connection in serverless environment
let cachedConnection: Connection | null = null;

/**
 * Ensure Node's DNS resolver can actually answer SRV queries before we try a
 * `mongodb+srv://` connection.
 *
 * On some Windows / VPN setups Node (c-ares) ends up with a useless resolver —
 * e.g. `127.0.0.1` (nothing listening there) or an IPv6 link-local server
 * (`fe80::…`, which c-ares can't query) — so the Atlas SRV lookup fails with
 * `querySrv ECONNREFUSED` even though the system resolver works fine. We detect
 * that and fall back to public DNS. Override with `DNS_SERVERS=8.8.8.8,1.1.1.1`.
 */
function ensureUsableDnsServers(): void {
  const override = (process.env.DNS_SERVERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (override.length > 0) {
    try {
      dns.setServers(override);
      dbLog.info('DNS servers set from DNS_SERVERS', { servers: override });
    } catch (err) {
      dbLog.alert('failed to apply DNS_SERVERS override', { message: (err as Error).message });
    }
    return;
  }

  let current: string[] = [];
  try {
    current = dns.getServers();
  } catch {
    /* getServers can throw on odd platforms — treat as "unknown / broken" */
  }

  const isUnusable = (s: string): boolean =>
    s.startsWith('127.') || s === '::1' || s.toLowerCase().startsWith('fe80');

  const broken = current.length === 0 || current.every(isUnusable);
  if (broken) {
    const fallback = ['8.8.8.8', '1.1.1.1'];
    try {
      dns.setServers(fallback);
      dbLog.info('DNS resolver looked unusable for SRV — switched to public DNS', {
        previous: current,
        now: fallback,
      });
    } catch (err) {
      dbLog.alert('failed to set fallback DNS servers', { message: (err as Error).message });
    }
  }
}

// v1.67 — Wire mongoose's connection event listeners so we get
// DISCORD-pinging ALERTS on disconnect / reconnection, not just
// console.error noise. `connected` and `disconnected` are
// lifecycle events; `error` is for protocol-level failures.
mongoose.connection.on('connected', () => {
  dbLog.info('connection established', { host: mongoose.connection.host });
});
mongoose.connection.on('disconnected', () => {
  dbLog.alert('disconnected', {
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
  });
});
mongoose.connection.on('reconnected', () => {
  dbLog.info('reconnected', { host: mongoose.connection.host });
});
mongoose.connection.on('error', (err: Error) => {
  dbLog.alert('connection error', { message: err.message });
});

// Async function to handle the database connection
const connectDB = async (): Promise<Connection> => {
  if (cachedConnection) {
    return cachedConnection;
  }

  if (!process.env.MONGODB_URI) {
    dbLog.alert('MONGODB_URI missing at startup', { nodeEnv: process.env.NODE_ENV });
    throw new Error('MONGODB_URI environment variable is missing');
  }

  // Fix a broken DNS resolver before the mongodb+srv SRV lookup runs.
  ensureUsableDnsServers();

  try {
    // Connect using the URI from environment variables with a 5-second timeout
    cachedConnection = (await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    })).connection;

    dbLog.info('connected at startup', { host: cachedConnection.host });
    return cachedConnection;
  } catch (error) {
    const err = error as Error;
    dbLog.alert('connection failed at startup', { message: err.message });
    throw error;
  }
};

// Export the function to be called in your main server file (e.g., server.js or index.js)
export default connectDB;