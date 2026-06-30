import React, { useEffect, useState } from 'react';
import { useBatch } from '../context/BatchContext';
import api, { friendlyError } from '../utils/api';
import Button from '../components/ui/Button';

interface RecoveryData {
  meetingId: string;
  topic: string;
  startTime: string;
  duration?: number;
  summary: string;
  revisionNotes: string;
  announcements: string[];
  faqs: Array<{ question: string; answer: string }>;
}

export default function RecoveryPage() {
  const { currentBatch } = useBatch();
  const [data, setData] = useState<RecoveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Checklist states
  const [summaryChecked, setSummaryChecked] = useState(false);
  const [announcementsChecked, setAnnouncementsChecked] = useState(false);
  const [faqsChecked, setFaqsChecked] = useState(false);
  const [notesChecked, setNotesChecked] = useState(false);
  const [recovered, setRecovered] = useState(false);

  useEffect(() => {
    // Reset checklists when batch changes
    setSummaryChecked(false);
    setAnnouncementsChecked(false);
    setFaqsChecked(false);
    setNotesChecked(false);
    setRecovered(false);

    if (!currentBatch?._id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    api.get<RecoveryData>('/recovery/latest', {
      params: { batchId: currentBatch._id }
    })
      .then(res => {
        setData(res.data);
      })
      .catch(err => {
        const msg = friendlyError(err, 'Failed to load recovery data.');
        setError(msg);
        setData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [currentBatch?._id]);

  // Compute progress
  const totalSteps = 4;
  let completedSteps = 0;
  if (summaryChecked) completedSteps++;
  if (announcementsChecked) completedSteps++;
  if (faqsChecked) completedSteps++;
  if (notesChecked) completedSteps++;

  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  const handleMarkAsRecovered = () => {
    if (progressPercent < 100) return;
    setRecovered(true);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="h-10 bg-mist rounded-xl animate-pulse w-1/3" />
        <div className="h-6 bg-mist rounded-xl animate-pulse w-2/3" />
        <div className="grid md:grid-cols-3 gap-6 pt-6">
          <div className="md:col-span-2 space-y-4">
            <div className="h-48 bg-mist rounded-2xl animate-pulse" />
            <div className="h-48 bg-mist rounded-2xl animate-pulse" />
          </div>
          <div className="space-y-4">
            <div className="h-64 bg-mist rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-mist flex items-center justify-center mx-auto mb-4 text-ink-faint">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h2 className="text-xl font-bold text-ink mb-2">No completed sessions</h2>
        <p className="text-sm text-ink-soft max-w-md mx-auto mb-6">
          {error || 'We couldn\'t find any completed Zoom sessions or insights for the active program.'}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs font-semibold text-accent uppercase tracking-wider mb-2">
          <span>📅</span> Missed Session Recovery
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
          Recovery Portal: {data.topic}
        </h1>
        <p className="text-sm text-ink-soft mt-2 flex items-center gap-4 flex-wrap">
          <span>📅 Date: {new Date(data.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <span>⏱ Duration: {data.duration ? `${data.duration} mins` : 'N/A'}</span>
          <span>🎓 Program: {currentBatch?.name}</span>
        </p>
      </div>

      {recovered ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-8 text-center shadow-sm animate-fade-in mb-8">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4 text-2xl">
            ✓
          </div>
          <h2 className="text-2xl font-bold text-emerald-800 mb-2">Session Successfully Recovered!</h2>
          <p className="text-sm text-emerald-700 max-w-lg mx-auto">
            Awesome job catching up! You have successfully reviewed the summary, announcements, revision notes, and FAQs for this session. Your progress has been logged.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={() => setRecovered(false)} variant="secondary">
              Review Content Again
            </Button>
            <Button onClick={() => window.location.href = '/'}>
              Go to Home
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content area */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Step 1: Summary */}
            <div className={`p-6 rounded-2xl border transition-all ${
              summaryChecked ? 'bg-card border-emerald-200 shadow-sm' : 'bg-card border-border'
            }`}>
              <div className="flex items-start gap-4">
                <input
                  type="checkbox"
                  id="chk-summary"
                  checked={summaryChecked}
                  onChange={e => setSummaryChecked(e.target.checked)}
                  className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 border-border mt-1 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <label htmlFor="chk-summary" className="block text-base font-bold text-ink cursor-pointer select-none">
                    Step 1: Read Session Summary
                  </label>
                  <p className="text-xs text-ink-soft mt-0.5">Understand what was covered in this session</p>
                  
                  <div className="mt-4 text-sm text-ink-soft bg-mist rounded-xl p-4 leading-relaxed whitespace-pre-wrap">
                    {data.summary}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Announcements */}
            <div className={`p-6 rounded-2xl border transition-all ${
              announcementsChecked ? 'bg-card border-emerald-200 shadow-sm' : 'bg-card border-border'
            }`}>
              <div className="flex items-start gap-4">
                <input
                  type="checkbox"
                  id="chk-announcements"
                  checked={announcementsChecked}
                  onChange={e => setAnnouncementsChecked(e.target.checked)}
                  className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 border-border mt-1 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <label htmlFor="chk-announcements" className="block text-base font-bold text-ink cursor-pointer select-none">
                    Step 2: Review Session Announcements
                  </label>
                  <p className="text-xs text-ink-soft mt-0.5">Stay up to date with tasks, deadlines, and timelines discussed</p>

                  <div className="mt-4 space-y-3">
                    {data.announcements.length === 0 ? (
                      <p className="text-xs text-ink-faint italic py-2">No announcements were made during this session.</p>
                    ) : (
                      data.announcements.map((ann, idx) => (
                        <div key={idx} className="flex gap-3 bg-amber-50/50 border border-amber-200/50 rounded-xl p-4 text-sm text-amber-900">
                          <span className="shrink-0 text-base">📢</span>
                          <span className="leading-relaxed">{ann}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Study FAQs */}
            <div className={`p-6 rounded-2xl border transition-all ${
              faqsChecked ? 'bg-card border-emerald-200 shadow-sm' : 'bg-card border-border'
            }`}>
              <div className="flex items-start gap-4">
                <input
                  type="checkbox"
                  id="chk-faqs"
                  checked={faqsChecked}
                  onChange={e => setFaqsChecked(e.target.checked)}
                  className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 border-border mt-1 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <label htmlFor="chk-faqs" className="block text-base font-bold text-ink cursor-pointer select-none">
                    Step 3: Study Session FAQs
                  </label>
                  <p className="text-xs text-ink-soft mt-0.5">Go through student questions answered by mentors</p>

                  <div className="mt-4 space-y-3">
                    {data.faqs.length === 0 ? (
                      <p className="text-xs text-ink-faint italic py-2">No FAQs were recorded for this session.</p>
                    ) : (
                      data.faqs.map((faq, idx) => (
                        <div key={idx} className="border border-border rounded-xl p-4 bg-mist/50">
                          <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-1">Question {idx + 1}</p>
                          <p className="text-sm font-bold text-ink mb-2">Q: {faq.question}</p>
                          <div className="text-sm text-ink-soft border-l-2 border-accent/20 pl-3 leading-relaxed">
                            {faq.answer}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 4: Revision Notes */}
            <div className={`p-6 rounded-2xl border transition-all ${
              notesChecked ? 'bg-card border-emerald-200 shadow-sm' : 'bg-card border-border'
            }`}>
              <div className="flex items-start gap-4">
                <input
                  type="checkbox"
                  id="chk-notes"
                  checked={notesChecked}
                  onChange={e => setNotesChecked(e.target.checked)}
                  className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 border-border mt-1 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <label htmlFor="chk-notes" className="block text-base font-bold text-ink cursor-pointer select-none">
                    Step 4: Study Revision Notes
                  </label>
                  <p className="text-xs text-ink-soft mt-0.5">Review key concepts, references, and takeaways</p>

                  <div className="mt-4 text-sm text-ink-soft bg-mist rounded-xl p-4 whitespace-pre-wrap leading-relaxed">
                    {data.revisionNotes}
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Recovery progress checklist sidebar */}
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-2xl p-6 sticky top-6 shadow-subtle">
              <h2 className="text-base font-bold text-ink mb-4 flex items-center gap-2">
                <span>📋</span> Recovery Progress
              </h2>
              
              {/* Progress bar */}
              <div className="mb-6">
                <div className="flex items-center justify-between text-xs font-semibold mb-2">
                  <span className="text-ink-soft">Steps Completed</span>
                  <span className="text-accent">{completedSteps} / {totalSteps} ({progressPercent}%)</span>
                </div>
                <div className="w-full bg-mist rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-accent h-full transition-all duration-500 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Progress Checklist indicator items */}
              <div className="space-y-3.5 mb-6">
                <button
                  onClick={() => setSummaryChecked(!summaryChecked)}
                  className="w-full flex items-center gap-2.5 text-left text-xs font-semibold select-none group cursor-pointer"
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center border text-[9px] font-bold shrink-0 transition-colors ${
                    summaryChecked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border text-transparent group-hover:border-accent'
                  }`}>✓</span>
                  <span className={summaryChecked ? 'text-ink-soft line-through' : 'text-ink'}>Read summary</span>
                </button>

                <button
                  onClick={() => setAnnouncementsChecked(!announcementsChecked)}
                  className="w-full flex items-center gap-2.5 text-left text-xs font-semibold select-none group cursor-pointer"
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center border text-[9px] font-bold shrink-0 transition-colors ${
                    announcementsChecked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border text-transparent group-hover:border-accent'
                  }`}>✓</span>
                  <span className={announcementsChecked ? 'text-ink-soft line-through' : 'text-ink'}>Review announcements</span>
                </button>

                <button
                  onClick={() => setFaqsChecked(!faqsChecked)}
                  className="w-full flex items-center gap-2.5 text-left text-xs font-semibold select-none group cursor-pointer"
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center border text-[9px] font-bold shrink-0 transition-colors ${
                    faqsChecked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border text-transparent group-hover:border-accent'
                  }`}>✓</span>
                  <span className={faqsChecked ? 'text-ink-soft line-through' : 'text-ink'}>Study FAQs</span>
                </button>

                <button
                  onClick={() => setNotesChecked(!notesChecked)}
                  className="w-full flex items-center gap-2.5 text-left text-xs font-semibold select-none group cursor-pointer"
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center border text-[9px] font-bold shrink-0 transition-colors ${
                    notesChecked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border text-transparent group-hover:border-accent'
                  }`}>✓</span>
                  <span className={notesChecked ? 'text-ink-soft line-through' : 'text-ink'}>Read revision notes</span>
                </button>
              </div>

              <Button
                onClick={handleMarkAsRecovered}
                disabled={progressPercent < 100}
                className="w-full font-bold"
                variant={progressPercent === 100 ? 'primary' : 'secondary'}
              >
                Mark Session as Recovered
              </Button>
              {progressPercent < 100 && (
                <p className="text-[10px] text-ink-faint text-center mt-2.5">
                  Complete all steps to finalize recovery.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
