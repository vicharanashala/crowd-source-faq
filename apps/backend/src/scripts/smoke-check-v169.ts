/**
 * v1.69 — one-time smoke check. NOT a real test; just prints the
 * state of the new collections after the migration runs.
 *
 * Run:  npx tsx scripts/smoke-check-v169.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import Batch from '../modules/program/batch.model.js';
import ProgramSettings from '../modules/program/program-settings.model.js';
import ProgramEnrollment from '../modules/program/program-enrollment.model.js';
import ProgramReputation from '../modules/moderation/program-reputation.model.js';
import AiConfig from '../modules/ai/ai-config.model.js';
import FeatureFlag from '../modules/program/feature-flag.model.js';
import User from '../modules/auth/user.model.js';
import FAQ from '../modules/faq/faq.model.js';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

async function main() {
  await mongoose.connect(MONGODB_URI!);
  const db = mongoose.connection.db;
  console.log('Connected.\n');

  // Default batch + its scopes
  const defaultBatch = await Batch.findOne({ isDefault: true }).lean();
  if (!defaultBatch) { console.error('No default batch'); process.exit(1); }
  console.log(`Default batch: "${defaultBatch.name}" (${defaultBatch._id})`);
  console.log(`  isActive: ${(defaultBatch as any).isActive}`);
  console.log(`  enrollmentMode: ${(defaultBatch as any).enrollmentMode}`);
  console.log(`  startDate: ${(defaultBatch as any).startDate}`);
  console.log(`  endDate: ${(defaultBatch as any).endDate}\n`);

  // ProgramSettings
  const psCount = await ProgramSettings.countDocuments();
  const psForDefault = await ProgramSettings.findOne({ batchId: defaultBatch._id }).lean();
  console.log(`ProgramSettings total: ${psCount}`);
  if (psForDefault) {
    console.log(`  Default batch ProgramSettings fields: ${Object.keys(psForDefault).filter(k => k !== '_id' && k !== 'batchId' && k !== 'createdAt' && k !== 'updatedAt' && k !== '__v').join(', ')}`);
  }
  console.log();

  // ProgramEnrollment
  const enrCount = await ProgramEnrollment.countDocuments();
  const enrForDefault = await ProgramEnrollment.countDocuments({ batchId: defaultBatch._id });
  const enrRoles = await ProgramEnrollment.aggregate([
    { $group: { _id: '$programRole', n: { $sum: 1 } } }
  ]);
  console.log(`ProgramEnrollment total: ${enrCount} (in default: ${enrForDefault})`);
  console.log(`  Roles: ${JSON.stringify(enrRoles)}`);
  console.log();

  // ProgramReputation
  const repCount = await ProgramReputation.countDocuments();
  const repForDefault = await ProgramReputation.countDocuments({ batchId: defaultBatch._id });
  const repSample = await ProgramReputation.findOne({ batchId: defaultBatch._id }).lean();
  console.log(`ProgramReputation total: ${repCount} (in default: ${repForDefault})`);
  if (repSample) {
    console.log(`  Sample: userId=${repSample.userId} points=${repSample.points} sp=${repSample.sp} tier=${repSample.tier} acceptedAnswers=${repSample.acceptedAnswers}`);
  }
  console.log();

  // User aggregate vs ProgramReputation aggregate — they should match
  // for the default program (User.points is the global aggregate,
  // which == default-program rep since every user is only enrolled
  // in one program right now).
  const userTotal = await User.aggregate([
    { $group: { _id: null, totalPoints: { $sum: '$points' }, totalSp: { $sum: '$sp' } } }
  ]);
  const repTotal = await ProgramReputation.aggregate([
    { $group: { _id: null, totalPoints: { $sum: '$points' }, totalSp: { $sum: '$sp' } } }
  ]);
  console.log(`User aggregate points/sp: ${JSON.stringify(userTotal[0])}`);
  console.log(`ProgramReputation aggregate points/sp: ${JSON.stringify(repTotal[0])}`);
  console.log(`  Match: ${userTotal[0]?.totalPoints === repTotal[0]?.totalPoints && userTotal[0]?.totalSp === repTotal[0]?.totalSp}\n`);

  // AiConfig + FeatureFlag scopes
  const aiTotal = await AiConfig.countDocuments();
  const aiNull = await AiConfig.countDocuments({ batchId: null });
  const aiPerProgram = await AiConfig.countDocuments({ batchId: { $ne: null } });
  console.log(`AiConfig: total=${aiTotal}, batchId:null=${aiNull}, per-program=${aiPerProgram}`);

  const ffTotal = await FeatureFlag.countDocuments();
  const ffNull = await FeatureFlag.countDocuments({ batchId: null });
  const ffPerProgram = await FeatureFlag.countDocuments({ batchId: { $ne: null } });
  console.log(`FeatureFlag: total=${ffTotal}, batchId:null=${ffNull}, per-program=${ffPerProgram}\n`);

  // FAQs in default batch
  const faqTotal = await FAQ.countDocuments();
  const faqDefault = await FAQ.countDocuments({ batchId: defaultBatch._id });
  const faqOrphan = await FAQ.countDocuments({ batchId: null });
  console.log(`FAQ: total=${faqTotal}, in default batch=${faqDefault}, orphaned (batchId:null)=${faqOrphan}\n`);

  // Sanity: list of batch names
  const allBatches = await Batch.find().select('name isDefault isActive enrollmentMode').lean();
  console.log('All Batches:');
  for (const b of allBatches) {
    console.log(`  - "${b.name}"  isDefault=${(b as any).isDefault}  isActive=${(b as any).isActive}  enrollmentMode=${(b as any).enrollmentMode}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => { console.error('Smoke check failed:', err); process.exit(1); });
