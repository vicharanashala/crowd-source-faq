import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Helper to check if a port is open
const pingServer = (port: number, pathName = '/'): Promise<boolean> => {
  return new Promise((resolve) => {
    const req = http.get({
      host: '127.0.0.1',
      port,
      path: pathName,
      timeout: 1000,
    }, (res) => {
      resolve(true);
      res.resume();
    });
    req.on('error', () => {
      resolve(false);
    });
  });
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForPort = async (port: number, pathName = '/', timeoutMs = 60000): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const up = await pingServer(port, pathName);
    if (up) return;
    await delay(1000);
  }
  throw new Error(`Timeout waiting for port ${port}`);
};

const run = async () => {
  let mongod: MongoMemoryServer | null = null;
  let backendProcess: ChildProcess | null = null;
  let frontendProcess: ChildProcess | null = null;

  const cleanup = async () => {
    console.log('\n[Local Runner] Cleaning up servers and resources...');
    if (backendProcess) {
      console.log('[Local Runner] Terminating Backend process...');
      backendProcess.kill('SIGTERM');
    }
    if (frontendProcess) {
      console.log('[Local Runner] Terminating Frontend process...');
      frontendProcess.kill('SIGTERM');
    }
    if (mongod) {
      console.log('[Local Runner] Stopping MongoDB Memory Server...');
      await mongod.stop();
    }
    console.log('[Local Runner] Cleanup complete. Goodbye!');
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    console.log('[Local Runner] Starting MongoDB Memory Server...');
    mongod = await MongoMemoryServer.create({
      binary: {
        version: '6.0.14',
      },
    });
    const uri = mongod.getUri();
    console.log(`[Local Runner] MongoDB Memory Server started: ${uri}`);

    // Load backend .env and .env.local if present
    const loadedEnv: Record<string, string> = {};
    const parseEnv = (filePath: string) => {
      try {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          content.split(/\r?\n/).forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
              const idx = trimmed.indexOf('=');
              if (idx !== -1) {
                const key = trimmed.substring(0, idx).trim();
                const val = trimmed.substring(idx + 1).trim().replace(/^['"]|['"]$/g, '');
                if (key) loadedEnv[key] = val;
              }
            }
          });
        }
      } catch (err) {
        // ignore
      }
    };
    parseEnv(path.join(rootDir, 'backend', '.env'));
    parseEnv(path.join(rootDir, 'backend', '.env.local'));

    // Set Environment Variables for Backend
    const env = {
      ...process.env,
      ...loadedEnv,
      MONGODB_URI: uri,
      PORT: '6767',
      JWT_SECRET: 'supersecretjwtkeyforlocalrun32charslong',
      CLOUDINARY_CLOUD_NAME: 'test_cloud',
      CLOUDINARY_API_KEY: 'test_key',
      CLOUDINARY_API_SECRET: 'test_secret',
      ZOOM_CLIENT_ID: 'test_zoom_client',
      ZOOM_CLIENT_SECRET: 'test_zoom_secret',
      ZOOM_REDIRECT_URI: 'http://localhost:5173/zoom/callback',
      ZOOM_WEBHOOK_SECRET_TOKEN: 'test_zoom_webhook_secret',
      NODE_ENV: 'development',
    };

    console.log('[Local Runner] Seeding database...');
    const seedProcess = spawn('npx', ['tsx', 'backend/scripts/seed.ts'], {
      cwd: rootDir,
      env,
      stdio: 'inherit',
      shell: true,
    });

    await new Promise<void>((resolve, reject) => {
      seedProcess.on('exit', (code) => {
        if (code === 0) {
          console.log('[Local Runner] Database seeding complete.');
          resolve();
        } else {
          reject(new Error(`Seeding failed with code ${code}`));
        }
      });
    });

    console.log('[Local Runner] Starting Backend server...');
    backendProcess = spawn('npx', ['tsx', 'backend/server.ts'], {
      cwd: rootDir,
      env,
      stdio: 'inherit',
      shell: true,
    });

    console.log('[Local Runner] Starting Frontend server...');
    frontendProcess = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5173'], {
      cwd: path.join(rootDir, 'frontend'),
      stdio: 'inherit',
      shell: true,
    });

    console.log('[Local Runner] Waiting for Backend to be ready...');
    await waitForPort(6767, '/api/health');
    console.log('[Local Runner] Backend is ready on http://localhost:6767');

    console.log('[Local Runner] Waiting for Frontend to be ready...');
    await waitForPort(5173);
    console.log('\n==================================================');
    console.log('🎉 Shamagama (Yaksha FAQ Portal) is now running!');
    console.log('👉 Access it here: http://localhost:5173');
    console.log('==================================================\n');

    // Keep the process alive
    while (true) {
      await delay(1000);
    }

  } catch (error) {
    console.error('[Local Runner] Error during orchestration:', error);
    await cleanup();
  }
};

run().catch((err) => {
  console.error('[Local Runner] Critical runner error:', err);
  process.exit(1);
});
