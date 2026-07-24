import { MessageReaction, User, Message, PartialMessageReaction, PartialUser } from 'discord.js';
import { logger } from '../../utils/http/logger.js';
import { chatWithConfig, getPipelineProviderConfig } from '../../utils/ai/aiProvider.js';
import FAQ from '../../modules/faq/faq.model.js';
import { Types } from 'mongoose';
import { ProgramBotConfig } from './botManager.js';

export async function handleMessageReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  config: ProgramBotConfig
): Promise<void> {
  if (user.bot) return;

  // We are looking for a specific emoji to trigger ingestion. Let's use ✅ or 💡
  const triggerEmojis = ['✅', '💡'];
  if (!triggerEmojis.includes(reaction.emoji.name ?? '')) return;

  try {
    // Ensure we have the full message
    if (reaction.partial) {
      await reaction.fetch();
    }
    const message = reaction.message;
    if (message.partial) {
      await message.fetch();
    }

    if (message.author?.bot) return;

    logger.info(`[discordIngestion] Triggered by ${user.tag} on message ${message.id} in guild ${config.guildId}`);

    // Fetch conversation context. If it's a thread, get the original message.
    let questionText = '';
    let answerText = message.content;
    
    if (message.channel.isThread()) {
      const starterMessage = await message.channel.fetchStarterMessage();
      if (starterMessage) {
        questionText = starterMessage.content;
      }
    } else if (message.reference && message.reference.messageId) {
      try {
        const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
        if (referencedMessage) {
          questionText = referencedMessage.content;
        }
      } catch (err) {
        logger.warn(`[discordIngestion] Failed to fetch referenced message ${message.reference.messageId}: ${(err as Error).message}`);
        questionText = "Extract the question from the context.";
      }
    } else {
      // Not a thread or reply. We will assume the message itself contains both or just extract what we can.
      questionText = "Extract the question from the context.";
    }

    const systemPrompt = `You are an AI assistant tasked with extracting a clean, formal Question and Answer from a Discord support conversation.
The user has reacted with a checkmark to indicate this message resolves a question.
Extract the core question and the core answer. 
Format your response as a JSON object with strictly two keys: "question" and "answer". Do not include any other text.
If you cannot find a valid question/answer, return {"question": "Could not extract", "answer": "Could not extract"}.`;

    const userPrompt = `
Context Question (if any): ${questionText}
Answer Message: ${answerText}
    `;

    const aiConfig = await getPipelineProviderConfig('auto_answer');
    const rawReply = await chatWithConfig(aiConfig, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    let parsed: { question?: string, answer?: string } = {};
    try {
      // find JSON boundaries in case of markdown wrapping
      const jsonStr = rawReply.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      logger.warn(`[discordIngestion] Failed to parse AI response as JSON: ${rawReply}`);
      return;
    }

    if (!parsed.question || !parsed.answer || parsed.question === "Could not extract") {
      logger.warn(`[discordIngestion] AI could not extract valid Q&A from message ${message.id}`);
      return;
    }

    // Save to FAQ collection as pending_review
    const faq = await FAQ.create({
      question: parsed.question,
      answer: parsed.answer,
      tags: ['discord-ingestion'],
      category: 'General',
      searchCount: 0,
      status: 'pending',
      views: 0,
      helpfulVotes: 0,
      unhelpfulVotes: 0,
      createdBy: null, // System generated
      freshnessTier: 'evergreen',
      reviewIntervalDays: 0,
      reviewStatus: 'pending_review',
      lastVerifiedDate: new Date(),
      flaggedAt: new Date(),
      flagType: 'auto',
      flagReason: 'Ingested from Discord via reaction',
      flaggedBy: null,
      reviewCycle: 1,
      lastCheckedAt: new Date(),
      trustLevel: 'medium',
      sourceType: 'manual',
      sourceCommunityPostId: null,
      promotedAt: null,
      objectionStatus: 'none',
      promotionMetadata: null,
      sourceMeetingId: null,
      sourceMeetingTopic: null,
      sourceInsightId: null,
      batchId: new Types.ObjectId(config.batchId),
      categoryId: null,
      popularityScore: 0,
      guestViewCount: 0,
      avgReadCompletion: 0,
      avgTimeSpentRatio: 0,
      guestViewLast24h: 0,
      wordCount: (parsed.question.length + parsed.answer.length) / 5,
      expectedReadMs: ((parsed.question.length + parsed.answer.length) / 5) * 300,
      popularityUpdatedAt: null,
    });

    logger.info(`[discordIngestion] Successfully ingested FAQ ${faq._id} from message ${message.id}`);
    
    // React to the message to show success
    await message.react('💾');

  } catch (err) {
    logger.error(`[discordIngestion] Error handling reaction: ${(err as Error).message}`);
  }
}
