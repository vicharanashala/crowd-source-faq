import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const run = async () => {
  let mongod: MongoMemoryServer | null = null;
  let backendProcess: ChildProcess | null = null;
  let frontendProcess: ChildProcess | null = null;

  try {
    console.log('[Local Runner] Starting MongoDB Memory Server...');
    mongod = await MongoMemoryServer.create({
      instance: {
        dbName: 'yaksha_faq'
      }
    });
    const uri = mongod.getUri();
    console.log(`[Local Runner] MongoDB Memory Server started: ${uri}`);

    const env = {
      ...process.env,
      MONGODB_URI: uri,
      PORT: '6767',
      JWT_SECRET: 'supersecretjwtkeyforlocalrun32charslong',
      NODE_ENV: 'development',
    };

    console.log('[Local Runner] Seeding database...');
    const seedProcess = spawn('npx', ['tsx', 'src/scripts/seed.ts'], {
      cwd: path.join(rootDir, 'apps/backend'),
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

    console.log('[Local Runner] Starting Backend server (watch mode)...');
    backendProcess = spawn('npx', ['pnpm', '--filter', 'yaksha-faq-backend', 'run', 'dev'], {
      cwd: rootDir,
      env,
      stdio: 'inherit',
      shell: true,
    });

    console.log('[Local Runner] Starting Frontend server...');
    frontendProcess = spawn('npx', ['pnpm', '--filter', 'yaksha-faq-frontend', 'run', 'dev'], {
      cwd: rootDir,
      env,
      stdio: 'inherit',
      shell: true,
    });

    console.log('[Local Runner] Both servers are running! Press Ctrl+C to terminate.');

    // Keep running
    await new Promise(() => {});

  } catch (error) {
    console.error('[Local Runner] Error:', error);
  } finally {
    if (backendProcess) backendProcess.kill('SIGTERM');
    if (frontendProcess) frontendProcess.kill('SIGTERM');
    if (mongod) await mongod.stop();
  }
};

run().catch((err) => {
  console.error('[Local Runner] Critical error:', err);
});
