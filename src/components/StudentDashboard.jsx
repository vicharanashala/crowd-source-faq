import React from 'react';
import { motion } from 'framer-motion';
import { Bookmark, ThumbsUp, Search, Clock, HelpCircle, MessageCircle } from 'lucide-react';
import { useUserProfile } from '../contexts/UserProfileContext';
import { useAuth } from '../auth/AuthContext';
import { pageTransition } from '../lib/animations';
import { allQuestions } from '../data/faqData';

export default function StudentDashboard() {
  const { profile } = useUserProfile();
  const { currentUser } = useAuth();

  if (!profile) {
    return (
      <div className="min-h-screen pt-14 flex items-center justify-center">
        <p className="text-sm text-slate-500">Please log in to view your dashboard.</p>
      </div>
    );
  }

  const bookmarkedFAQs = profile.bookmarks.map(b => {
    const faq = allQuestions.find(q => q.id === b.faqId);
    return faq ? { ...faq, bookmarkedAt: b.timestamp } : null;
  }).filter(Boolean);

  const likedFAQs = profile.likes.map(l => {
    const faq = allQuestions.find(q => q.id === l.faqId);
    return faq ? { ...faq, likedAt: l.timestamp } : null;
  }).filter(Boolean);

  return (
    <motion.div className="min-h-screen pt-14 px-4 lg:px-8 py-6 max-w-5xl mx-auto" {...pageTransition}>
      <h2 className="font-display text-2xl font-bold text-slate-900 mb-1">My Dashboard</h2>
      <p className="text-sm text-slate-500 mb-6">Welcome back, {currentUser?.name}</p>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { icon: <Bookmark size={14} />, label: 'Bookmarks', value: profile.stats.bookmarkCount, color: 'text-amber-500' },
          { icon: <ThumbsUp size={14} />, label: 'Likes', value: profile.stats.likeCount, color: 'text-green-500' },
          { icon: <Search size={14} />, label: 'Searches', value: profile.stats.searchCount, color: 'text-purple-500' },
          { icon: <HelpCircle size={14} />, label: 'Queries', value: profile.stats.queryCount, color: 'text-orange-500' },
          { icon: <MessageCircle size={14} />, label: 'Feedback', value: profile.stats.feedbackCount, color: 'text-pink-500' },
          { icon: <Clock size={14} />, label: 'Dislikes', value: profile.stats.dislikeCount, color: 'text-red-500' },
        ].map(s => (
          <div key={s.label} className="glass-card p-3">
            <div className={`${s.color} mb-1`}>{s.icon}</div>
            <p className="text-lg font-bold text-slate-900">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bookmarked FAQs */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Bookmark size={14} className="text-amber-500" /> Bookmarked FAQs
          </h3>
          {bookmarkedFAQs.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No bookmarks yet. Save FAQs for quick access.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {bookmarkedFAQs.map(faq => (
                <div key={faq.id} className="bg-white/60 border border-slate-100 rounded-lg p-3">
                  <p className="text-xs font-medium text-slate-800 leading-snug">{faq.question}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{faq.categoryLabel}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Liked FAQs */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <ThumbsUp size={14} className="text-green-500" /> Liked FAQs
          </h3>
          {likedFAQs.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No liked FAQs yet.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {likedFAQs.map(faq => (
                <div key={faq.id} className="bg-white/60 border border-slate-100 rounded-lg p-3">
                  <p className="text-xs font-medium text-slate-800 leading-snug">{faq.question}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{faq.categoryLabel}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Searches */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Search size={14} className="text-purple-500" /> Recent Searches
          </h3>
          {profile.searchHistory.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No searches yet.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {profile.searchHistory.slice(0, 15).map(s => (
                <div key={s.id} className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-xs text-slate-700">{s.originalQuery}</span>
                  <span className="text-[10px] text-slate-400">{s.resultsCount} results</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My Queries */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <HelpCircle size={14} className="text-orange-500" /> My Queries
          </h3>
          {profile.questionsAsked.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No queries raised yet.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {profile.questionsAsked.map(q => (
                <div key={q.id} className="bg-white/60 border border-slate-100 rounded-lg p-3">
                  <p className="text-xs font-medium text-slate-800">{q.question}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${q.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                      {q.status}
                    </span>
                    <span className="text-[10px] text-slate-400">{q.category}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
