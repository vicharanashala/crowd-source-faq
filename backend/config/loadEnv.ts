import dotenv from 'dotenv';

// Load environment variables (.env + .env.local overrides)
dotenv.config();
dotenv.config({ path: '.env.local' });
