import React from 'react';
import { BarChart3, AlertTriangle, TrendingUp, ThumbsDown, Users, Search, Bookmark, MessageCircle, ThumbsUp, FileText } from 'lucide-react';
import { useAnalytics } from '../../contexts/AnalyticsContext';

const cards = [
  { key: 'totalUsers', label: 'Total Users', icon: <Users size={14} />, color: 'text-blue-400' },
  { key: 'totalSearches', label: 'Total Searches', icon: <Search size={14} />, color: 'text-purple-400' },
  { key: 'todaySearches', label: "Today's Searches", icon: <TrendingUp size={14} />, color: 'text-green-400' },
  { key: 'activeStudents', label: 'Active Students', icon: <Users size={14} />, color: 'text-cyan-400' },
  { key: 'totalFAQs', label: 'FAQs', icon: <FileText size={14} />, color: 'text-brand-400' },
  { key: 'totalLikes', label: 'Likes', icon: <ThumbsUp size={14} />, color: 'text-green-400' },
  { key: 'totalDislikes', label: 'Dislikes', icon: <ThumbsDown size={14} />, color: 'text-orange-400' },
  { key: 'totalBookmarks', label: 'Bookmarks', icon: <Bookmark size={14} />, color: 'text-amber-400' },
  { key: 'totalQueries', label: 'Queries', icon: <MessageCircle size={14} />, color: 'text-red-400' },
];

export default function AdminOverviewCards() {
  const { analytics } = useAnalytics();

  return (
    <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map(card => (
        <div key={card.key} className="glass-card p-3">
          <div className={`${card.color} mb-1.5`}>{card.icon}</div>
          <p className="text-xl font-display font-bold text-slate-900">
            {(analytics[card.key] ?? 0).toLocaleString()}
          </p>
          <p className="text-xs text-slate-500">{card.label}</p>
        </div>
      ))}
    </div>
  );
}
