import React, { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import adminApi from '../../utils/adminApi';
import { diffLines, type DiffLine } from '../../utils/diffUtils';

interface FAQ {
  _id: string;
  question: string;
  answer: string;
  category: string;
  batchId?: string | null;
  status: string;
  createdAt: string;
}

interface FaqVersion {
  _id: string;
  faqId: string;
  versionNumber: number;
  question: string;
  answer: string;
  tags: string[];
  category: string;
  editedBy: { _id: string; name: string };
  editedAt: string;
  changeSummary: string;
  batchId: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  faq: FAQ | null;
  onRollbackSuccess: () => void;
}

export default function FaqVersionHistoryModal({ open, onClose, faq, onRollbackSuccess }: Props) {
  const [versions, setVersions] = useState<FaqVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVersionNum, setSelectedVersionNum] = useState<number | null>(null);
  const [selectedVersionData, setSelectedVersionData] = useState<FaqVersion | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rollbackReason, setRollbackReason] = useState('');
  const [showConfirmRollback, setShowConfirmRollback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch version list on open
  useEffect(() => {
    if (open && faq) {
      setLoading(true);
      setError(null);
      setSelectedVersionNum(null);
      setSelectedVersionData(null);
      adminApi.get<{ success: boolean; versions: FaqVersion[] }>(`/faq/${faq._id}/versions`)
        .then((res) => {
          if (res.data.success) {
            setVersions(res.data.versions);
            // Default to showing the oldest previous version or version 1 if available
            if (res.data.versions.length > 1) {
              // Select the version before the latest one (which is index 1 since they are sorted desc)
              setSelectedVersionNum(res.data.versions[1].versionNumber);
            } else if (res.data.versions.length === 1) {
              setSelectedVersionNum(res.data.versions[0].versionNumber);
            }
          } else {
            setError('Failed to fetch versions');
          }
        })
        .catch(() => setError('Failed to load version history.'))
        .finally(() => setLoading(false));
    }
  }, [open, faq]);

  // Fetch version snapshot detail on select
  useEffect(() => {
    if (faq && selectedVersionNum !== null) {
      setLoadingDetail(true);
      adminApi.get<{ success: boolean; version: FaqVersion }>(`/faq/${faq._id}/versions/${selectedVersionNum}`)
        .then((res) => {
          if (res.data.success) {
            setSelectedVersionData(res.data.version);
          }
        })
        .catch(() => setError('Failed to load version details.'))
        .finally(() => setLoadingDetail(false));
    }
  }, [selectedVersionNum, faq]);

  const handleRollback = () => {
    if (!faq || selectedVersionNum === null) return;
    setRollbackLoading(true);
    adminApi.post<{ success: boolean; message: string }>(`/faq/${faq._id}/rollback/${selectedVersionNum}`, {
      changeSummary: rollbackReason || `Rollback to Version ${selectedVersionNum}`,
    })
      .then((res) => {
        if (res.data.success) {
          setShowConfirmRollback(false);
          setRollbackReason('');
          onRollbackSuccess();
          onClose();
        }
      })
      .catch((err) => {
        const msg = err.response?.data?.message || 'Rollback failed.';
        alert(msg);
      })
      .finally(() => setRollbackLoading(false));
  };

  const getDiffMarkup = (diffs: DiffLine[]) => {
    return diffs.map((line, idx) => {
      if (line.type === 'removed') {
        return (
          <div key={idx} className="bg-red-500/10 text-red-700 line-through px-2 py-0.5 font-mono text-xs select-none">
            - {line.value}
          </div>
        );
      }
      if (line.type === 'added') {
        return (
          <div key={idx} className="bg-emerald-500/10 text-emerald-700 px-2 py-0.5 font-mono text-xs select-none">
            + {line.value}
          </div>
        );
      }
      return (
        <div key={idx} className="px-2 py-0.5 font-mono text-xs text-ink-soft whitespace-pre-wrap">
          &nbsp;&nbsp;{line.value}
        </div>
      );
    });
  };

  const questionDiffs = selectedVersionData && faq
    ? diffLines(selectedVersionData.question, faq.question)
    : [];

  const answerDiffs = selectedVersionData && faq
    ? diffLines(selectedVersionData.answer, faq.answer)
    : [];

  const isCurrentActive = selectedVersionData && faq &&
    (selectedVersionNum === versions[0]?.versionNumber);

  return (
    <Modal open={open} onClose={onClose} title="FAQ Revision History" maxWidth="max-w-5xl">
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-2 text-ink-faint">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeDasharray="40"/><path d="M12 2v4"/></svg>
          <span className="text-xs">Loading revision history...</span>
        </div>
      ) : error ? (
        <div className="text-center py-8 text-danger text-xs">{error}</div>
      ) : (
        <div className="flex gap-6 h-[500px]">
          {/* Left Panel: Timeline */}
          <div className="w-1/3 border-r border-border pr-4 overflow-y-auto flex flex-col h-full">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-faint mb-3">Revisions</h3>
            <div className="space-y-2 flex-1">
              {versions.map((ver, index) => {
                const isSelected = selectedVersionNum === ver.versionNumber;
                const isLatest = index === 0;
                return (
                  <button
                    key={ver._id}
                    onClick={() => setSelectedVersionNum(ver.versionNumber)}
                    className={`w-full text-left p-3 rounded-lg border text-xs transition-all relative ${
                      isSelected
                        ? 'border-accent bg-accent/5 ring-1 ring-accent'
                        : 'border-border bg-card hover:bg-mist'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-ink">
                        Version {ver.versionNumber} {isLatest && <span className="text-[10px] ml-1 px-1.5 py-0.2 rounded bg-success/15 text-success font-medium">Active</span>}
                      </span>
                      <span className="text-[10px] text-ink-faint">
                        {new Date(ver.editedAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-ink-soft font-medium truncate mb-1" title={ver.changeSummary}>
                      {ver.changeSummary}
                    </p>
                    <p className="text-[10px] text-ink-faint">
                      by {ver.editedBy?.name || 'System'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Diff Comparison */}
          <div className="w-2/3 flex flex-col h-full">
            {selectedVersionNum === null ? (
              <div className="flex-1 flex items-center justify-center text-xs text-ink-faint">
                Select a version on the left to view diff comparison.
              </div>
            ) : loadingDetail ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-2 text-ink-faint">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeDasharray="40"/><path d="M12 2v4"/></svg>
                <span className="text-xs">Loading diff snapshot...</span>
              </div>
            ) : selectedVersionData ? (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Diff Toolbar */}
                <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
                  <div>
                    <h4 className="text-xs font-semibold text-ink">
                      Comparing Version {selectedVersionNum} vs. Current Active
                    </h4>
                    <p className="text-[10px] text-ink-faint mt-0.5">
                      Deleted lines are shown in <span className="text-danger font-semibold">red</span>, new lines in <span className="text-success font-semibold">green</span>.
                    </p>
                  </div>
                  {!isCurrentActive && (
                    <button
                      onClick={() => setShowConfirmRollback(true)}
                      className="px-3 py-1.5 bg-accent text-white font-medium text-xs rounded-md shadow-sm hover:bg-accent-bright transition-colors"
                    >
                      Restore this version
                    </button>
                  )}
                </div>

                {/* Diff Content Scroll Area */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                  {/* Question Diff */}
                  <div>
                    <h5 className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint mb-2">Question Diff</h5>
                    <div className="border border-border rounded-lg overflow-hidden bg-bg-secondary divide-y divide-border/50 py-1">
                      {getDiffMarkup(questionDiffs)}
                    </div>
                  </div>

                  {/* Answer Diff */}
                  <div>
                    <h5 className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint mb-2">Answer Diff</h5>
                    <div className="border border-border rounded-lg overflow-hidden bg-bg-secondary divide-y divide-border/50 py-1">
                      {getDiffMarkup(answerDiffs)}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Confirmation Drawer/Modal for Rollback */}
      {showConfirmRollback && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-bg-secondary border border-border rounded-xl p-5 shadow-2xl space-y-4">
            <h3 className="text-sm font-semibold text-ink">Confirm Rollback</h3>
            <p className="text-xs text-ink-soft leading-relaxed">
              Are you sure you want to revert this FAQ to <strong>Version {selectedVersionNum}</strong>? This action will overwrite the current live question and answer.
            </p>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Reason for rollback (optional)</label>
              <input
                type="text"
                placeholder="e.g. Formatting issues in latest version"
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-card text-xs text-ink outline-none focus:border-accent transition-colors"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowConfirmRollback(false);
                  setRollbackReason('');
                }}
                className="px-3 py-1.5 border border-border text-ink hover:bg-mist text-xs font-medium rounded-lg transition-colors"
                disabled={rollbackLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleRollback}
                className="px-3 py-1.5 bg-danger text-white hover:bg-danger-bright text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                disabled={rollbackLoading}
              >
                {rollbackLoading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeDasharray="30"/><path d="M12 2v3"/></svg>
                    Restoring...
                  </>
                ) : (
                  'Confirm Restore'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
