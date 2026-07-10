import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import api from '../../utils/api';

interface ContributionData {
  questionsThisMonth: number;
  totalQuestions: number;
  totalAnswers: number;
  reputation: number;
}

export default function ContributionSummaryCard() {
  const { user } = useAuth();
  const [contributions, setContributions] = useState<ContributionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchContributions = async () => {
      if (!user?._id) {
        setLoading(false);
        return;
      }

      try {
        const res = await api.get('/auth/me/reputation');
        setContributions(res.data.contributions);
      } catch (error) {
        console.error('Failed to load contributions:', error);
        // Fallback to default values on error
        setContributions({
          questionsThisMonth: 0,
          totalQuestions: 0,
          totalAnswers: 0,
          reputation: 0
        });
      } finally {
        setLoading(false);
      }
    };

    fetchContributions();
  }, [user]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
        <div className="animate-pulse">
          <div className="h-4 bg-border rounded mb-2"></div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-border/70 bg-bg/70 p-3">
                <div className="h-3 bg-border rounded mb-2"></div>
                <div className="h-6 bg-border rounded mb-2"></div>
                <div className="h-3 bg-border rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const summaryItems = [
    { 
      label: 'Questions', 
      value: contributions?.questionsThisMonth?.toString() || '0', 
      detail: 'Asked this month' 
    },
    { 
      label: 'Answers', 
      value: contributions?.totalAnswers?.toString() || '0', 
      detail: 'Shared so far' 
    },
    { 
      label: 'Reputation', 
      value: contributions?.reputation ? (contributions.reputation >= 1000 ? 
        `${(contributions.reputation / 1000).toFixed(1)}k` : 
        contributions.reputation.toString()) : '0', 
      detail: 'Growing steadily' 
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Contribution summary</h2>
          <p className="text-xs text-ink-faint mt-0.5">A quick view of your recent momentum.</p>
        </div>
        <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          {contributions && (contributions.questionsThisMonth > 0 || contributions.totalAnswers > 0) ? 'Active' : 'Getting started'}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {summaryItems.map((item) => (
          <div key={item.label} className="rounded-2xl border border-border/70 bg-bg/70 p-3">
            <p className="text-xs text-ink-faint">{item.label}</p>
            <p className="mt-2 text-xl font-semibold text-ink">{item.value}</p>
            <p className="mt-1 text-[11px] text-ink-faint">{item.detail}</p>
          </div>
        ))}
      </div>

      <Link
        to="/account/achievements"
        className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent/80 transition-colors"
      >
        <span>View achievements</span>
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
