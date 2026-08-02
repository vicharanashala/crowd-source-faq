/**
 * createUser.ts — seed a user directly into MongoDB.
 *
 * Usage (from apps/backend):
 *   npx tsx --env-file=.env src/scripts/createUser.ts
 *   npx tsx --env-file=.env src/scripts/createUser.ts --name="Jane Doe" --email="jane@example.com" --password="Secret@123" --role=user
 *
 * Flags (all optional — falls back to defaults below):
 *   --name      Display name
 *   --email     Email address (must be unique)
 *   --password  Plain-text password (bcrypt-hashed before save)
 *   --role      user | moderator | admin | expert   (default: user)
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../modules/auth/user.model.js';

// ── Parse CLI args (--key=value or --key value) ──────────────────────────────
function arg(name: string, fallback: string): string {
  const flag = `--${name}`;
  for (let i = 0; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
    if (a === flag && process.argv[i + 1]) return process.argv[i + 1];
  }
  return fallback;
}

// ── ✏️  Default values (used when no CLI flags are passed) ───────────────────
const name     = arg('name',     'Pritam Dev');
const email    = arg('email',    'pritam@example.com');
const password = arg('password', 'Admin@123');
const role     = arg('role',     'admin') as 'user' | 'moderator' | 'admin' | 'expert';
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌  MONGODB_URI is not set. Make sure .env is loaded.');
    process.exit(1);
  }

  console.log('🔌  Connecting to MongoDB…');
  await mongoose.connect(uri);
  console.log('✅  Connected\n');

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.log(`⚠️   User with email "${email}" already exists (_id: ${existing._id}).`);
    console.log('     Use a different --email to create another user.\n');
    await mongoose.disconnect();
    process.exit(0);
  }

  const user = new User({
    name,
    email: email.toLowerCase(),
    password,   // pre-save hook bcrypt-hashes this
    role,
    isBanned:  false,
    isDeleted: false,
    sp:        100,
  });

  await user.save();

  console.log('🎉  User created successfully!');
  console.log('────────────────────────────────');
  console.log(`  _id   : ${user._id}`);
  console.log(`  name  : ${user.name}`);
  console.log(`  email : ${user.email}`);
  console.log(`  role  : ${user.role}`);
  console.log(`  tier  : ${user.tier}`);
  console.log('────────────────────────────────\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌  Error:', err.message ?? err);
  process.exit(1);
});
