/**
 * APPLIES WRITES — this is not a dry run.
 *
 * 2026-09-25 incident follow-up: 7 accounts confirmed, via real
 * Samagama admin-panel start/end dates Jinal supplied directly, to be
 * mislabeled as Monsoonship when their real internship falls inside
 * the summership window (2026-05-15 to 2026-07-15). Every other
 * account flagged by the earlier date-heuristic audit turned out to
 * be a false alarm once checked against real Samagama data — this
 * script touches ONLY the 7 confirmed-correct cases below, nothing
 * inferred or bulk-applied.
 *
 * For each: deactivates the wrong Monsoonship ProgramEnrollment row
 * and creates/reactivates the correct summership one, marked
 * `source: 'admin'` (a manual correction, not a bridge assertion or a
 * backfill guess). This is a one-directional move INTO summership,
 * consistent with "never remove anyone from summership."
 *
 * Idempotent: safe to re-run — skips anyone already correctly on
 * summership only.
 *
 * Run:  npx tsx src/scripts/apply-confirmed-enrollment-fixes.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../modules/auth/user.model.js';
import ProgramEnrollment from '../modules/program/program-enrollment.model.js';
import Batch from '../modules/program/batch.model.js';

// Confirmed via Samagama admin-panel screenshots (start date, end date)
// supplied directly by Jinal on 2026-09-25 — every one of these real
// start dates falls within 2026-05-15..2026-07-15 (summership), while
// the account is currently enrolled as Monsoonship.
const CONFIRMED_FIXES = [
  { email: 'banuvkp@gmail.com', name: 'Banu M', realStartDate: '2026-07-01' },
  { email: 'lalithasriharshitha2810@gmail.com', name: 'Thummalacheruvu Lalitha Sri Harshitha', realStartDate: '2026-07-14' },
  { email: 'mahakrayat@gmail.com', name: 'Mahak', realStartDate: '2026-07-01' },
  { email: 'darochamrik@gmail.com', name: 'Amrik Singh', realStartDate: '2026-07-01' },
  { email: 'aashnashibily@gmail.com', name: 'Aashna Shibily', realStartDate: '2026-07-01' },
  { email: 'thavaneesh2005@gmail.com', name: 'Thavaneesh D Shetty', realStartDate: '2026-07-01' },
  { email: 'hosnnasruti0015@gmail.com', name: 'Hosnnasruti Mishra', realStartDate: '2026-07-01' },
];

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(mongoUri);

  const summership = await Batch.findOne({ name: 'summership' }).select('_id').lean();
  const monsoonship = await Batch.findOne({ name: 'Monsoonship' }).select('_id').lean();
  if (!summership || !monsoonship) throw new Error('Could not resolve summership/Monsoonship batch');

  for (const fix of CONFIRMED_FIXES) {
    console.log(`\n=== ${fix.email} (${fix.name}) — real start ${fix.realStartDate} ===`);
    const user = await User.findOne({ email: fix.email }).select('_id name email').lean();
    if (!user) {
      console.log('  ⚠ NO USER FOUND — skipping.');
      continue;
    }
    if (user.name !== fix.name) {
      console.log(`  ⚠ Name mismatch (DB has "${user.name}", expected "${fix.name}") — skipping for safety, please verify by hand.`);
      continue;
    }

    const monsoonshipEnrollment = await ProgramEnrollment.findOne({ userId: user._id, batchId: monsoonship._id });
    const summershipEnrollment = await ProgramEnrollment.findOne({ userId: user._id, batchId: summership._id });

    if (summershipEnrollment?.isActive) {
      console.log('  Already active on summership — nothing to do.');
      continue;
    }

    if (monsoonshipEnrollment?.isActive) {
      monsoonshipEnrollment.isActive = false;
      await monsoonshipEnrollment.save();
      console.log('  Deactivated the incorrect Monsoonship enrollment.');
    } else {
      console.log('  (No active Monsoonship enrollment found to deactivate — proceeding anyway.)');
    }

    if (summershipEnrollment) {
      summershipEnrollment.isActive = true;
      summershipEnrollment.programRole = summershipEnrollment.programRole || 'student';
      summershipEnrollment.source = 'admin';
      await summershipEnrollment.save();
      console.log('  Reactivated the existing summership enrollment row.');
    } else {
      await ProgramEnrollment.create({
        userId: user._id,
        batchId: summership._id,
        programRole: 'student',
        enrolledBy: null,
        isActive: true,
        source: 'admin',
      });
      console.log('  Created a new, active summership enrollment.');
    }
  }

  console.log('\n=== Done. ===');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
