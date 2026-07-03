import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env relative to the apps/backend directory regardless of execution context
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });
