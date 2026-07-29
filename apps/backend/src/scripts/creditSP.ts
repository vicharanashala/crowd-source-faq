import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
  const uri = process.env.MONGODB_URI as string;
  const dbUri = uri.endsWith('/') ? uri + 'test' : uri; // Backend usually uses 'test' if unspecified
  await mongoose.connect(dbUri);
  
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  
  // Find John Doe and award him +5 SP for testing
  const john = await User.findOneAndUpdate(
    { email: 'john@example.com' }, 
    { $inc: { sp: 5, points: 5 } }, 
    { new: true }
  );

  console.log('John Doe updated:', john);

  mongoose.disconnect();
}
run();
