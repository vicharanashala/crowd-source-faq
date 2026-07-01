import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

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

  try {
    console.log('[E2E Orchestrator] Starting MongoDB Memory Server...');
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    console.log(`[E2E Orchestrator] MongoDB Memory Server started: ${uri}`);

    // Set Environment Variables for Backend
    const env = {
      ...process.env,
      MONGODB_URI: uri,
      PORT: '6767',
      JWT_SECRET: 'supersecretjwtkeyforintegrationtests32charslong',
      CLOUDINARY_CLOUD_NAME: 'test_cloud',
      CLOUDINARY_API_KEY: 'test_key',
      CLOUDINARY_API_SECRET: 'test_secret',
      ZOOM_CLIENT_ID: 'test_zoom_client',
      ZOOM_CLIENT_SECRET: 'test_zoom_secret',
      ZOOM_REDIRECT_URI: 'http://localhost:5173/zoom/callback',
      ZOOM_WEBHOOK_SECRET_TOKEN: 'test_zoom_webhook_secret',
      NODE_ENV: 'test',
    };

    console.log('[E2E Orchestrator] Seeding database...');
    const seedProcess = spawn('npx', ['tsx', 'src/scripts/seed.ts'], {
      cwd: path.join(rootDir, 'apps/backend'),
      env,
      stdio: 'inherit',
      shell: true,
    });

    await new Promise<void>((resolve, reject) => {
      seedProcess.on('exit', (code) => {
        if (code === 0) {
          console.log('[E2E Orchestrator] Database seeding complete.');
          resolve();
        } else {
          reject(new Error(`Seeding failed with code ${code}`));
        }
      });
    });

    console.log('[E2E Orchestrator] Starting Backend server...');
    backendProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      cwd: path.join(rootDir, 'apps/backend'),
      env,
      stdio: 'inherit',
      shell: true,
    });

    console.log('[E2E Orchestrator] Starting Frontend server...');
    frontendProcess = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5173'], {
      cwd: path.join(rootDir, 'apps/frontend'),
      stdio: 'inherit',
      shell: true,
    });

    console.log('[E2E Orchestrator] Waiting for Backend to be ready...');
    await waitForPort(6767);
    console.log('[E2E Orchestrator] Backend is ready!');

    console.log('[E2E Orchestrator] Waiting for Frontend to be ready...');
    await waitForPort(5173);
    console.log('[E2E Orchestrator] Frontend is ready!');

    console.log('[E2E Orchestrator] Running Playwright E2E Tests...');

    // Install playwright browsers if not installed
    const installPlaywright = spawn('npx', ['playwright', 'install', 'chromium'], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true,
    });

    await new Promise<void>((resolve, reject) => {
      installPlaywright.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Playwright install failed with code ${code}`));
      });
    });

    const playwrightTest = spawn('npx', ['playwright', 'test'], {
      cwd: rootDir,
      env,
      stdio: 'inherit',
      shell: true,
    });

    const exitCode = await new Promise<number>((resolve) => {
      playwrightTest.on('exit', (code) => {
        resolve(code ?? 1);
      });
    });

    console.log(`[E2E Orchestrator] Playwright exited with code ${exitCode}`);
    process.exitCode = exitCode;

  } catch (error) {
    console.error('[E2E Orchestrator] Error during test orchestration:', error);
    process.exitCode = 1;
  } finally {
    console.log('[E2E Orchestrator] Cleaning up servers and resources...');

    if (backendProcess) {
      console.log('[E2E Orchestrator] Terminating Backend process...');
      backendProcess.kill('SIGTERM');
    }
    if (frontendProcess) {
      console.log('[E2E Orchestrator] Terminating Frontend process...');
      frontendProcess.kill('SIGTERM');
    }
    if (mongod) {
      console.log('[E2E Orchestrator] Stopping MongoDB Memory Server...');
      await mongod.stop();
    }
    console.log('[E2E Orchestrator] Cleanup complete.');
  }
};

run().catch((err) => {
  console.error('[E2E Orchestrator] Critical runner error:', err);
  process.exit(1);
});
