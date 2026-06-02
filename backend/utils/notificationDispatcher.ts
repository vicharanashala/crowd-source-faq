/**
 * notificationDispatcher
 *
 * Text-bank driven notification factory.
 * Selects a random message string from the curated pool for the given event type,
 * persists it to MongoDB, and optionally emits a Socket.io event.
 */

import { Types } from 'mongoose';
import Notification, { NotificationType } from '../models/Notification.js';

// ─── Text Bank ─────────────────────────────────────────────────────────────────

const notificationTextBank: Record<string, string[]> = {
  question_answered: [
    'Unread Wisdom: 1 new response to your question.',
    'Console Log Update: A user has responded to your question.',
    'Clarity is here. Check out the new answer to your query',
    'You asked, they delivered. Tap to view the latest answer!',
    'Bug resolved? Check out the new response to your question.',
  ],
  new_question: [
    "New doubt spotted on the radar. Go clear it up!",
    'Stack Overflow Mode: A peer just dropped an unhandled question.',
    'New puzzle dropped! Tap to solve the latest mystery on the board.',
    'Your expertise has been summoned, new query dropped',
    'Fresh question, fresh opportunity for glory',
  ],
  upvote: [
    'Knowledge shared. Appreciation received.',
    'Someone totally loved your answer and smashed the upvote button.',
    'Your response just picked up another round of applause.',
    'Your explanation resonated perfectly with the community.',
    'Your answer is scaling up! Clean execution recognized by the cluster.',
  ],
  downvote: [
    'Oof, tough crowd! Someone disagreed with your answer.',
    "Plot twist! Your response didn't quite work for everyone.",
    'Constructive feedback time: A peer feels this answer could use a bit more depth',
    'Oof. The crowd threw a tomato 🍅, your answer got downvoted.',
  ],
  accepted_answer: [
    '👑 Case closed. You just solved a mystery.',
    '👑 Your answer got the crown your highness',
    '👑 Your answer understood the assignment.',
    '👑 Status: Closed. Your answer was verified as the ultimate working solution.',
    '👑 We have a winner! The author picked your solution out of the entire crowd.',
  ],
};

// ─── Socket.io broadcast (lazy singleton) ────────────────────────────────────
// Assumes server.ts exports io on the global so it can be accessed outside the
// Express request context. Example init in server.ts:
//
//   import { Server } from 'socket.io';
//   const io = new Server(httpServer, { cors: … });
//   (global as any)._io = io;
function getSocketServer(): any {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return (global as unknown as { _io?: unknown })._io ?? null;
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

interface DispatchOptions {
  recipientId: Types.ObjectId;
  eventType: Exclude<NotificationType, 'post_resolved' | 'comment_replied' | 'faq_match_found' | 'mention' | 'expert_request'>;
  /** Navigable URL — e.g. /community?post=<id> or /faq/<faqId> */
  link: string;
  /**
   * Optional human-readable title override.
   * When omitted a sensible default is derived from eventType.
   */
  title?: string;
}

/**
 * Fire-and-forget notification factory.
 *
 * Usage in a controller:
 *   await dispatchNotification({ recipientId: post.author, eventType: 'upvote', link: `/community?post=${postId}` });
 */
export const dispatchNotification = async ({
  recipientId,
  eventType,
  link,
  title,
}: DispatchOptions): Promise<void> => {
  const bank = notificationTextBank[eventType];
  if (!bank || bank.length === 0) return; // Unknown eventType — no-op silently

  const message = bank[Math.floor(Math.random() * bank.length)];

  const defaultTitles: Record<string, string> = {
    question_answered: 'New Answer',
    new_question: 'New Question',
    upvote: 'Upvote Received',
    downvote: 'Downvote Received',
    accepted_answer: 'Answer Accepted',
  };

  try {
    const doc = await Notification.create({
      recipient: recipientId,
      type: eventType,
      title: title ?? defaultTitles[eventType] ?? eventType,
      message,
      link,
      read: false,
    });

    // ── Real-time broadcast (Socket.io) ────────────────────────────────────
    // Only emitted when the recipient is currently connected.
    // Safe to await inside a non-critical path — failure does not affect the
    // notification save above.
    try {
      const io = getSocketServer();
      if (io) {
        io.to(recipientId.toString()).emit('notification', doc);
      }
    } catch {
      // Socket errors are non-fatal — swallow so io issues never break the request
    }
  } catch {
    // Notifications are best-effort; surface errors only in environments
    // where you want alerting (staging / canary). In production the error is
    // swallowed to avoid poisoning the parent operation.
  }
};