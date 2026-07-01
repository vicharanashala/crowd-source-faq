import React, { useEffect, useState } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import api, { friendlyError } from '../../utils/api';

interface HistoryModalProps {
  faqId: string;
  faqQuestion: string;
  onClose: () => void;
}

interface HistoryEntry {
  _id: string;
  action: string;
  changedBy?: { name?: string };
  changedAt: string;
  from?: string;
  to?: string;
}

export default function HistoryModal({ faqId, faqQuestion, onClose }: HistoryModalProps) {
  const [logs, setLogs] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useBodyScrollLock(true);

  useEffect(() => {
    let isMounted = true;
    api.get(`/faq/${faqId}/history`)
      .then((res) => {
        if (isMounted) setLogs(res.data.logs || []);
      })
      .catch((err) => {
        console.error(friendlyError(err, 'Failed to load history.'));
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, [faqId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl border border-border max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-ink">Verification History</h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink text-lg leading-none">&times;</button>
        </div>
        <p className="px-5 pt-3 text-xs text-ink-soft font-medium line-clamp-2 border-b border-border/50 pb-3">{faqQuestion}</p>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {loading ? (
            <p className="text-xs text-ink-faint text-center py-8">Loading...</p>
          ) : logs.length === 0 ? (
            <p className="text-xs text-ink-faint text-center py-8">No verification history found.</p>
          ) : (
            logs.map((entry) => (
              <div key={entry._id} className="flex items-start gap-3 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-ink font-medium">
                    {entry.action} {entry.to && <span className="text-accent">→ {entry.to}</span>}
                  </p>
                  {entry.changedBy && (
                    <p className="text-ink-faint text-[11px] mt-0.5">
                      by {entry.changedBy.name || 'System'} · {new Date(entry.changedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}