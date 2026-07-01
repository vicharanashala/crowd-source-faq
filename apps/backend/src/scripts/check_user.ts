import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../modules/auth/user.model.js';
import bcrypt from 'bcryptjs';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  const user = await User.findOne({email: 'admin@yaksha.com'}).select('+password') as any;
  if (!user) { console.log('NO USER FOUND'); process.exit(0); }
  console.log('password hash:', user.password);
  console.log('bcrypt admin123:', await bcrypt.compare('admin123', user.password));
  console.log('bcrypt password123:', await bcrypt.compare('password123', user.password));
  await mongoose.disconnect();
})();