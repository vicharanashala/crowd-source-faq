import React from 'react';
import { Activity, Search, ThumbsUp, ThumbsDown, Bookmark, MessageCircle, LogIn, Eye } from 'lucide-react';
import { useAnalytics } from '../../contexts/AnalyticsContext';

const actionIcons = {
  search: <Search size={12} />,
  like: <ThumbsUp size={12} />,
  dislike: <ThumbsDown size={12} />,
  bookmark: <Bookmark size={12} />,
  view_faq: <Eye size={12} />,
  login: <LogIn size={12} />,
  signup: <LogIn size={12} />,
  query: <MessageCircle size={12} />,
  feedback: <MessageCircle size={12} />,
};

const actionColors = {
  search: 'text-purple-500 bg-purple-50',
  like: 'text-green-500 bg-green-50',
  dislike: 'text-red-500 bg-red-50',
  bookmark: 'text-amber-500 bg-amber-50',
  view_faq: 'text-blue-500 bg-blue-50',
  login: 'text-teal-500 bg-teal-50',
  signup: 'text-cyan-500 bg-cyan-50',
  query: 'text-orange-500 bg-orange-50',
  feedback: 'text-pink-500 bg-pink-50',
};

function formatAction(activity) {
  const name = activity.userName || 'Someone';
  switch (activity.action) {
    case 'search': return `${name} searched "${activity.question || ''}"`;
    case 'like': return `${name} liked ${activity.question || activity.faqId}`;
    case 'dislike': return `${name} disliked ${activity.question || activity.faqId}`;
    case 'bookmark': return `${name} bookmarked ${activity.question || activity.faqId}`;
    case 'view_faq': return `${name} viewed ${activity.question || activity.faqId}`;
    case 'login': return `${name} logged in`;
    case 'signup': return `${name} created an account`;
    case 'query': return `${name} raised a query`;
    case 'feedback': return `${name} submitted feedback`;
    default: return `${name} performed ${activity.action}`;
  }
}

function timeAgo(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AdminRecentActivity() {
  const { analytics } = useAnalytics();
  const activities = analytics.recentActivities || [];

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={15} className="text-brand-400" />
        <h3 className="text-sm font-semibold text-slate-900">Recent Activity</h3>
        <span className="ml-auto text-[10px] text-slate-400">Live feed</span>
      </div>

      {activities.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">No activity yet.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {activities.map(a => {
            const colorClass = actionColors[a.action] || 'text-slate-500 bg-slate-50';
            return (
              <div key={a.id} className="flex items-start gap-2.5 text-xs">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                  {actionIcons[a.action] || <Activity size={12} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-700 leading-snug truncate">{formatAction(a)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(a.timestamp)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
