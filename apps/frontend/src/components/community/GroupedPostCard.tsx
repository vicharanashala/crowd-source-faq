import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CommunityPostCard from './CommunityPostCard';
import type { Post } from '../../types/ui';

interface GroupedPostCardProps {
  cluster: {
    id: string;
    canonicalTitle: string;
    postIds: string[];
    posts: Post[];
  };
  onClickPost: (post: Post) => void;
  currentUserId?: string;
  onToggleBookmark?: (postId: string) => void;
}

export default function GroupedPostCard({
  cluster,
  onClickPost,
  currentUserId,
  onToggleBookmark,
}: GroupedPostCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const postsCount = cluster.posts.length;

  // If there's only 1 post in the cluster, just render it normally without any grouping wrappers
  if (postsCount === 1) {
    return (
      <CommunityPostCard
        post={cluster.posts[0]}
        onClick={onClickPost}
        currentUserId={currentUserId}
        onToggleBookmark={onToggleBookmark}
      />
    );
  }

  // Get unique author names for the group summary display
  const authorNames = Array.from(
    new Set(cluster.posts.map((p) => p.author?.name || 'Student'))
  ).slice(0, 3);

  return (
    <div className="w-full relative mb-4">
      <AnimatePresence initial={false} mode="wait">
        {!isExpanded ? (
          // COLLAPSED: Stacked Cards Deck Effect
          <motion.div
            key="collapsed"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onClick={() => setIsExpanded(true)}
            className="cursor-pointer group relative select-none w-full"
          >
            {/* Third stacked card background */}
            <div className="absolute -bottom-2 left-4 right-4 h-full bg-card border border-border rounded-2xl shadow-subtle opacity-40 z-0 transition-transform duration-300 group-hover:translate-y-1" />

            {/* Second stacked card background */}
            <div className="absolute -bottom-1 left-2 right-2 h-full bg-card border border-border rounded-2xl shadow-subtle opacity-75 z-10 transition-transform duration-300 group-hover:translate-y-0.5" />

            {/* Primary/Top card */}
            <div className="relative z-20 bg-card border border-border rounded-2xl shadow-subtle p-5 flex items-start gap-4 transition-all duration-300 group-hover:border-accent">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-accent-light text-accent flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 6.1H3" />
                  <path d="M21 12H3" />
                  <path d="M17 17.9H3" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-[11px] font-bold text-accent">
                    {postsCount} Similar Questions
                  </span>
                  <span className="text-xs text-ink-faint">
                    Grouped by AI
                  </span>
                </div>

                <p className="mt-2 text-base font-semibold text-ink leading-snug group-hover:text-accent transition-colors">
                  {cluster.canonicalTitle}
                </p>

                <p className="mt-1 text-xs text-ink-soft leading-relaxed line-clamp-1">
                  Includes: {cluster.posts.map((p) => `"${p.title}"`).join(', ')}
                </p>

                <div className="mt-3 flex items-center gap-2 text-xs text-ink-faint">
                  <span>Asked by: {authorNames.join(', ')}{cluster.posts.map(p => p.author?.name).filter(Boolean).length > 3 && ' and others'}</span>
                </div>
              </div>

              <span className="flex-shrink-0 text-ink-faint group-hover:text-accent transition-colors mt-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            </div>
          </motion.div>
        ) : (
          // EXPANDED: Accordion view showing list of sub-posts
          <motion.div
            key="expanded"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full bg-mist/30 border border-border rounded-2xl p-4 shadow-inner"
          >
            {/* Header with collapse option */}
            <div className="flex items-center justify-between pb-3 border-b border-border mb-3 px-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-[10px] font-bold text-accent">
                  AI Topic: {postsCount} questions
                </span>
                <h3 className="text-sm font-semibold text-ink truncate">
                  {cluster.canonicalTitle}
                </h3>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-dark transition-colors px-2 py-1 rounded-lg hover:bg-mist"
              >
                Collapse
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
            </div>

            {/* List of actual post cards */}
            <div className="flex flex-col gap-3">
              {cluster.posts.map((post) => (
                <motion.div
                  key={post._id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <CommunityPostCard
                    post={post}
                    onClick={onClickPost}
                    currentUserId={currentUserId}
                    onToggleBookmark={onToggleBookmark}
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
