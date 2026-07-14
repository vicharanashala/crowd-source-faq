import { Request, Response } from 'express';
import FAQ from './faq.model.js';
import CommunityPost from '../community/community-post.model.js';
import SearchLog from '../search/search-log.model.js';
import { resolveProviderAsync, chatWithConfig } from '../../utils/ai/aiProvider.js';
import { logger } from '../../utils/http/logger.js';

export const generateWeeklyDigest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { batchId } = req.query as { batchId?: string };

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Fetch 3 newly approved FAQs
    const newFaqs = await FAQ.find({ status: 'approved', createdAt: { $gte: oneWeekAgo } })
      .sort({ createdAt: -1 })
      .limit(3);

    // Fetch top community posts and populate author to get their name
    const topPosts = await CommunityPost.find({ isHidden: false, createdAt: { $gte: oneWeekAgo } })
      .populate('author', 'name')
      .lean();

    // Sort in memory by upvotes length descending
    const sortedPosts = (topPosts as any[]).sort(
      (a, b) => (b.upvotes?.length || 0) - (a.upvotes?.length || 0)
    );
    const topPostsLimited = sortedPosts.slice(0, 3);

    // Fetch top 5 trending search queries
    const trendingSearches = await SearchLog.aggregate([
      { $match: { createdAt: { $gte: oneWeekAgo } } },
      { $group: { _id: '$query', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    const searches = trendingSearches.map(s => `${s._id} (${s.count} searches)`).join(', ');

    const aiConfig = await resolveProviderAsync();
    let newsletterMarkdown = '';

    if (aiConfig && aiConfig.apiKey) {
      const prompt = `You are a professional technical writer and communications assistant.
Create a beautifully structured weekly newsletter digest for student interns based on the following weekly activity:

NEW APPROVED FAQs:
${newFaqs.map(f => `- [${f.category}] Q: ${f.question}\n  A: ${f.answer}`).join('\n')}

TOP UPVOTED COMMUNITY THREADS:
${topPostsLimited.map(p => `- Q: ${p.title}\n  Author: ${p.author?.name || 'Anonymous'} (${p.upvotes?.length || 0} upvotes)`).join('\n')}

TRENDING SEARCH KEYWORDS:
${searches || 'None'}

Draft a highly engaging, markdown newsletter with sections:
1. "🔥 Hot Topics this Week" (summarizing trending searches and community highlights)
2. "🆕 Newly Released Answers" (listing newly approved FAQs)
3. "💡 Intern Community Spotlight" (summarizing the top community questions and encouraging collaborative answers)

Keep the tone encouraging, helpful, and premium. Format it strictly as Markdown.`;

      newsletterMarkdown = await chatWithConfig(aiConfig, [
        { role: 'user', content: prompt }
      ]);
    } else {
      // Fallback markdown if AI is not configured
      newsletterMarkdown = `# Weekly Internship FAQ Digest

## 🔥 Hot Topics this Week
Here are the trending searches this week:
${trendingSearches.map(s => `* **${s._id}**`).join('\n') || '* No search trends logged.'}

## 🆕 Newly Released Answers
Check out these freshly approved FAQs to help guide you:
${newFaqs.map(f => `### [${f.category}] ${f.question}\n${f.answer}`).join('\n\n') || '* No new FAQs approved this week.'}

## 💡 Intern Community Spotlight
Help your fellow interns by checking out these popular active community questions:
${topPostsLimited.map(p => `* **${p.title}** (by ${p.author?.name || 'Anonymous'}) — ${p.upvotes?.length || 0} upvotes`).join('\n') || '* No active community threads.'}
`;
    }

    res.json({
      digestMarkdown: newsletterMarkdown,
      faqsCount: newFaqs.length,
      postsCount: topPostsLimited.length,
      trendsCount: trendingSearches.length
    });
  } catch (error) {
    logger.error(`[digest] generateWeeklyDigest failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Failed to generate weekly digest.' });
  }
};
