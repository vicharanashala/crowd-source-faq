import React from 'react';
import AdminZoomTab from '../components/welcome/AdminZoomTab';

export default function AdminZoomQuestionsPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Zoom Questions</h1>
          <p className="text-sm text-ink-faint mt-1">
            Manage assessment questions, manual additions, inline edits, and the question pool list.
          </p>
        </div>
      </div>

      <AdminZoomTab mode="questions" />
    </div>
  );
}
