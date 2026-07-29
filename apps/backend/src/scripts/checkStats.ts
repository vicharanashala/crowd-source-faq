import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
  const uri = process.env.MONGODB_URI as string;
  const dbUri = uri.endsWith('/') ? uri + 'csfaq' : uri + '/csfaq';
  await mongoose.connect(dbUri);
  
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  
  const johns = await User.find({ name: /john/i });
  console.log('John Doe users:', johns.map(u => u.get('email')));

  mongoose.disconnect();
}
run();
