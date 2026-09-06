import React, { useEffect, useState } from 'react';
import api from '../../utils/api';
import { flexCol, textBodySoft, textLabelBold, textLabelXsBold } from '../../styles/style_config';
import Spinner from '../../components/ui/Spinner';

interface Gap {
  topic: string;
  summary: string;
  frequency: number;
  suggestedActions: string[];
}

interface Report {
  _id: string;
  dateRange: { start: string; end: string };
  gaps: Gap[];
  trendingTopics: string[];
  createdAt: string;
}

export default function AdminKnowledgeGaps() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = () => {
    setLoading(true);
    api.get('/admin/knowledge-gaps')
      .then(res => setReports(res.data.reports))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  const handleTriggerAnalysis = () => {
    setTriggering(true);
    api.post('/admin/knowledge-gaps/trigger')
      .then(() => {
        alert('Analysis triggered! It may take a minute. Check back soon.');
        fetchReports();
      })
      .catch(err => console.error(err))
      .finally(() => setTriggering(false));
  };

  return (
    <div className={`p-6 ${flexCol} gap-6 max-w-5xl mx-auto`}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Knowledge Gaps</h1>
          <p className={`mt-1 ${textBodySoft}`}>
            AI-driven analysis of unresolved questions and escalated community posts.
          </p>
        </div>
        <button
          onClick={handleTriggerAnalysis}
          disabled={triggering}
          className="px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {triggering ? 'Triggering...' : 'Run Analysis Now'}
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Spinner size="lg" /></div>
      ) : reports.length === 0 ? (
        <div className="py-20 text-center text-ink-soft border border-border border-dashed rounded-xl">
          No reports generated yet.
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {reports.map((report) => (
            <div key={report._id} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="bg-mist px-6 py-4 border-b border-border flex justify-between items-center">
                <span className={textLabelBold}>
                  Report from {new Date(report.dateRange.start).toLocaleDateString()} to {new Date(report.dateRange.end).toLocaleDateString()}
                </span>
                <span className="text-xs text-ink-faint">
                  Generated {new Date(report.createdAt).toLocaleString()}
                </span>
              </div>
              
              <div className="p-6 flex flex-col gap-6">
                {report.trendingTopics.length > 0 && (
                  <div>
                    <h3 className={`mb-3 ${textLabelXsBold} text-ink-soft uppercase tracking-wider`}>Trending Topics</h3>
                    <div className="flex flex-wrap gap-2">
                      {report.trendingTopics.map(topic => (
                        <span key={topic} className="px-3 py-1 bg-accent/10 text-accent rounded-full text-sm font-medium">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className={`mb-3 ${textLabelXsBold} text-ink-soft uppercase tracking-wider`}>Identified Gaps</h3>
                  {report.gaps.length === 0 ? (
                    <p className="text-sm text-ink-soft italic">No significant gaps identified in this period.</p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {report.gaps.map((gap, i) => (
                        <div key={i} className="border border-border/60 rounded-lg p-4 bg-mist/30">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-semibold text-ink">{gap.topic}</h4>
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                              {gap.frequency} mentions
                            </span>
                          </div>
                          <p className="text-sm text-ink-soft mb-3">{gap.summary}</p>
                          {gap.suggestedActions.length > 0 && (
                            <div className="bg-white/50 rounded-md p-3">
                              <p className="text-xs font-bold text-ink-faint mb-1 uppercase tracking-wide">Suggested Actions</p>
                              <ul className="list-disc list-inside text-sm text-ink">
                                {gap.suggestedActions.map((action, j) => (
                                  <li key={j}>{action}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
