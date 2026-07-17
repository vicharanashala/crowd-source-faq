import React, { useState, useEffect } from 'react';
import adminApi from '../utils/adminApi';
import {
  surfaceCardPadded,
  textLabelBold,
  textBodySoft,
  flexCol,
  flexRowBetween,
  flexRow,
  textNumeric,
} from '../../styles/style_config';

interface SummaryData {
  totalFaqs: number;
  totalFeedback: number;
  helpfulCount: number;
  notHelpfulCount: number;
  helpfulRate: number;
}

interface FaqMetric {
  _id: string;
  question: string;
  guestViewCount?: number;
  unhelpfulVotes?: number;
}

interface FeedbackComment {
  _id: string;
  comments: string;
  reason: string;
  createdAt: string;
  isHelpful: boolean;
  faqId: {
    _id: string;
    question: string;
  };
}

export default function AdminFaqAnalytics() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [mostViewed, setMostViewed] = useState<FaqMetric[]>([]);
  const [needsImprovement, setNeedsImprovement] = useState<FaqMetric[]>([]);
  const [recentComments, setRecentComments] = useState<FeedbackComment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const [sumRes, viewedRes, needsRes, commentsRes] = await Promise.all([
          adminApi.get('/admin/faq-analytics/summary'),
          adminApi.get('/admin/faq-analytics/most-viewed'),
          adminApi.get('/admin/faq-analytics/needs-improvement'),
          adminApi.get('/admin/faq-analytics/recent-comments'),
        ]);

        setSummary(sumRes.data);
        setMostViewed(viewedRes.data);
        setNeedsImprovement(needsRes.data);
        setRecentComments(commentsRes.data);
      } catch (err) {
        console.error('Failed to load FAQ analytics', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-ink-soft">Loading analytics...</div>;
  }

  return (
    <div className={`p-8 max-w-6xl mx-auto ${flexCol} gap-8`}>
      <div>
        <h1 className="text-2xl font-bold text-ink mb-1">FAQ Analytics</h1>
        <p className="text-sm text-ink-soft mb-6">Insights from user feedback and engagement metrics.</p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard title="Total FAQs" value={summary.totalFaqs} />
          <StatCard title="Total Feedback" value={summary.totalFeedback} />
          <StatCard title="Helpful" value={summary.helpfulCount} className="text-emerald-600" />
          <StatCard title="Not Helpful" value={summary.notHelpfulCount} className="text-rose-600" />
          <StatCard title="Helpful Rate" value={`${summary.helpfulRate}%`} />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        <div className={flexCol + " gap-4"}>
          <div className={surfaceCardPadded}>
            <h3 className={textLabelBold + " mb-4"}>🔥 Most Viewed FAQs</h3>
            {mostViewed.length === 0 ? (
              <p className={textBodySoft}>No data available.</p>
            ) : (
              <div className="divide-y divide-border">
                {mostViewed.map(faq => (
                  <div key={faq._id} className={`${flexRowBetween} py-3`}>
                    <p className="text-sm font-medium text-ink truncate mr-4">{faq.question}</p>
                    <span className={`text-xs font-semibold text-ink-soft whitespace-nowrap ${textNumeric}`}>
                      {faq.guestViewCount || 0} Views
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={surfaceCardPadded}>
            <h3 className={textLabelBold + " mb-4"}>👎 FAQs Needing Improvement</h3>
            {needsImprovement.length === 0 ? (
              <p className={textBodySoft}>No data available.</p>
            ) : (
              <div className="divide-y divide-border">
                {needsImprovement.map(faq => (
                  <div key={faq._id} className={`${flexRowBetween} py-3`}>
                    <p className="text-sm font-medium text-ink truncate mr-4">{faq.question}</p>
                    <span className="text-xs font-semibold text-rose-500 whitespace-nowrap">
                      {faq.unhelpfulVotes || 0} Not Helpful Votes
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={surfaceCardPadded}>
          <h3 className={textLabelBold + " mb-4"}>Recent Comments</h3>
          {recentComments.length === 0 ? (
            <p className={textBodySoft}>No recent comments.</p>
          ) : (
            <div className="divide-y divide-border">
              {recentComments.map(comment => (
                <div key={comment._id} className="py-4 flex flex-col gap-1">
                  <div className={flexRowBetween}>
                    <span className="text-xs font-semibold text-ink-soft">
                      {comment.isHelpful ? '👍 Helpful' : '👎 Not Helpful'} 
                      {comment.reason && ` • ${comment.reason}`}
                    </span>
                    <span className="text-[10px] text-ink-faint">
                      {new Date(comment.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-ink line-clamp-1 opacity-70">
                    Q: {comment.faqId?.question || 'Unknown FAQ'}
                  </p>
                  <p className="text-sm text-ink bg-card p-3 rounded-lg border border-border mt-1">
                    "{comment.comments}"
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, className = '' }: { title: string; value: string | number; className?: string }) {
  return (
    <div className={`${surfaceCardPadded} ${flexCol} justify-center border-border`}>
      <p className="text-xs font-semibold text-ink-soft mb-1">{title}</p>
      <p className={`text-2xl font-bold ${textNumeric} ${className || 'text-ink'}`}>{value}</p>
    </div>
  );
}
