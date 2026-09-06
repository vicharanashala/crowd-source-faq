import { logger } from '../../utils/http/logger.js';
import CommunityPost from '../community/community-post.model.js';
import AiQuestion from './ai-question.model.js';
import AiClient from './ai-client.service.js';
import KnowledgeGapReport from './knowledge-gap.model.js';

export async function runKnowledgeGapAnalysis(): Promise<void> {
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);

    logger.info(`[knowledgeGap] Starting gap analysis for period: ${start.toISOString()} to ${end.toISOString()}`);

    // Fetch escalated posts
    const escalatedPosts = await CommunityPost.find({
      aiAnswerStatus: 'escalated',
      createdAt: { $gte: start, $lte: end }
    }).select('title body').lean();

    // Fetch AI questions
    const aiQuestions = await AiQuestion.find({
      createdAt: { $gte: start, $lte: end }
    }).select('question').lean();

    if (escalatedPosts.length === 0 && aiQuestions.length === 0) {
      logger.info('[knowledgeGap] No data to analyze for this period.');
      return;
    }

    const aiClient = new AiClient();
    const reportData = await aiClient.generateKnowledgeGapReport(
      escalatedPosts.map(p => ({ title: p.title, body: p.body })),
      aiQuestions.map(q => ({ question: q.question }))
    );

    // Save report
    await KnowledgeGapReport.create({
      dateRange: { start, end },
      gaps: reportData.gaps,
      trendingTopics: reportData.trendingTopics,
    });

    logger.info('[knowledgeGap] Gap analysis completed and saved successfully.');
  } catch (err) {
    logger.error(`[knowledgeGap] Error running analysis: ${(err as Error).message}`);
    throw err;
  }
}
