import React, { useState } from 'react';
import AdminZoomTab from '../components/welcome/AdminZoomTab';
import SessionHistoryPanel from '../components/welcome/SessionHistoryPanel';
import SessionTimeline from '../components/welcome/SessionTimeline';
import { useCurrentProgramId } from '../../hooks/useProgramScopedApi';

export default function AdminZoomAssessmentsPage() {
  const activeProgramId = useCurrentProgramId();
  // v1.69 — Session History: tracks the row selected in the new
  // History panel so the existing detail editor below can show
  // the matching session. We deliberately don't drive
  // AdminZoomTab's internal selection state — the panel and the
  // tab both stay standalone. The History panel + Timeline below
  // are pure additions; everything AdminZoomTab renders
  // continues to work unchanged.
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);

  const handleActivate = async (sessionId: string): Promise<void> => {
    try {
      // The activate endpoint is unchanged; we forward the existing
      // contract. The History panel + Timeline will re-fetch
      // automatically because `refreshKey` changes.
      await (await import('../utils/adminApi')).default.post(
        `/admin/welcome/zoom-sessions/${sessionId}/activate`,
      );
    } catch (err) {
      // Soft-fail — the existing detail editor's alert flow
      // stays the source of truth for activation errors. This
      // entry point just gives the admin a quick action.
      console.warn('[zoom-history] activate failed:', err);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Zoom Assessments</h1>
          <p className="text-sm text-ink-faint mt-1">
            Manage onboarding assessments, transcripts, question pools, passing rules, attempt resets, and Zoom session access.
          </p>
        </div>
      </div>

      {/* v1.69 — Session History: every session ever created, with
          title / batch / created / meeting / status / attempts /
          pass rate / pool. Click a row to open it below. */}
      <SessionHistoryPanel
        onSelect={setFocusedSessionId}
        selectedId={focusedSessionId}
        refreshKey={activeProgramId ?? 'no-program'}
      />

      {/* v1.69 — Per-session Activity Log: visible when an admin
          has picked a session from the History panel above. The
          panel polls the new activity endpoint and re-renders on
          program switch via the refreshKey prop. */}
      {focusedSessionId && (
        <SessionTimeline
          sessionId={focusedSessionId}
          isActive={false /* re-render via refreshKey after activate */}
          onActivate={handleActivate}
          refreshKey={activeProgramId ?? 'no-program'}
        />
      )}

      {/* Existing detail editor — untouched. Still manages its own
          session selection and editing flow exactly as before. */}
      <AdminZoomTab mode="assessments" />
    </div>
  );
}
