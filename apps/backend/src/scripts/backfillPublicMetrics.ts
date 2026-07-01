import 'dotenv/config';
import mongoose from 'mongoose';
import FAQ from '../modules/faq/faq.model.js';
import { countWords, expectedReadMs } from '../utils/http/popularityScore.js';

await mongoose.connect(process.env.MONGODB_URI!);

const total = await FAQ.countDocuments({ status: 'approved' });
const withWc = await FAQ.countDocuments({ status: 'approved', wordCount: { $gt: 0 } });
const needsWc = await FAQ.find({ $or: [{ wordCount: 0 }, { wordCount: { $exists: false } }] })
  .select('_id question answer')
  .lean();
const withScore = await FAQ.countDocuments({ status: 'approved', popularityScore: { $gt: 0 } });

console.log({ total, withWc, needsWcCount: needsWc.length, withScore });

if (needsWc.length > 0) {
  console.log('Backfilling wordCount + expectedReadMs...');
  const ops = needsWc.map((s) => {
    const wc = countWords(s.question) + countWords(s.answer);
    return { updateOne: { filter: { _id: s._id }, update: { $set: { wordCount: wc, expectedReadMs: expectedReadMs(wc) } } } };
  });
  const r = await FAQ.bulkWrite(ops, { ordered: false });
  console.log('Backfill result:', r.modifiedCount, 'modified');
}

await mongoose.disconnect();
