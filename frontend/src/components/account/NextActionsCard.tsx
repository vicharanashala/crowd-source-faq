import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';

interface UserStats {
  points: number;
  tier: string;
  positiveBadges: any[];
  questionsThisMonth: number;
  totalAnswers: number;
}

interface Action {
  title: string;
  detail: string;
  action: () => void;
}

export default function NextActionsCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserStats = async () => {
      if (!user?._id) {
        setLoading(false);
        return;
      }

      try {
        const res = await api.get('/auth/me/reputation');
        setUserStats({
          points: res.data.user.points,
          tier: res.data.user.tier,
          positiveBadges: res.data.user.positiveBadges || [],
          questionsThisMonth: res.data.contributions?.questionsThisMonth || 0,
          totalAnswers: res.data.contributions?.totalAnswers || 0,
        });
      } catch (error) {
        console.error('Failed to load user stats:', error);
        setUserStats({
          points: 0,
          tier: 'newcomer',
          positiveBadges: [],
          questionsThisMonth: 0,
          totalAnswers: 0,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchUserStats();
  }, [user]);

  const getPersonalizedActions = (): Action[] => {
    if (!userStats) return [];

    const actions: Action[] = [];

    // For new users (low points/tier)
    if (userStats.points < 50) {
      actions.push({
        title: 'Ask your first question',
        detail: 'Get started by asking the community for help.',
        action: () => navigate('/community')
      });
      actions.push({
        title: 'Browse popular FAQs',
        detail: 'Learn from frequently asked questions.',
        action: () => navigate('/faq')
      });
    }

    // For active users with some experience
    if (userStats.points >= 50 && userStats.totalAnswers < 5) {
      actions.push({
        title: 'Answer a question',
        detail: 'Share your expertise and earn more reputation.',
        action: () => navigate('/community')
      });
    }

    // For users without recent activity
    if (userStats.questionsThisMonth === 0) {
      actions.push({
        title: 'Explore new topics',
        detail: 'Discover fresh discussions and trending questions.',
        action: () => navigate('/community')
      });
    }

    // For users who haven't earned many badges
    if (userStats.positiveBadges.length < 3) {
      actions.push({
        title: 'Work towards your next badge',
        detail: 'Contribute more to earn recognition milestones.',
        action: () => navigate('/account/achievements')
      });
    }

    // General actions that are always helpful
    actions.push({
      title: 'Save useful knowledge',
      detail: 'Bookmark important posts for future reference.',
      action: () => navigate('/community')
    });

    // Return up to 3 most relevant actions
    return actions.slice(0, 3);
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
                <div className="h-2 bg-border rounded w-3/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const actions = getPersonalizedActions();

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Recommended next actions</h2>
          <p className="text-xs text-ink-faint mt-0.5">Personalized steps to keep your momentum going.</p>
        </div>
        <div className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
          Smart
        </div>
      </div>

      <div className="space-y-2">
        {actions.map((action) => (
          <div key={action.title} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-bg/70 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-ink">{action.title}</p>
              <p className="text-xs text-ink-faint">{action.detail}</p>
            </div>
            <button 
              onClick={action.action}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-ink hover:bg-accent/10 transition-colors"
            >
              Start
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
