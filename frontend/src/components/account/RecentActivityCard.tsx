import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import api from '../../utils/api';

interface ReputationLog {
  _id: string;
  action: string;
  delta: number;
  reason: string;
  createdAt: string;
}

export default function RecentActivityCard() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ReputationLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivities = async () => {
      if (!user?._id) {
        setLoading(false);
        return;
      }

      try {
        const res = await api.get('/auth/me/reputation');
        // Get the first 3 most recent activities
        setActivities(res.data.logs.slice(0, 3));
      } catch (error) {
        console.error('Failed to load activities:', error);
        setActivities([]);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, [user]);

  const formatActivity = (log: ReputationLog) => {
    const action = log.action;
    const delta = log.delta;
    
    switch (action) {
      case 'faq_post':
        return 'Posted a new FAQ';
      case 'faq_approved':
        return 'FAQ was approved by moderators';
      case 'faq_helpful':
        return 'FAQ received helpful votes';
      case 'answer_accepted':
        return 'Answer was accepted as helpful';
      case 'upvote_received':
        return 'Received upvotes on content';
      case 'report_valid':
        return 'Submitted a valid report';
      case 'badge_awarded':
        return 'Earned a new badge';
      case 'faq_converted':
        return 'Question converted to FAQ';
      case 'faq_answer_used':
        return 'Answer featured in FAQ';
      case 'admin_approval_bonus':
        return 'Received admin approval bonus';
      case 'admin_point_award':
        return 'Received points from admin';
      default:
        return log.reason || 'Community activity';
    }
  };

  const getTimeAgo = (dateString: string) => {
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return past.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
        <div className="animate-pulse">
          <div className="h-4 bg-border rounded mb-2"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-border/70 bg-bg/70 px-3 py-3">
                <div className="h-3 bg-border rounded mb-1"></div>
                <div className="h-2 bg-border rounded w-1/4 ml-auto"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
          <p className="text-xs text-ink-faint mt-0.5">Your latest actions in the community.</p>
        </div>
        <div className="rounded-full bg-border/70 px-2.5 py-1 text-[11px] font-semibold text-ink-faint">
          {activities.length > 0 ? 'Live feed' : 'No activity'}
        </div>
      </div>

      <div className="space-y-2">
        {activities.length > 0 ? (
          activities.map((activity) => (
            <div key={activity._id} className="flex items-center justify-between rounded-2xl border border-border/70 bg-bg/70 px-3 py-3">
              <p className="text-sm font-medium text-ink">{formatActivity(activity)}</p>
              <span className="text-xs text-ink-faint whitespace-nowrap">{getTimeAgo(activity.createdAt)}</span>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-border/70 bg-bg/70 px-3 py-3 text-center">
            <p className="text-sm text-ink-faint">No recent activity</p>
            <p className="text-xs text-ink-faint mt-1">Start participating to see your activity here</p>
          </div>
        )}
      </div>
    </div>
  );
}
