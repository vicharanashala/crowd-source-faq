/**
 * useLearningJourney — data for the "My Learning Journey" dashboard.
 *
 * ── BACKEND WIRING NEEDED ──────────────────────────────────────────────
 * There is no dedicated dashboard-summary endpoint yet. Point this at
 * your real one when it exists — the shape below (LearningJourneyData)
 * is what the page expects. Until then this hook returns clearly-marked
 * mock data so the UI/animations are fully demoable.
 *
 * Known real pieces you already have and can wire in immediately:
 *   - spurtiPoints: GET /api/faq/escalation-status -> { sp }
 *     (see hooks/useEscalationStatus.ts for the existing client call)
 *   - user name/avatar: useAuth().user
 * Still needed from backend:
 *   - modulesCompleted / modulesTotal
 *   - recentActivity[]
 * ────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import api, { friendlyError } from '../utils/api';

export interface ActivityItem {
  id: string;
  label: string;
  detail?: string;
  timestamp: string;
  icon: 'helpful' | 'faq' | 'golden' | 'badge' | 'module';
}

export interface LearningJourneyData {
  modulesCompleted: number;
  modulesTotal: number;
  spurtiPoints: number;
  recentActivity: ActivityItem[];
}

const MOCK_DATA: LearningJourneyData = {
  modulesCompleted: 14,
  modulesTotal: 20,
  spurtiPoints: 240,
  recentActivity: [
    { id: '1', label: 'Completed "React Hooks Deep Dive"', timestamp: new Date().toISOString(), icon: 'module' },
    { id: '2', label: 'Marked an FAQ as helpful', timestamp: new Date(Date.now() - 3600_000).toISOString(), icon: 'helpful' },
    { id: '3', label: 'Earned the "Helper" badge', timestamp: new Date(Date.now() - 86400_000).toISOString(), icon: 'badge' },
    { id: '4', label: 'Used a Golden Ticket to escalate a question', timestamp: new Date(Date.now() - 2 * 86400_000).toISOString(), icon: 'golden' },
    { id: '5', label: 'Submitted a new FAQ suggestion', timestamp: new Date(Date.now() - 4 * 86400_000).toISOString(), icon: 'faq' },
  ],
};

export function useLearningJourney() {
  const [data, setData] = useState<LearningJourneyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // ── Plug in your real dashboard-summary endpoint here ──
      // const res = await api.get<LearningJourneyData>('/users/me/learning-journey');
      // setData(res.data);

      // Meanwhile, pull in the one real piece we already have (SP balance)
      // and layer it over the mock so at least that stat is live.
      const escalation = await api.get<{ sp: number }>('/faq/escalation-status').catch(() => null);
      setData({
        ...MOCK_DATA,
        spurtiPoints: escalation?.data.sp ?? MOCK_DATA.spurtiPoints,
      });
    } catch (err) {
      setError(friendlyError(err, 'Could not load your learning journey.'));
      setData(MOCK_DATA);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
