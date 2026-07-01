import 'dotenv/config';
import connectDB from '../config/db.js';

console.log('Testing MongoDB connection...');
console.log('URI loaded:', !!process.env.MONGODB_URI);
try {
  await connectDB();
  console.log('✅ DB connected successfully!');
  process.exit(0);
} catch (e) {
  console.error('❌ DB connection failed:', (e as Error).message);
  process.exit(1);
}
