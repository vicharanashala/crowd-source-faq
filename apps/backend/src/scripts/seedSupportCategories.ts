/**
 * seedSupportCategories.ts — one-time migration that converts the
 * 6 hardcoded `ISSUE_CONFIGS` into admin-editable SupportCategory
 * documents. Idempotent: re-runs are no-ops.
 *
 * Run once after deploy:
 *   npx tsx scripts/seedSupportCategories.ts
 *
 * Existing user behaviour is unchanged: each seeded category has
 * its existing 4-step checklist and an empty `fields: []` array.
 * Admins can then add custom fields via /admin/support/categories.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import SupportCategory from '../modules/support/support-category.model.js';
import { ISSUE_CONFIGS, type SupportIssueType } from '../modules/support/support-request.model.js';

const ICON_BY_TYPE: Record<SupportIssueType, 'wifi' | 'camera' | 'mic' | 'device' | 'power' | 'generic'> = {
  internet:   'wifi',
  camera:     'camera',
  microphone: 'mic',
  device:     'device',
  power:      'power',
  other:      'generic',
};

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not set in .env');
  console.log('Connecting to MongoDB…');
  await mongoose.connect(mongoUri);
  console.log('Connected.\n');

  const issueTypes = Object.keys(ISSUE_CONFIGS) as SupportIssueType[];
  let created = 0;
  let reused = 0;
  for (let i = 0; i < issueTypes.length; i++) {
    const key = issueTypes[i];
    const cfg = ISSUE_CONFIGS[key];
    const result = await SupportCategory.findOneAndUpdate(
      { issueType: key },
      {
        $setOnInsert: {
          issueType:    key,
          label:        cfg.label,
          shortLabel:   cfg.shortLabel,
          steps:        cfg.steps,
          fields:       [],
          iconKey:      ICON_BY_TYPE[key],
          isActive:     true,
          displayOrder: i,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    if (result.createdAt.getTime() === result.updatedAt.getTime() && Date.now() - result.createdAt.getTime() < 5000) {
      created += 1;
    } else {
      reused += 1;
    }
    console.log(`  ${key.padEnd(12)} → ${cfg.label}  (${cfg.steps.length} steps, ${result.fields.length} custom fields)`);
  }

  console.log(`\nDone. ${created} created, ${reused} already existed.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
