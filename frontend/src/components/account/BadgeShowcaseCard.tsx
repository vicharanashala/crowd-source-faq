import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import api from '../../utils/api';

interface Badge {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  type: string;
  awardedAt: string;
  reason?: string;
}

export default function BadgeShowcaseCard() {
  const { user } = useAuth();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBadges = async () => {
      if (!user?._id) {
        setLoading(false);
        return;
      }

      try {
        const res = await api.get('/auth/me/reputation');
        // Get first 3 positive badges for showcase
        const positiveBadges = res.data.user.positiveBadges || [];
        setBadges(positiveBadges.slice(0, 3));
      } catch (error) {
        console.error('Failed to load badges:', error);
        setBadges([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBadges();
  }, [user]);

  const getBadgeColorClass = (index: number) => {
    const colors = [
      'bg-emerald-50 text-emerald-700',
      'bg-sky-50 text-sky-700', 
      'bg-amber-50 text-amber-700',
      'bg-purple-50 text-purple-700',
      'bg-pink-50 text-pink-700',
    ];
    return colors[index % colors.length];
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
        <div className="animate-pulse">
          <div className="h-4 bg-border rounded mb-2"></div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-border/70 bg-bg/70 p-3">
                <div className="h-5 bg-border rounded mb-2"></div>
                <div className="h-3 bg-border rounded"></div>
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
          <h2 className="text-sm font-semibold text-ink">Badge showcase</h2>
          <p className="text-xs text-ink-faint mt-0.5">Your recognition milestones at a glance.</p>
        </div>
        <div className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">
          {badges.length} earned
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {badges.length > 0 ? (
          badges.map((badge, index) => (
            <div key={badge.id} className="rounded-2xl border border-border/70 bg-bg/70 p-3">
              <div className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${getBadgeColorClass(index)}`}>
                <span className="mr-1">{badge.icon}</span>
                {badge.name}
              </div>
              <p className="mt-3 text-sm text-ink">{badge.description}</p>
              <p className="mt-1 text-xs text-ink-faint">
                Earned {new Date(badge.awardedAt).toLocaleDateString()}
              </p>
            </div>
          ))
        ) : (
          <div className="col-span-full rounded-2xl border border-border/70 bg-bg/70 p-4 text-center">
            <p className="text-sm text-ink-faint">No badges earned yet</p>
            <p className="text-xs text-ink-faint mt-1">Keep participating to earn your first badges!</p>
          </div>
        )}
      </div>
    </div>
  );
}
