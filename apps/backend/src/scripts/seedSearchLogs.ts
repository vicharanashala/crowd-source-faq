/**
 * Seed SearchLogs with realistic demo data.
 * Run: npx tsx scripts/seedSearchLogs.ts [--count N] [--days N] [--fail-rate 0.15] [--clear]
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import SearchLog from '../modules/search/search-log.model.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yaksha_faq';

interface QueryEntry { query: string; weight: number; }

const QUERIES: QueryEntry[] = [
  { query: 'offer letter', weight: 10 }, { query: 'noc request', weight: 9 },
  { query: 'team formation', weight: 8 }, { query: 'project submission deadline', weight: 8 },
  { query: 'certificate request', weight: 7 }, { query: 'internship duration', weight: 7 },
  { query: 'stipend payment date', weight: 6 }, { query: 'relieving letter', weight: 6 },
  { query: 'experience letter', weight: 6 }, { query: 'how to request noc', weight: 5 },
  { query: 'project guidelines', weight: 5 }, { query: 'attendance policy', weight: 5 },
  { query: 'remote work policy', weight: 4 }, { query: 'leave application', weight: 4 },
  { query: 'holiday list', weight: 4 }, { query: 'performance review', weight: 4 },
  { query: 'appraisal form', weight: 4 }, { query: 'completion certificate', weight: 4 },
  { query: 'background verification', weight: 3 }, { query: 'employee ID card', weight: 3 },
  // Failed queries
  { query: 'salary slip', weight: 2 }, { query: 'provident fund', weight: 2 },
  { query: 'health insurance claim', weight: 1 }, { query: 'parking pass', weight: 1 },
  { query: 'business card request', weight: 1 }, { query: 'macbook allocation', weight: 1 },
  { query: 'software license', weight: 1 }, { query: 'travel reimbursement', weight: 1 },
  { query: 'esop allocation', weight: 1 },
  // Community
  { query: 'how to crack the interview', weight: 5 }, { query: 'team allocation process', weight: 4 },
  { query: 'project technology stack', weight: 4 }, { query: 'manager feedback', weight: 3 },
  { query: 'peer review process', weight: 3 }, { query: 'code review guidelines', weight: 3 },
  { query: 'git workflow', weight: 3 }, { query: 'deployment process', weight: 3 },
  { query: 'onboarding checklist', weight: 3 }, { query: '1-on-1 schedule', weight: 2 },
];

function generateEntries(count: number, days: number, failRate: number) {
  const now = Date.now();
  const pool: string[] = [];
  for (const { query, weight } of QUERIES) {
    for (let i = 0; i < weight; i++) pool.push(query);
  }

  return Array.from({ length: count }, () => {
    const query = pool[Math.floor(Math.random() * pool.length)];
    const isFailed = Math.random() < failRate;
    const isCommunity = Math.random() < 0.3;
    const offset = Math.random() * days * 24 * 60 * 60 * 1000;
    return {
      query,
      resultsCount: isFailed ? 0 : Math.floor(Math.random() * 8) + 1,
      topResultId: isFailed ? null : new mongoose.Types.ObjectId(),
      topResultSource: isFailed ? null : isCommunity ? 'community' : 'faq',
      createdAt: new Date(now - offset),
    };
  });
}

async function seed({ count, days, failRate }: { count: number; days: number; failRate: number }) {
  await mongoose.connect(MONGODB_URI);
  console.log(`Connected. Generating ${count} entries over ${days} days (fail-rate=${failRate})...`);

  if (process.argv.includes('--clear')) {
    await SearchLog.deleteMany({});
    console.log('Cleared existing logs.');
  }

  const entries = generateEntries(count, days, failRate);
  const CHUNK = 1000;
  let inserted = 0;
  for (let i = 0; i < entries.length; i += CHUNK) {
    await SearchLog.insertMany(entries.slice(i, i + CHUNK), { ordered: false });
    inserted += Math.min(CHUNK, entries.length - i);
    process.stdout.write(`\r  Inserted ${inserted}/${entries.length}...`);
  }
  console.log('\n');

  const total = await SearchLog.countDocuments();
  const failed = await SearchLog.countDocuments({ resultsCount: 0 });
  console.log(`✅ Done. Total: ${total}, Failed: ${failed}, Success: ${total - failed}`);
  await mongoose.disconnect();
  process.exit(0);
}

const argv = process.argv.slice(2);
const getArg = (flag: string, fallback: string): string => {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};

const count = parseInt(getArg('--count', '200'));
const days = parseInt(getArg('--days', '14'));
const failRate = parseFloat(getArg('--fail-rate', '0.15'));

seed({ count, days, failRate }).catch((err) => {
  console.error('\n❌ Seed failed:', err.message);
  process.exit(1);
});
