/**
 * server-boot.test.ts — M7 boot-boundary contract.
 *
 * validateEnv() no longer calls process.exit(1) itself; it throws a typed
 * EnvValidationError that server.ts catches at the boot boundary. This
 * smoke test proves the user-visible contract is preserved: booting the
 * real server with an invalid environment still terminates the process
 * with exit code 1 and logs every validation failure.
 *
 * Runs the actual entrypoint (src/server.ts) in a child process via tsx,
 * so nothing about the boot path is mocked.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const TSX_BIN = path.join(BACKEND_ROOT, 'node_modules', '.bin', 'tsx');
const SERVER_ENTRY = path.join(BACKEND_ROOT, 'src', 'server.ts');

interface BootResult {
  code: number;
  output: string;
}

function bootServer(env: NodeJS.ProcessEnv): Promise<BootResult> {
  return new Promise((resolve, reject) => {
    execFile(
      TSX_BIN,
      [SERVER_ENTRY],
      { env, cwd: BACKEND_ROOT, timeout: 30_000 },
      (error, stdout, stderr) => {
        const output = `${stdout}\n${stderr}`;
        if (!error) {
          resolve({ code: 0, output });
          return;
        }
        // execFile reports any non-zero exit as an "error". Distinguish
        // the outcomes we care about explicitly:
        //  - killed/timeout → the boot never terminated: fail loudly.
        //  - string code (e.g. 'ENOENT') → spawn failure, not an exit
        //    code: fail loudly with the real cause.
        //  - numeric code → the child exited; that's the value under test.
        if (error.killed || error.signal) {
          reject(new Error(`server boot timed out or was killed (signal: ${error.signal ?? 'none'})\n${output}`));
          return;
        }
        if (typeof error.code !== 'number') {
          reject(new Error(`failed to spawn server process (${String(error.code)}): ${error.message}`));
          return;
        }
        resolve({ code: error.code, output });
      },
    );
  });
}

describe('server boot boundary — invalid env still prevents startup (M7)', () => {
  beforeAll(() => {
    // Fail with a clear message if the tsx binary is missing, instead of
    // a confusing output-assertion failure inside the test itself.
    if (!existsSync(TSX_BIN)) {
      throw new Error(`tsx binary not found at ${TSX_BIN} — run pnpm install first`);
    }
  });

  it('exits with code 1 and logs each validation error when required vars are missing', async () => {
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test' };
    delete env.MONGODB_URI;
    delete env.JWT_SECRET;

    const { code, output } = await bootServer(env);

    expect(code).toBe(1);
    expect(output).toContain('Environment validation failed:');
    expect(output).toContain('MONGODB_URI is required');
    expect(output).toContain('JWT_SECRET is required');
  }, 60_000);
});
