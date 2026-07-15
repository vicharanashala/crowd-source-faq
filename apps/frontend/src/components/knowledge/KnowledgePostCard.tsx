/**
 * KnowledgePostCard — the enterprise-grade card for a single FAQ/post in
 * the Peer-Powered Learning Assistant's knowledge bank.
 *
 * Backed by:
 *   FAQ.isOutdated       — virtual, computed from createdAt (see faq.model.ts)
 *   FAQ.helpedUsers[]    — toggled via HelpfulButton (PATCH /faq/:id/helped)
 *   FAQ.escalationPriority — surfaced via GoldenTicketButton (see components/golden)
 */

import React, { useState } from 'react';
import Card from '../ui/Card';
import OutdatedBadge from './OutdatedBadge';
import HelpfulButton from './HelpfulButton';
import { useToast } from '../../hooks/useToast';
import GoldenTicketButton from '../golden/GoldenTicketButton';

export interface KnowledgePost {
  _id: string;
  question: string;
  answer: string;
  category: string;
  tags?: string[];
  isOutdated: boolean;
  helpedUsers: string[];
  escalationPriority?: 'normal' | 'high';
  createdAt: string;
}

interface KnowledgePostCardProps {
  post: KnowledgePost;
  /** Current user's id — used to derive whether *they* already clicked helpful. */
  currentUserId?: string | null;
  /** Set true to show the "Use Golden Ticket" escalation action on this card. */
  allowEscalation?: boolean;
}

export default function KnowledgePostCard({
  post,
  currentUserId,
  allowEscalation = false,
}: KnowledgePostCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const { toast, showToast, ToastViewport } = useToast();

  const initialHelped = !!currentUserId && post.helpedUsers.includes(currentUserId);
  const isEscalated = post.escalationPriority === 'high';

  return (
    <Card variant="elevated" className="relative p-5 flex flex-col gap-3">
      {/* Top-right badge stack — outdated warning + escalation indicator */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {isEscalated && (
          <span
            title="Escalated via Golden Ticket — prioritized for admin review"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium leading-none bg-accent-light text-accent border border-accent/20"
          >
            <span aria-hidden="true">🎫</span>
            Escalated
          </span>
        )}
        <OutdatedBadge isOutdated={post.isOutdated} />
      </div>

      <div className="pr-24">
        <span className="inline-block text-[11px] font-semibold uppercase tracking-wide text-accent mb-1">
          {post.category}
        </span>
        <h3 className="text-sm font-semibold text-ink leading-snug">{post.question}</h3>
      </div>

      <p className={`text-sm text-ink-soft leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>
        {post.answer}
      </p>

      {post.answer.length > 160 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-xs font-medium text-accent hover:underline"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}

      {!!post.tags?.length && (
        <div className="flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 rounded text-[11px] bg-mist text-ink-faint">
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border/60 mt-1">
        <HelpfulButton
          faqId={post._id}
          initialHelped={initialHelped}
          initialCount={post.helpedUsers.length}
          onError={(msg) => showToast(msg, 'error')}
        />

        {allowEscalation && !isEscalated && (
          <GoldenTicketButton
            faqId={post._id}
            faqQuestion={post.question}
            onEscalated={() => showToast('FAQ escalated to the top of the Admin Queue.', 'success')}
            onError={(msg) => showToast(msg, 'error')}
          />
        )}
      </div>

      <ToastViewport />
    </Card>
  );
}
