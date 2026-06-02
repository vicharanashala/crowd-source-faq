/**
 * One-time migration script: encrypt Zoom OAuth tokens at rest.
 *
 * Background:
 *   zoomAccessToken / zoomRefreshToken were stored in plaintext.
 *   This script finds all users with zoomConnected=true whose tokens are
 *   still plaintext, encrypts them using AES-256-GCM (via utils/crypto.ts),
 *   and saves them back.
 *
 * Safety:
 *   - Only migrates tokens that are non-empty and look plaintext.
 *   - Prints a dry-run summary before making changes (--dry-run flag).
 *   - After each batch save, waits briefly to avoid overwhelming the DB.
 *
 * Run:
 *   npx tsx scripts/migrateZoomTokens.ts
 *   npx tsx scripts/migrateZoomTokens.ts --dry-run   # preview only
 *
 * Required env vars (loaded from .env.local via dotenv):
 *   MONGODB_URI   — connection string
 *   JWT_SECRET    — master key for AES-256-GCM
 */

import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });

import mongoose from 'mongoose';
import User from '../models/User.js';
import { encrypt, decrypt } from '../utils/crypto.js';

// ─── CLI args ────────────────────────────────────────────────────────────────

const isDryRun = process.argv.includes('--dry-run');
const batchSize = 50;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns true if a string looks like an already-encrypted token
 * (base64-encoded SALT(16) + IV(12) + ciphertext + TAG(16)).
 * Minimum length: 16 + 12 + 1 + 16 = 45 bytes before base64 overhead.
 * A 1-byte ciphertext expands to at least ceil((1+16)/3)*4 = 24 base64 chars.
 * In practice, Zoom tokens are long JWTs, so the minimum encoded length is ~100 chars.
 */
function looksEncrypted(value: string): boolean {
  if (!value || value.length < 100) return false;
  // Encrypted tokens are valid base64
  try {
    const buf = Buffer.from(value, 'base64');
    // Minimum structure: salt(16) + iv(12) + at least 1 byte ciphertext + tag(16)
    if (buf.length < 45) return false;
    return true;
  } catch {
    return false;
  }
}

async function migrateTokens(): Promise<void> {
  // Validate environment
  if (!process.env.MONGODB_URI) {
    console.error('[migrateZoomTokens] MONGODB_URI is not set');
    process.exit(1);
  }

  let masterKey: string;
  try {
    masterKey = (await import('../utils/crypto.js')).getMasterKey();
  } catch {
    console.error('[migrateZoomTokens] JWT_SECRET is not set or too short — cannot encrypt tokens');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('[migrateZoomTokens] Connected to MongoDB');

  let totalChecked = 0;
  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // Cursor-based iteration to avoid loading all users into memory
  const cursor = User.find({
    zoomConnected: true,
    zoomAccessToken: { $exists: true },
  }).lean().cursor({ batchSize });

  for await (const doc of cursor) {
    totalChecked++;

    const accessToken  = doc.zoomAccessToken  as string | undefined;
    const refreshToken = doc.zoomRefreshToken as string | undefined;

    // Skip if already encrypted or empty
    if (!accessToken || looksEncrypted(accessToken)) {
      totalSkipped++;
      continue;
    }

    // Verify token looks like plaintext (should be a reasonably long base64 string)
    if (accessToken.length < 20) {
      console.warn(`[migrateZoomTokens] Skipping user ${doc._id} — access token too short to be a valid Zoom token`);
      totalSkipped++;
      continue;
    }

    if (isDryRun) {
      console.log(`[DRY RUN] Would encrypt tokens for user ${doc._id} (${doc.email})`);
      totalMigrated++;
      continue;
    }

    try {
      // Encrypt both tokens
      const encryptedAccess  = encrypt(accessToken, masterKey);
      const encryptedRefresh = refreshToken ? encrypt(refreshToken, masterKey) : null;

      await User.updateOne(
        { _id: doc._id },
        {
          $set: {
            zoomAccessToken:  encryptedAccess,
            zoomRefreshToken: encryptedRefresh,
          },
        }
      );

      totalMigrated++;
      console.log(`[migrateZoomTokens] Migrated user ${doc._id} (${doc.email})`);
    } catch (err) {
      totalErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[migrateZoomTokens] ERROR migrating user ${doc._id}: ${msg}`);
    }

    // Small pause between batches to avoid DB pressure
    if (totalChecked % batchSize === 0) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log('\n=== Migration Summary ===');
  console.log(`  Checked : ${totalChecked}`);
  console.log(`  Migrated: ${totalMigrated}`);
  console.log(`  Skipped : ${totalSkipped}`);
  console.log(`  Errors  : ${totalErrors}`);

  if (isDryRun) {
    console.log('\n  This was a DRY RUN — no actual changes were made.');
    console.log('  Run without --dry-run to apply changes.');
  }

  await mongoose.disconnect();
  console.log('[migrateZoomTokens] Done.');
}

migrateTokens().catch((err) => {
  console.error('[migrateZoomTokens] Fatal:', err);
  process.exit(1);
});