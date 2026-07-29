import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
  const uri = process.env.MONGODB_URI as string;
  const dbUri = uri.endsWith('/') ? uri + 'csfaq' : uri + '/csfaq';
  await mongoose.connect(dbUri);
  
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const Post = mongoose.model('CommunityPost', new mongoose.Schema({}, { strict: false, timestamps: true }));
  
  const john = await User.findOne({ name: /john/i });
  console.log('John Doe id:', john?._id);

  if (john) {
    const since = new Date();
    since.setDate(since.getDate() - 364);
    since.setHours(0, 0, 0, 0);

    const postPipeline = [
      { $match: { author: john._id, createdAt: { $gte: since } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
        count: { $sum: 1 },
      }},
    ];

    const postsAgg = await Post.aggregate(postPipeline);
    console.log('Aggregated posts:', postsAgg);
    
    // Just find one to see what fields it actually has
    const samplePost = await Post.findOne({ author: john._id });
    console.log('Sample post:', samplePost);
  }

  mongoose.disconnect();
}
run();
