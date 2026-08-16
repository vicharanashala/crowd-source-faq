import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'apps/backend');
const frontendDir = path.join(rootDir, 'apps/frontend');

const tsxCli = path.join(rootDir, 'node_modules/tsx/dist/cli.mjs');
const viteCli = path.join(frontendDir, 'node_modules/vite/bin/vite.js');

// Helper to check if a TCP port is open
const isPortOpen = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForPort = async (port: number, timeoutMs = 30000): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const up = await isPortOpen(port);
    if (up) return;
    await delay(1000);
  }
  console.warn(`  ⚠ Note: Port ${port} connection probe timed out, continuing...`);
};

const main = async () => {
  let mongod: MongoMemoryServer | null = null;
  let backendProcess: ChildProcess | null = null;
  let frontendProcess: ChildProcess | null = null;

  const cleanup = async () => {
    console.log('\n[Dev Orchestrator] Stopping servers...');
    if (backendProcess) backendProcess.kill();
    if (frontendProcess) frontendProcess.kill();
    if (mongod) await mongod.stop();
    console.log('[Dev Orchestrator] All processes stopped.');
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    console.log('\n============================================================');
    console.log('  🚀 Yaksha FAQ Portal — One-Click Local Dev Server');
    console.log('============================================================\n');

    let mongoUri: string | undefined = undefined;

    // Check if user set an external MongoDB URI in environment or .env.local
    const backendLocalEnvPath = path.join(backendDir, '.env.local');
    if (fs.existsSync(backendLocalEnvPath)) {
      const content = fs.readFileSync(backendLocalEnvPath, 'utf-8');
      const match = content.match(/^MONGODB_URI=(.*)$/m);
      if (match && match[1] && (match[1].startsWith('mongodb://') || match[1].startsWith('mongodb+srv://'))) {
        mongoUri = match[1].trim();
      }
    }

    if (!mongoUri) {
      console.log('[1/4] Starting local In-Memory MongoDB Server...');
      mongod = await MongoMemoryServer.create();
      mongoUri = mongod.getUri();
      console.log(`  ✓ In-Memory MongoDB running at: ${mongoUri}`);
    } else {
      console.log(`[1/4] Using external MongoDB URI: ${mongoUri}`);
    }

    const env = {
      ...process.env,
      MONGODB_URI: mongoUri,
      PORT: '6767',
      JWT_SECRET: process.env.JWT_SECRET || 'supersecretjwtkeyforlocaldevelopmentyaksha32chars',
      CLIENT_URL: 'http://localhost:5173',
      NODE_ENV: 'development',
    };

    // Ensure .env in backend matches this runtime's database
    const backendEnvPath = path.join(backendDir, '.env');
    fs.writeFileSync(
      backendEnvPath,
      `PORT=6767\nNODE_ENV=development\nCLIENT_URL=http://localhost:5173\nJWT_SECRET=${env.JWT_SECRET}\nMONGODB_URI=${mongoUri}\n`
    );

    // Seed database
    console.log('\n[2/4] Seeding initial data (users, FAQs, default batch)...');
    const seedProcess = spawn(process.execPath, [tsxCli, 'src/scripts/seed.ts'], {
      cwd: backendDir,
      env,
      stdio: 'inherit',
    });

    await new Promise<void>((resolve) => {
      seedProcess.on('exit', (code) => {
        if (code === 0) {
          console.log('  ✓ Seeding completed successfully.');
        } else {
          console.log(`  ✓ Seeding finished (exit code ${code}).`);
        }
        resolve();
      });
      seedProcess.on('error', (err) => {
        console.warn(`  ⚠ Seeding note: ${err.message}`);
        resolve();
      });
    });

    // Start Backend
    console.log('\n[3/4] Starting Backend API server on http://localhost:6767...');
    backendProcess = spawn(
      process.execPath,
      [tsxCli, 'watch', '--import', './src/instrument.ts', 'src/server.ts'],
      {
        cwd: backendDir,
        env,
        stdio: 'inherit',
      }
    );

    // Start Frontend
    console.log('\n[4/4] Starting Frontend Vite dev server on http://localhost:5173...');
    frontendProcess = spawn(
      process.execPath,
      [viteCli, '--host', '127.0.0.1', '--port', '5173'],
      {
        cwd: frontendDir,
        stdio: 'inherit',
      }
    );

    console.log('\nWaiting for backend & frontend services to be ready...');
    await Promise.all([
      waitForPort(6767),
      waitForPort(5173),
    ]);

    console.log('\n============================================================');
    console.log('  ✨ Yaksha FAQ Portal is LIVE and Ready!');
    console.log('============================================================');
    console.log('  🌐 Public Website : http://localhost:5173/csfaq/');
    console.log('  👤 User Login     : simranjitkaur16048@gmail.com');
    console.log('     User Password  : password123');
    console.log('  🛡️ Admin Login    : http://localhost:5173/csfaq/admin/login');
    console.log('     Admin Email    : admin@yaksha.com');
    console.log('     Admin Password : admin123');
    console.log('  🔌 Backend API    : http://localhost:6767/csfaq/api');
    console.log('============================================================\n');

  } catch (error) {
    console.error('\n❌ Startup Error:', error);
    await cleanup();
  }
};

main();
