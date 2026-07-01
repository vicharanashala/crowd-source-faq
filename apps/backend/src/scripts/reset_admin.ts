import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../modules/auth/user.model.js';
import bcrypt from 'bcryptjs';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  const user = await User.findOne({email: 'admin@yaksha.com'}) as any;
  if (!user) { console.log('NO USER FOUND'); process.exit(0); }
  // Force re-hash the password
  user.password = 'admin123';
  await user.save();
  console.log('Password reset for admin@yaksha.com');
  const reloaded = await User.findOne({email: 'admin@yaksha.com'}).select('+password') as any;
  console.log('new hash:', reloaded.password);
  console.log('verify admin123:', await bcrypt.compare('admin123', reloaded.password));
  await mongoose.disconnect();
})();