/**
 * seedAdmin — one-time idempotent bootstrap for the canonical admin account.
 *
 * The shared `seed.ts` deliberately avoids overwriting the password of
 * pre-existing users (a safety check so re-running the seed doesn't
 * invalidate every seeded account). That means `admin@yaksha.com` could
 * be created on an earlier run with a wrong/unknown password, and the
 * shared seed won't repair it. This script's only job is to guarantee
 * that admin@yaksha.com / admin123 is reachable. Idempotent.
 *
 * Run: npx tsx src/scripts/seedAdmin.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../modules/auth/user.model.js';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not set in .env');
  process.exit(1);
}

const ADMIN_EMAIL = 'admin@yaksha.com';
const ADMIN_PASSWORD = 'admin123';
const ADMIN_NAME = 'Admin User';
const ADMIN_ROLE = 'admin';

async function main(): Promise<void> {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);

    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (!existing) {
      const created = await User.create({
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        role: ADMIN_ROLE,
        password: ADMIN_PASSWORD, // pre-save hook will bcrypt-hash
      });
      console.log(`✓ Created admin ${ADMIN_EMAIL} (${created._id})`);
    } else {
      // Force-reset the password and role/name on every run so this
      // script is a true idempotent reset. The shared seed's safety
      // check is preserved by `seed.ts`; this file is the explicit
      // admin bootstrap and is allowed (and expected) to overwrite.
      existing.name = ADMIN_NAME;
      existing.role = ADMIN_ROLE as 'admin';
      existing.password = ADMIN_PASSWORD;
      await existing.save();
      console.log(`✓ Reset admin ${ADMIN_EMAIL} (${existing._id})`);
    }

    console.log('Admin seed complete.');
    process.exit(0);
  } catch (err) {
    console.error('seedAdmin error:', err);
    process.exit(1);
  }
}

main();