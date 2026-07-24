import React, { useState } from 'react';
import api from '../../utils/api';
import { FAQItem } from './faqUtils';
import {
  buttonPrimary,
  dialogTitleSm,
  flexRowBetween,
  inlineDangerBanner,
  modalShell,
  textAreaBase,
  textBody,
  textBodySoft,
  textLabel,
  textXs,
  textXsFaint,
  surfaceMuted,
} from '../../styles/style_config';

interface ReportFAQButtonProps {
  item: FAQItem;
}

export default function ReportFAQButton({ item }: ReportFAQButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || reason.trim().length < 10) return;
    setError('');
    setLoading(true);
    try {
      await api.post(`/faq/${item._id}/report`, { reason });
      setDone(true);
      setReason('');
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to submit report.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`mt-6 flex items-center gap-1.5 ${textXsFaint} hover:text-danger transition-colors`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Report this question
      </button>

      {open && (
        <div className={modalShell + ' bg-ink/20 backdrop-blur-sm'}>
          <div className="bg-card rounded-2xl border border-border shadow-float w-full max-w-sm p-5">
            <div className={flexRowBetween + ' mb-4'}>
              <h3 className={dialogTitleSm}>Report FAQ</h3>
              <button
                onClick={() => { setOpen(false); setDone(false); setError(''); }}
                className={`w-7 h-7 rounded-full ${surfaceMuted} flex items-center justify-center text-ink-faint hover:text-ink transition-colors`}
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {done ? (
              <div className="text-center py-4">
                <span className="text-2xl">✅</span>
                <p className={`mt-2 ${textBody} font-medium text-ink`}>Report submitted.</p>
                <p className={`mt-1 ${textXsFaint}`}>Thank you for helping keep the FAQ accurate.</p>
                <button
                  onClick={() => { setOpen(false); setDone(false); }}
                  className={`mt-4 px-4 py-2 rounded-full ${surfaceMuted} ${textXs} font-medium text-ink hover:bg-border transition-colors`}
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <p className={`${textXs} ${textBodySoft} leading-relaxed`}>
                  Is this FAQ inaccurate, outdated, or incorrect? Let us know why.
                </p>
                <div>
                  <label className={textLabel}>Reason</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="e.g. This answer is outdated, the policy changed, or the info is incorrect…"
                    className={textAreaBase}
                  />
                  <p className={`${textXsFaint} mt-1 text-right`}>{reason.length}/500</p>
                </div>
                {error && (
                  <p className={inlineDangerBanner}>{error}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={reason.trim().length < 10 || loading}
                    className={`${buttonPrimary} flex-1 py-2.5 rounded-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                  >
                    {loading ? (
                      <>
                        <span className="w-3.5 h-3.5 border border-white/40 border-t-white rounded-full animate-spin inline-block" />
                        Submitting…
                      </>
                    ) : 'Submit Report'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); setError(''); }}
                    className={`px-4 py-2.5 rounded-full border border-border ${textXs} font-semibold text-ink hover:bg-mist transition-colors`}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
