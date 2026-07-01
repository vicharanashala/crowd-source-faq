import 'dotenv/config';
import mongoose from 'mongoose';
import CategoryCluster from '../modules/program/category-cluster.model.js';
import FAQ from '../modules/faq/faq.model.js';

async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGODB_URI!);
  const clusters = await CategoryCluster.find({}).select('canonicalName aliases faqCount').sort({ faqCount: -1 }).lean();
  console.log(`CategoryCluster count: ${clusters.length}`);
  for (const c of clusters) {
    console.log(` - "${c.canonicalName}" (count=${c.faqCount}, aliases=${c.aliases.length})`);
    for (const a of c.aliases) console.log(`     · ${a}`);
  }
  // Also check raw categories
  const faqCats = await FAQ.aggregate<{ _id: string; count: number }>([
    { $match: { status: 'approved' } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  console.log(`\nRaw FAQ categories (${faqCats.length}):`);
  for (const c of faqCats) console.log(` - ${c._id} (count=${c.count})`);
  await mongoose.disconnect();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
