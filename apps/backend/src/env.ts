import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env relative to the apps/backend directory regardless of execution context
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const localEnvPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(localEnvPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(localEnvPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}
