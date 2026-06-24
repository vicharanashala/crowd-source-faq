import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ThumbsUp, ThumbsDown, Tag, Bookmark } from 'lucide-react';
import { urgencyColors, getRelatedQuestions, faqData } from '../data/faqData';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { useFAQInteractions } from '../contexts/FAQInteractionContext';
import { TiltCard } from './ui/Interactions';
import { useToast } from './ui/Toast';
import { accordionContent } from '../lib/animations';

const urgencyDotClass = {
  critical: 'bg-red-500',
  high:     'bg-orange-400',
  medium:   'bg-yellow-400',
  low:      'bg-green-500',
};

const urgencyBadge = {
  critical: 'bg-red-100 text-red-700 border border-red-200',
  high:     'bg-orange-100 text-orange-700 border border-orange-200',
  medium:   'bg-yellow-100 text-yellow-700 border border-yellow-200',
  low:      'bg-green-100 text-green-700 border border-green-200',
};

function getCategoryForFAQ(faqId) {
  for (const cat of faqData) {
    if (cat.questions.some(q => q.id === faqId)) {
      return cat.category;
    }
  }
  return '';
}

export default function FAQCard({ question, onVote, onRelatedClick, onOpen }) {
  const [expanded, setExpanded] = useState(false);
  const [votePop, setVotePop] = useState(null);
  const [sparkle, setSparkle] = useState(false);
  const related = getRelatedQuestions ? getRelatedQuestions(question.id) : [];
  const guard = useRequireAuth();
  const { showToast } = useToast();
  const { likeFAQ, dislikeFAQ, bookmarkFAQ, unbookmarkFAQ, viewFAQ, getUserVote, isBookmarked } = useFAQInteractions();
  const upRef = useRef(null);

  const category = getCategoryForFAQ(question.id);
  const userVote = getUserVote(question.id);
  const bookmarked = isBookmarked(question.id);

  const handleToggle = () => {
    if (!expanded) {
      onOpen?.(question.id);
      // Record view via context
      guard(() => {
        viewFAQ(question.id, category, question.question);
      });
    }
    setExpanded(prev => !prev);
  };

  const handleVote = (direction) => {
    guard(() => {
      if (direction === 'up') {
        likeFAQ(question.id, category, question.question);
      } else {
        dislikeFAQ(question.id, category, question.question);
      }
      onVote(question.id, direction);
      setVotePop(direction);
      if (direction === 'up') {
        setSparkle(true);
        setTimeout(() => setSparkle(false), 500);
      }
      showToast('Feedback Submitted');
      setTimeout(() => setVotePop(null), 300);
    });
  };

  const handleBookmark = () => {
    guard(() => {
      if (bookmarked) {
        unbookmarkFAQ(question.id);
        showToast('Bookmark Removed');
      } else {
        bookmarkFAQ(question.id, category, question.question);
        showToast('FAQ Bookmarked');
      }
    });
  };

  return (
    <TiltCard className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm font-sans" intensity={2} liftY={-4}>
      {/* Header — always visible */}
      <div
        className="px-4 py-3.5 cursor-pointer hover:bg-slate-50/60 transition-colors"
        onClick={handleToggle}
      >
        <div className="flex items-start gap-3">
          <div className={`mt-[7px] w-2 h-2 rounded-full flex-shrink-0 ${urgencyDotClass[question.urgency] || 'bg-slate-400'}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-900 leading-snug">{question.question}</p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${urgencyBadge[question.urgency] || urgencyBadge.low}`}>
                  {question.urgency}
                </span>
                {/* WOW 7: Arrow rotates smoothly */}
                <motion.div
                  animate={{ rotate: expanded ? 180 : 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <ChevronDown size={14} className="text-slate-400" />
                </motion.div>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-[11px] text-slate-500 font-normal">{question.clicks?.toLocaleString()} views</span>
              <span className="text-slate-300">·</span>
              <span className="text-[11px] text-green-600 font-normal">👍 {question.thumbsUp}</span>
              <span className="text-[11px] text-red-500 font-normal">👎 {question.thumbsDown}</span>
            </div>
          </div>
        </div>
      </div>

      {/* WOW 7: Buttery smooth accordion */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            variants={accordionContent}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-slate-100">
              <div className="ml-5 pt-3">
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.35 }}
                  className="text-sm text-slate-700 leading-relaxed mb-4"
                >
                  {question.answer}
                </motion.p>

                {question.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {question.tags.map(tag => (
                      <span key={tag} className="flex items-center gap-1 text-[11px] text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full font-normal">
                        <Tag size={9} />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* WOW 14: Vote feedback + Bookmark */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs text-slate-500 font-medium">Was this helpful?</span>
                  <div className="relative" ref={upRef}>
                    <button
                      onClick={() => handleVote('up')}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all font-medium ${
                        votePop === 'up' ? 'vote-pop' : ''
                      } ${
                        userVote === 'like'
                          ? 'bg-green-100 text-green-700 border-green-300'
                          : 'text-slate-600 border-slate-300 hover:border-green-400 hover:text-green-700 bg-white'
                      }`}
                    >
                      <ThumbsUp size={11} />
                      Yes {userVote === 'like' ? '✓' : ''}
                    </button>
                    {/* Golden sparkle burst */}
                    {sparkle && <span className="sparkle-burst" style={{ top: -4, right: -4 }} />}
                  </div>
                  <button
                    onClick={() => handleVote('down')}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all font-medium ${
                      votePop === 'down' ? 'vote-press-down' : ''
                    } ${
                      userVote === 'dislike'
                        ? 'bg-red-100 text-red-700 border-red-300'
                        : 'text-slate-600 border-slate-300 hover:border-red-400 hover:text-red-700 bg-white'
                    }`}
                  >
                    <ThumbsDown size={11} />
                    No {userVote === 'dislike' ? '(flagged)' : ''}
                  </button>

                  {/* Bookmark button */}
                  <button
                    onClick={handleBookmark}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all font-medium ml-auto ${
                      bookmarked
                        ? 'bg-amber-100 text-amber-700 border-amber-300'
                        : 'text-slate-600 border-slate-300 hover:border-amber-400 hover:text-amber-700 bg-white'
                    }`}
                  >
                    <Bookmark size={11} fill={bookmarked ? 'currentColor' : 'none'} />
                    {bookmarked ? 'Saved' : 'Save'}
                  </button>
                </div>

                {related.length > 0 && (
                  <div className="border-t border-slate-200 pt-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">You may also need:</p>
                    <div className="space-y-1.5">
                      {related.map(r => (
                        <button
                          key={r.id}
                          onClick={() => onRelatedClick(r)}
                          className="w-full text-left flex items-center gap-2 text-xs text-slate-600 hover:text-amber-700 transition-colors group"
                        >
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${urgencyDotClass[r.urgency] || 'bg-slate-400'}`} />
                          <span className="truncate group-hover:underline underline-offset-2 font-normal">{r.question}</span>
                          <span className="text-slate-400 flex-shrink-0 text-[11px] font-normal">{r.categoryLabel}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </TiltCard>
  );
}
