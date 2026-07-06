import React, { useState, useEffect, useCallback, useMemo } from 'react';
import adminApi from '../../utils/adminApi';

interface Stats {
  questionPoolSize: number;
  activeAttempts: number;
  passedToday: number;
  failedToday: number;
}

interface ZoomSession {
  _id: string;
  title: string;
  description: string;
  duration: string;
  zoomUrl: string;
  isActive: boolean;
  transcript: string;
  questionCount: number;
  passScore: number;
  dailyResetTime: string;
  stats?: Stats;
}

interface Question {
  _id: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  type: 'MCQ' | 'TrueFalse' | 'Scenario';
  sourceType: 'faq' | 'transcript' | 'recent_faq';
}

interface AdminZoomTabProps {
  mode?: 'assessments' | 'questions';
}

export default function AdminZoomTab({ mode = 'assessments' }: AdminZoomTabProps) {
  const [sessions, setSessions] = useState<ZoomSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [isGlobalActive, setIsGlobalActive] = useState(false);

  // Questions state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  // New question form state
  const [newQuestionForm, setNewQuestionForm] = useState<{
    question: string;
    options: string[];
    correctOptionIndex: number;
    type: 'MCQ' | 'TrueFalse' | 'Scenario';
    sourceType: 'faq' | 'transcript' | 'recent_faq';
  }>({
    question: '',
    options: ['', '', '', ''],
    correctOptionIndex: 0,
    type: 'MCQ',
    sourceType: 'transcript',
  });

  // Edit question form state
  const [editQuestionForm, setEditQuestionForm] = useState<{
    question: string;
    options: string[];
    correctOptionIndex: number;
    type: 'MCQ' | 'TrueFalse' | 'Scenario';
    sourceType: 'faq' | 'transcript' | 'recent_faq';
  }>({
    question: '',
    options: ['', '', '', ''],
    correctOptionIndex: 0,
    type: 'MCQ',
    sourceType: 'transcript',
  });

  // Session details form state
  const [sessionForm, setSessionForm] = useState({
    title: '',
    description: '',
    duration: '60 minutes',
    zoomUrl: '',
    dailyResetTime: '09:00 AM',
    passScore: 70,
    zoomQuestionCount: 10,
  });

  // New session modal / form visibility
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [newSessionForm, setNewSessionForm] = useState({
    title: '',
    description: 'Join us for the live onboarding.',
    duration: '60 minutes',
    zoomUrl: '',
    dailyResetTime: '09:00 AM',
    passScore: 70,
    zoomQuestionCount: 10,
  });

  useEffect(() => {
    fetchSessions();
    fetchGlobalStatus();
  }, []);

  const fetchGlobalStatus = async () => {
    try {
      const res = await adminApi.get('/admin/welcome/zoom-settings');
      setIsGlobalActive(res.data.zoomActive ?? false);
    } catch (error) {
      console.error('Failed to fetch global status', error);
    }
  };

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const res = await adminApi.get('/admin/welcome/zoom-sessions');
      setSessions(res.data || []);

      // Auto-select active or first session if none selected yet
      if (res.data && res.data.length > 0) {
        const active = res.data.find((s: ZoomSession) => s.isActive);
        const selectedId = active ? active._id : res.data[0]._id;
        setSelectedSessionId(selectedId);
        loadSessionDetails(res.data.find((s: ZoomSession) => s._id === selectedId));
      }
    } catch (error) {
      console.error('Failed to fetch sessions', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchQuestions = useCallback(async (sessionId: string) => {
    try {
      setLoadingQuestions(true);
      const res = await adminApi.get(`/admin/welcome/zoom-sessions/${sessionId}/questions`);
      setQuestions(res.data || []);
    } catch (error) {
      console.error('Failed to fetch session questions', error);
    } finally {
      setLoadingQuestions(false);
    }
  }, []);

  const loadSessionDetails = useCallback(
    (session: ZoomSession | undefined) => {
      if (!session) return;
      setSessionForm({
        title: session.title,
        description: session.description,
        duration: session.duration,
        zoomUrl: session.zoomUrl,
        dailyResetTime: session.dailyResetTime,
        passScore: session.passScore,
        zoomQuestionCount: session.questionCount,
      });
      if (mode === 'questions') {
        fetchQuestions(session._id);
      }
    },
    [mode, fetchQuestions]
  );

  const handleSelectSession = useCallback(
    (id: string) => {
      setSelectedSessionId(id);
      const session = sessions.find((s) => s._id === id);
      loadSessionDetails(session);
      setEditingQuestionId(null);
    },
    [sessions, loadSessionDetails]
  );

  const handleGlobalActiveToggle = async () => {
    const nextVal = !isGlobalActive;
    try {
      await adminApi.put('/admin/welcome/zoom-settings', {
        zoomActive: nextVal,
      });
      setIsGlobalActive(nextVal);
      // Refresh list to update stat widgets if needed
      const res = await adminApi.get('/admin/welcome/zoom-sessions');
      setSessions(res.data || []);
    } catch (error) {
      console.error('Failed to toggle global zoom active', error);
      alert('Failed to update status.');
    }
  };

  const handleSessionFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setSessionForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSessionId) return;

    const timeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s*(AM|PM)$/i;
    if (!timeRegex.test(sessionForm.dailyResetTime.trim())) {
      alert('Please enter a valid reset time in the format HH:MM AM/PM (e.g., 09:00 AM).');
      return;
    }

    try {
      setSaving(true);
      await adminApi.put(`/admin/welcome/zoom-sessions/${selectedSessionId}`, sessionForm);
      alert('Session details updated successfully!');

      // Refresh sessions
      const res = await adminApi.get('/admin/welcome/zoom-sessions');
      setSessions(res.data || []);
    } catch (error) {
      console.error('Failed to save session settings', error);
      alert('Failed to update session.');
    } finally {
      setSaving(true); // Wait, this should be false! Let's set it to false
      setSaving(false);
    }
  };

  const handleCreateSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const timeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s*(AM|PM)$/i;
    if (!timeRegex.test(newSessionForm.dailyResetTime.trim())) {
      alert('Please enter a valid reset time in the format HH:MM AM/PM (e.g., 09:00 AM).');
      return;
    }

    try {
      setSaving(true);
      const res = await adminApi.post('/admin/welcome/zoom-sessions', newSessionForm);
      setIsCreatingSession(false);
      setNewSessionForm({
        title: '',
        description: 'Join us for the live onboarding.',
        duration: '60 minutes',
        zoomUrl: '',
        dailyResetTime: '09:00 AM',
        passScore: 70,
        zoomQuestionCount: 10,
      });
      alert('Session created successfully!');
      await fetchSessions();
      if (res.data?._id) {
        setSelectedSessionId(res.data._id);
        loadSessionDetails(res.data);
      }
    } catch (error) {
      console.error('Failed to create session', error);
      alert('Failed to create session.');
    } finally {
      setSaving(false);
    }
  };

  const handleActivateSession = async (id: string) => {
    try {
      await adminApi.post(`/admin/welcome/zoom-sessions/${id}/activate`);
      alert('Session activated successfully!');
      setIsGlobalActive(true);
      await fetchSessions();
    } catch (error) {
      console.error('Failed to activate session', error);
      alert('Failed to activate session.');
    }
  };

  const handleDeleteSession = async (id: string) => {
    const session = sessions.find((s) => s._id === id);
    if (!session) return;
    if (session.isActive) {
      alert('Cannot delete the active session.');
      return;
    }
    if (
      !confirm(
        `Are you sure you want to delete session "${session.title}" and all its questions/statistics?`
      )
    )
      return;

    try {
      await adminApi.delete(`/admin/welcome/zoom-sessions/${id}`);
      alert('Session deleted successfully.');

      // Reset selected session if deleted
      if (selectedSessionId === id) {
        setSelectedSessionId(null);
      }
      await fetchSessions();
    } catch (error) {
      console.error('Failed to delete session', error);
      alert('Failed to delete session.');
    }
  };

  const handleTranscriptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedSessionId || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const uploadData = new FormData();
    uploadData.append('transcript', file);

    try {
      setUploading(true);
      await adminApi.post(
        `/admin/welcome/zoom-sessions/${selectedSessionId}/transcript`,
        uploadData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        }
      );
      alert('Transcript uploaded and processed successfully for this session!');

      // Update session listing
      const res = await adminApi.get('/admin/welcome/zoom-sessions');
      setSessions(res.data || []);
    } catch (error) {
      console.error('Upload failed', error);
      alert('Failed to upload transcript.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRegeneratePool = async () => {
    if (!selectedSessionId) return;
    const session = sessions.find((s) => s._id === selectedSessionId);
    if (!session) {
      alert('Session not found.');
      return;
    }

    // v1.73 — Transcript is optional. We always allow generation;
    // the backend synthesises source material from session title +
    // description when no transcript exists, so the AI pipeline
    // still produces questions. The confirm dialog tells the admin
    // which path the AI will take.
    const hasTranscript = Boolean(session.transcript && session.transcript.trim());
    const confirmMsg = hasTranscript
      ? 'Regenerate the assessment pool from the uploaded transcript? Existing questions will be replaced.'
      : 'No transcript uploaded — generate questions from the session title and description?\n\nExisting questions will be replaced.';
    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      setRegenerating(true);
      const res = await adminApi.post<{ message?: string; source?: 'transcript' | 'metadata' }>(
        `/admin/welcome/zoom-sessions/${selectedSessionId}/regenerate`
      );
      const sourceNote =
        res.data.source === 'metadata'
          ? '\n\n(Note: AI generated from session metadata — upload a transcript and regenerate for richer questions.)'
          : '';
      alert((res.data.message || 'Assessment pool regenerated successfully!') + sourceNote);

      // Refresh sessions and questions
      const sessionsRes = await adminApi.get('/admin/welcome/zoom-sessions');
      setSessions(sessionsRes.data || []);
      fetchQuestions(selectedSessionId);
    } catch (error) {
      console.error('Regeneration failed', error);
      alert('Failed to regenerate assessment pool.');
    } finally {
      setRegenerating(false);
    }
  };

  // --- Questions CRUD Handlers ---

  const handleAddQuestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSessionId) return;

    if (!newQuestionForm.question.trim()) {
      alert('Question text is required.');
      return;
    }
    if (newQuestionForm.options.some((opt) => !opt.trim())) {
      alert('Please fill out all option fields.');
      return;
    }

    try {
      await adminApi.post(
        `/admin/welcome/zoom-sessions/${selectedSessionId}/questions`,
        newQuestionForm
      );
      setNewQuestionForm({
        question: '',
        options: ['', '', '', ''],
        correctOptionIndex: 0,
        type: 'MCQ',
        sourceType: 'transcript',
      });
      alert('Question added successfully!');
      fetchQuestions(selectedSessionId);
      // Update sessions stats
      const res = await adminApi.get('/admin/welcome/zoom-sessions');
      setSessions(res.data || []);
    } catch (error) {
      console.error('Failed to create question', error);
      alert('Failed to add question.');
    }
  };

  const handleStartEditingQuestion = useCallback((q: Question) => {
    setEditingQuestionId(q._id);
    setEditQuestionForm({
      question: q.question,
      options: [...q.options],
      correctOptionIndex: q.correctOptionIndex,
      type: q.type,
      sourceType: q.sourceType,
    });
  }, []);

  const handleSaveEditQuestion = useCallback(
    async (qId: string) => {
      if (!selectedSessionId) return;
      if (!editQuestionForm.question.trim()) {
        alert('Question text is required.');
        return;
      }
      if (editQuestionForm.options.some((opt) => !opt.trim())) {
        alert('Please fill out all option fields.');
        return;
      }

      try {
        await adminApi.put(
          `/admin/welcome/zoom-sessions/${selectedSessionId}/questions/${qId}`,
          editQuestionForm
        );
        setEditingQuestionId(null);
        alert('Question updated successfully!');
        fetchQuestions(selectedSessionId);
      } catch (error) {
        console.error('Failed to update question', error);
        alert('Failed to update question.');
      }
    },
    [selectedSessionId, editQuestionForm, fetchQuestions]
  );

  const handleDeleteQuestion = useCallback(
    async (qId: string) => {
      if (!selectedSessionId) return;
      if (!confirm('Are you sure you want to delete this question?')) return;

      try {
        await adminApi.delete(`/admin/welcome/zoom-sessions/${selectedSessionId}/questions/${qId}`);
        alert('Question deleted.');
        fetchQuestions(selectedSessionId);
        // Update sessions stats
        const res = await adminApi.get('/admin/welcome/zoom-sessions');
        setSessions(res.data || []);
      } catch (error) {
        console.error('Failed to delete question', error);
        alert('Failed to delete question.');
      }
    },
    [selectedSessionId, fetchQuestions]
  );

  const renderedSessionsList = useMemo(() => {
    return sessions.map((s) => {
      const isSelected = s._id === selectedSessionId;
      return (
        <div
          key={s._id}
          onClick={() => handleSelectSession(s._id)}
          className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer text-left relative flex flex-col justify-between ${
            isSelected
              ? 'border-accent bg-accent/[0.02] shadow-subtle'
              : 'border-border/60 bg-[rgb(var(--bg-card-rgb))] hover:border-border hover:bg-mist/30'
          }`}
        >
          <div className="flex justify-between items-start mb-2">
            <h4 className="text-sm font-semibold text-ink leading-tight pr-10 line-clamp-1">
              {s.title}
            </h4>
            {s.isActive && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/30 absolute right-4 top-4">
                Active
              </span>
            )}
          </div>

          <p className="text-xs text-ink-soft line-clamp-2 mb-3">{s.description}</p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-faint font-medium">
            <span>Pool: {s.stats?.questionPoolSize || 0} qs</span>
            <span>•</span>
            <span>Pass: {s.passScore}%</span>
            <span>•</span>
            <span>Passed: {s.stats?.passedToday || 0} today</span>
          </div>
        </div>
      );
    });
  }, [sessions, selectedSessionId, handleSelectSession]);

  const renderedQuestionList = useMemo(() => {
    if (loadingQuestions) {
      return <div className="p-8 text-center text-xs text-ink-soft">Loading pool questions...</div>;
    }
    if (questions.length === 0) {
      return (
        <div className="p-8 text-center text-xs text-ink-faint border border-dashed border-border rounded-xl">
          No questions in this session's pool. Upload a transcript and generate questions, or add
          some manually!
        </div>
      );
    }

    return (
      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
        {questions.map((q, idx) => {
          const isEditing = editingQuestionId === q._id;
          return (
            <div
              key={q._id}
              className="p-4 rounded-xl border border-border bg-[rgb(var(--bg-card-rgb))] shadow-subtle flex flex-col gap-3 relative"
            >
              {isEditing ? (
                /* QUESTION EDIT FORM */
                <div className="space-y-3">
                  <div>
                    <label className="block text-[9px] font-bold text-ink-soft uppercase mb-1">
                      Question text
                    </label>
                    <input
                      type="text"
                      value={editQuestionForm.question}
                      onChange={(e) =>
                        setEditQuestionForm((prev) => ({ ...prev, question: e.target.value }))
                      }
                      className="w-full px-3 py-1.5 rounded-lg border border-border bg-[rgb(var(--bg-card-rgb))] text-ink text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {editQuestionForm.options.map((opt, oIdx) => (
                      <div key={oIdx}>
                        <label className="flex justify-between items-center text-[9px] font-bold text-ink-soft uppercase mb-1">
                          <span>Option {oIdx + 1}</span>
                          <span className="flex items-center gap-1">
                            <input
                              type="radio"
                              name={`editCorrect-${q._id}`}
                              checked={editQuestionForm.correctOptionIndex === oIdx}
                              onChange={() =>
                                setEditQuestionForm((prev) => ({
                                  ...prev,
                                  correctOptionIndex: oIdx,
                                }))
                              }
                              className="w-3 h-3 accent-accent"
                            />
                            <span className="text-[8px] font-semibold text-accent">
                              Correct Answer
                            </span>
                          </span>
                        </label>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const nextOpts = [...editQuestionForm.options];
                            nextOpts[oIdx] = e.target.value;
                            setEditQuestionForm((prev) => ({ ...prev, options: nextOpts }));
                          }}
                          className="w-full px-3 py-1.5 rounded-lg border border-border bg-[rgb(var(--bg-card-rgb))] text-ink text-xs"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-ink-soft uppercase mb-1">
                        Type
                      </label>
                      <select
                        value={editQuestionForm.type}
                        onChange={(e) =>
                          setEditQuestionForm((prev) => ({ ...prev, type: e.target.value as any }))
                        }
                        className="w-full px-3 py-1.5 rounded-lg border border-border bg-[rgb(var(--bg-card-rgb))] text-ink text-xs"
                      >
                        <option value="MCQ">MCQ</option>
                        <option value="TrueFalse">True/False</option>
                        <option value="Scenario">Scenario</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-ink-soft uppercase mb-1">
                        Source
                      </label>
                      <select
                        value={editQuestionForm.sourceType}
                        onChange={(e) =>
                          setEditQuestionForm((prev) => ({
                            ...prev,
                            sourceType: e.target.value as any,
                          }))
                        }
                        className="w-full px-3 py-1.5 rounded-lg border border-border bg-[rgb(var(--bg-card-rgb))] text-ink text-xs"
                      >
                        <option value="faq">FAQ</option>
                        <option value="transcript">Transcript</option>
                        <option value="recent_faq">Recent FAQ</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingQuestionId(null)}
                      className="px-3 py-1.5 border border-border text-ink-soft rounded-lg text-xs font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveEditQuestion(q._id)}
                      className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-bold"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                /* NORMAL VIEW MODE */
                <>
                  <div className="flex justify-between items-start gap-4 pr-16">
                    <h6 className="text-xs font-bold text-ink leading-snug">
                      <span className="text-ink-faint mr-1">{idx + 1}.</span>
                      {q.question}
                    </h6>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <span className="text-[8px] font-bold uppercase px-2 py-0.5 rounded bg-mist text-ink-soft">
                        {q.type}
                      </span>
                      <span className="text-[8px] font-bold uppercase px-2 py-0.5 rounded bg-mist text-ink-soft">
                        {q.sourceType}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                    {q.options.map((opt, oIdx) => {
                      const isCorrect = q.correctOptionIndex === oIdx;
                      return (
                        <div
                          key={oIdx}
                          className={`px-3 py-2 rounded-lg border text-xs flex items-center gap-2 ${
                            isCorrect
                              ? 'border-accent/30 bg-accent/10 text-accent font-medium'
                              : 'border-border/40 text-ink-soft'
                          }`}
                        >
                          <div
                            className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 text-[8px] ${
                              isCorrect
                                ? 'border-accent bg-accent text-[#131313]'
                                : 'border-border'
                            }`}
                          >
                            {isCorrect && '✓'}
                          </div>
                          <span>{opt}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="absolute right-4 bottom-4 flex gap-1.5">
                    <button
                      onClick={() => handleStartEditingQuestion(q)}
                      className="text-[10px] font-bold text-accent hover:text-accent/80 cursor-pointer"
                    >
                      Edit
                    </button>
                    <span className="text-[10px] text-ink-faint">•</span>
                    <button
                      onClick={() => handleDeleteQuestion(q._id)}
                      className="text-[10px] font-bold text-red-500 hover:text-red-700 cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  }, [
    questions,
    loadingQuestions,
    editingQuestionId,
    editQuestionForm,
    handleStartEditingQuestion,
    handleDeleteQuestion,
    handleSaveEditQuestion,
  ]);

  if (loading && sessions.length === 0) {
    return <div className="p-8 text-center text-ink-soft">Loading onboarding sessions...</div>;
  }

  const selectedSession = sessions.find((s) => s._id === selectedSessionId);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner: Global active setting toggle */}
      {mode !== 'questions' && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[rgb(var(--bg-card-rgb))] rounded-2xl border border-border shadow-sm p-5">
          <div>
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              Zoom Onboarding Assessment Gateway
              <span
                className={`w-2.5 h-2.5 rounded-full inline-block ${isGlobalActive ? 'bg-accent animate-pulse' : 'bg-red-500'}`}
              />
            </h2>
            <p className="text-xs text-ink-soft mt-0.5">
              Toggle global Zoom session locking. If disabled, users bypass onboarding assessments.
            </p>
          </div>
          <button
            onClick={handleGlobalActiveToggle}
            className={`btn-base px-5 py-2.5 font-semibold text-xs rounded-full border transition-all duration-300 cursor-pointer ${
              isGlobalActive
                ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100/50'
                : 'bg-accent/10 text-accent border-accent/30 hover:bg-accent/20'
            }`}
          >
            {isGlobalActive ? 'Disable Gateway' : 'Enable Gateway'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ========================================================
            LEFT COLUMN: SESSIONS LIST
            ======================================================== */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-faint">
              Zoom Sessions
            </h3>
            <button
              onClick={() => setIsCreatingSession(true)}
              className="text-xs font-bold text-accent hover:text-accent/80 flex items-center gap-1 cursor-pointer transition-colors"
            >
              + Create Session
            </button>
          </div>

          <div className="space-y-3 max-h-[750px] overflow-y-auto pr-1">{renderedSessionsList}</div>
        </div>

        {/* ========================================================
            RIGHT COLUMN: SELECTED SESSION DETAIL & QUESTIONS CRUD
            ======================================================== */}
        <div className="lg:col-span-8 space-y-6">
          {isCreatingSession ? (
            /* --- CREATE NEW SESSION FORM --- */
            <form
              onSubmit={handleCreateSessionSubmit}
              className="bg-[rgb(var(--bg-card-rgb))] rounded-2xl border border-border shadow-sm p-6 lg:p-8 space-y-6"
            >
              <div>
                <h3 className="text-base font-bold text-ink tracking-tight mb-1">
                  Create Zoom Onboarding Session
                </h3>
                <p className="text-xs text-ink-soft">
                  Create a new session, upload its transcript, and configure separate settings.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2">
                    Session Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Session 1 - Orientation Intro"
                    value={newSessionForm.title}
                    onChange={(e) =>
                      setNewSessionForm((prev) => ({ ...prev, title: e.target.value }))
                    }
                    className="w-full px-4 py-2 rounded-xl border border-border bg-[rgb(var(--bg-card-rgb))] text-ink focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2">
                    Zoom Meeting Link
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://zoom.us/j/..."
                    value={newSessionForm.zoomUrl}
                    onChange={(e) =>
                      setNewSessionForm((prev) => ({ ...prev, zoomUrl: e.target.value }))
                    }
                    className="w-full px-4 py-2 rounded-xl border border-border bg-[rgb(var(--bg-card-rgb))] text-ink focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm font-mono"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2">
                      Duration
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 60 minutes"
                      value={newSessionForm.duration}
                      onChange={(e) =>
                        setNewSessionForm((prev) => ({ ...prev, duration: e.target.value }))
                      }
                      className="w-full px-4 py-2 rounded-xl border border-border bg-[rgb(var(--bg-card-rgb))] text-ink focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2">
                      Daily Reset Time
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 09:00 AM"
                      value={newSessionForm.dailyResetTime}
                      onChange={(e) =>
                        setNewSessionForm((prev) => ({ ...prev, dailyResetTime: e.target.value }))
                      }
                      className="w-full px-4 py-2 rounded-xl border border-border bg-[rgb(var(--bg-card-rgb))] text-ink focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Onboarding session details for passed candidates..."
                    value={newSessionForm.description}
                    onChange={(e) =>
                      setNewSessionForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                    className="w-full px-4 py-2 rounded-xl border border-border bg-[rgb(var(--bg-card-rgb))] text-ink focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                <button
                  type="button"
                  onClick={() => setIsCreatingSession(false)}
                  className="px-5 py-2 text-xs font-semibold border border-border rounded-xl hover:bg-mist/30 text-ink-soft transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-base btn-primary px-5 py-2 text-xs font-semibold cursor-pointer"
                >
                  {saving ? 'Creating...' : 'Create Session'}
                </button>
              </div>
            </form>
          ) : selectedSession ? (
            /* --- SESSION DETAIL DASHBOARD & MANAGER --- */
            <div className="space-y-6">
              {mode !== 'questions' && (
                <>
                  {/* Stats Block */}
                  <div className="bg-[rgb(var(--bg-card-rgb))] rounded-2xl border border-border shadow-sm p-6">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-lg font-bold text-ink leading-snug">
                          {selectedSession.title}
                        </h3>
                        <p className="text-xs text-ink-soft mt-1">{selectedSession.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!selectedSession.isActive && (
                          <button
                            onClick={() => handleActivateSession(selectedSession._id)}
                            className="btn-base bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 px-3.5 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer"
                          >
                            Activate Session
                          </button>
                        )}
                        {!selectedSession.isActive && (
                          <button
                            onClick={() => handleDeleteSession(selectedSession._id)}
                            className="btn-base bg-red-50 text-red-600 border border-red-100 hover:bg-red-100/50 px-3.5 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-mist/30 border border-border/40 text-center">
                      <div>
                        <span className="block text-[9px] font-bold text-ink-faint uppercase mb-0.5">
                          Pool Size
                        </span>
                        <span className="text-lg font-black text-ink">
                          {selectedSession.stats?.questionPoolSize || 0} qs
                        </span>
                      </div>
                      <div>
                        <span className="block text-[9px] font-bold text-ink-faint uppercase mb-0.5">
                          Active Attempts
                        </span>
                        <span className="text-lg font-black text-ink">
                          {selectedSession.stats?.activeAttempts || 0}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[9px] font-bold text-ink-faint uppercase mb-0.5">
                          Passed Today
                        </span>
                        <span className="text-lg font-black text-accent">
                          {selectedSession.stats?.passedToday || 0}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[9px] font-bold text-ink-faint uppercase mb-0.5">
                          Failed Today
                        </span>
                        <span className="text-lg font-black text-red-500">
                          {selectedSession.stats?.failedToday || 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Ingestion & AI Generation */}
                  <div className="bg-[rgb(var(--bg-card-rgb))] rounded-2xl border border-border shadow-sm p-6 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-faint border-b border-border/50 pb-2">
                      Knowledge Base & Pool Generation
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-mist/20 p-4 rounded-xl border border-border/40">
                      <div>
                        <h5 className="text-xs font-bold text-ink mb-1">
                          Transcript Ingestion{' '}
                          <span className="text-ink-faint font-normal">(optional)</span>
                        </h5>
                        {/* v1.73 — Transcript is optional. The AI pipeline can
                        run without one, anchoring questions to the
                        session title + description instead. A richer
                        transcript produces better questions, but the
                        admin isn't blocked from generating the pool
                        first and uploading the transcript later. */}
                        <p className="text-[11px] text-ink-soft mb-3">
                          Upload a session transcript (.txt, .md, .pdf) to anchor questions to real
                          session content. Optional — you can also generate questions first and
                          upload a transcript later.
                        </p>
                        <div className="flex items-center gap-3">
                          <label className="btn-base bg-[rgb(var(--bg-card-rgb))] border border-border text-ink hover:bg-mist cursor-pointer px-4 py-2 text-[10px] font-bold rounded-lg">
                            {uploading ? 'Processing...' : 'Upload Transcript'}
                            <input
                              type="file"
                              accept=".txt,.md,.pdf"
                              className="hidden"
                              onChange={handleTranscriptUpload}
                              disabled={uploading}
                            />
                          </label>
                          {selectedSession.transcript && (
                            <span className="text-[9px] font-bold text-accent bg-accent/10 px-2.5 py-1 rounded-full border border-accent/30">
                              ✓ Loaded
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <h5 className="text-xs font-bold text-ink mb-1">AI Question Generation</h5>
                        {/* v1.73 — Copy makes clear that transcript is optional.
                        Backend will synthesise source material from
                        the session title + description when no
                        transcript exists. */}
                        <p className="text-[11px] text-ink-soft mb-3">
                          {selectedSession.transcript
                            ? 'Generate ~50 multiple-choice questions from the uploaded transcript + FAQs. Uploading a richer transcript gives better questions.'
                            : 'Generate ~50 multiple-choice questions. No transcript uploaded — questions will be anchored to the session title and description (upload a transcript later and regenerate for richer questions).'}
                        </p>
                        {/* v1.73 — Button label flips based on whether
                        questions already exist. First-time click is
                        "Generate Questions"; subsequent clicks are
                        "Regenerate Questions". The button is ALWAYS
                        enabled — the backend pipeline runs whether
                        or not a transcript is attached. */}
                        <button
                          onClick={handleRegeneratePool}
                          disabled={regenerating}
                          className="btn-base bg-accent text-white hover:bg-accent/90 disabled:opacity-40 px-4 py-2 text-[10px] font-bold rounded-lg cursor-pointer"
                        >
                          {regenerating
                            ? 'Generating…'
                            : (selectedSession.questionCount ?? 0) > 0
                              ? 'Regenerate Questions'
                              : 'Generate Questions'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Form Settings */}
                  <form
                    onSubmit={handleSessionSubmit}
                    className="bg-[rgb(var(--bg-card-rgb))] rounded-2xl border border-border shadow-sm p-6 space-y-6"
                  >
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-faint border-b border-border/50 pb-2">
                      Session Parameters
                    </h4>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-ink-soft uppercase tracking-wider mb-2">
                            Meeting Title
                          </label>
                          <input
                            type="text"
                            name="title"
                            value={sessionForm.title}
                            onChange={handleSessionFormChange}
                            className="w-full px-4 py-2 rounded-xl border border-border bg-[rgb(var(--bg-card-rgb))] text-ink focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-ink-soft uppercase tracking-wider mb-2">
                            Duration
                          </label>
                          <input
                            type="text"
                            name="duration"
                            value={sessionForm.duration}
                            onChange={handleSessionFormChange}
                            className="w-full px-4 py-2 rounded-xl border border-border bg-[rgb(var(--bg-card-rgb))] text-ink focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-ink-soft uppercase tracking-wider mb-2">
                          Zoom Meeting Link
                        </label>
                        <input
                          type="url"
                          name="zoomUrl"
                          value={sessionForm.zoomUrl}
                          onChange={handleSessionFormChange}
                          className="w-full px-4 py-2 rounded-xl border border-border bg-[rgb(var(--bg-card-rgb))] text-ink focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm font-mono"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start pt-2">
                        <div>
                          <div className="flex justify-between mb-1.5">
                            <label className="block text-[10px] font-bold text-ink-soft uppercase tracking-wider">
                              Pass Score
                            </label>
                            <span className="text-xs font-bold text-accent">
                              {sessionForm.passScore}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={sessionForm.passScore}
                            onChange={(e) =>
                              setSessionForm((prev) => ({
                                ...prev,
                                passScore: parseInt(e.target.value),
                              }))
                            }
                            className="w-full h-2 bg-mist rounded-lg appearance-none cursor-pointer accent-accent outline-none"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between mb-1.5">
                            <label className="block text-[10px] font-bold text-ink-soft uppercase tracking-wider">
                              Attempt Questions
                            </label>
                            <span className="text-xs font-bold text-accent">
                              {sessionForm.zoomQuestionCount}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="5"
                            max="20"
                            value={sessionForm.zoomQuestionCount}
                            onChange={(e) =>
                              setSessionForm((prev) => ({
                                ...prev,
                                zoomQuestionCount: parseInt(e.target.value),
                              }))
                            }
                            className="w-full h-2 bg-mist rounded-lg appearance-none cursor-pointer accent-accent outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-ink-soft uppercase tracking-wider mb-2">
                            Daily Reset Time
                          </label>
                          <input
                            type="text"
                            name="dailyResetTime"
                            value={sessionForm.dailyResetTime}
                            onChange={handleSessionFormChange}
                            className="w-full px-4 py-2 rounded-xl border border-border bg-[rgb(var(--bg-card-rgb))] text-ink focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-ink-soft uppercase tracking-wider mb-2">
                          Description
                        </label>
                        <textarea
                          name="description"
                          rows={2}
                          value={sessionForm.description}
                          onChange={handleSessionFormChange}
                          className="w-full px-4 py-2 rounded-xl border border-border bg-[rgb(var(--bg-card-rgb))] text-ink focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm resize-none"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-border/50">
                      <button
                        type="submit"
                        disabled={saving}
                        className="btn-base btn-primary px-5 py-2 text-xs font-semibold cursor-pointer"
                      >
                        Save Parameters
                      </button>
                    </div>
                  </form>
                </>
              )}

              {mode !== 'assessments' && (
                /* ========================================================
                    QUESTION MANAGER SECTION (CRUD)
                    ======================================================== */
                <div className="bg-[rgb(var(--bg-card-rgb))] rounded-2xl border border-border shadow-sm p-6 space-y-6">
                  <div className="flex justify-between items-center border-b border-border/50 pb-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-faint">
                      Question Pool Management
                    </h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-mist text-ink-soft">
                      {questions.length} questions total
                    </span>
                  </div>

                  {/* Inline form to create a manual question */}
                  <form
                    onSubmit={handleAddQuestionSubmit}
                    className="p-5 rounded-xl border border-border bg-mist/10 space-y-4"
                  >
                    <h5 className="text-xs font-bold text-ink">Add Question Manually</h5>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[9px] font-bold text-ink-soft uppercase mb-1">
                          Question Text
                        </label>
                        <input
                          type="text"
                          placeholder="Type the question..."
                          value={newQuestionForm.question}
                          onChange={(e) =>
                            setNewQuestionForm((prev) => ({ ...prev, question: e.target.value }))
                          }
                          className="w-full px-4 py-2 rounded-lg border border-border bg-[rgb(var(--bg-card-rgb))] text-ink text-xs focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {newQuestionForm.options.map((opt, idx) => (
                          <div key={idx}>
                            <label className="flex justify-between items-center text-[9px] font-bold text-ink-soft uppercase mb-1">
                              <span>Option {idx + 1}</span>
                              <span className="flex items-center gap-1">
                                <input
                                  type="radio"
                                  name="newCorrectIndex"
                                  checked={newQuestionForm.correctOptionIndex === idx}
                                  onChange={() =>
                                    setNewQuestionForm((prev) => ({
                                      ...prev,
                                      correctOptionIndex: idx,
                                    }))
                                  }
                                  className="w-3 h-3 accent-accent"
                                />
                                <span className="text-[8px] font-semibold text-accent">
                                  Correct Answer
                                </span>
                              </span>
                            </label>
                            <input
                              type="text"
                              placeholder={`Option ${idx + 1}...`}
                              value={opt}
                              onChange={(e) => {
                                const nextOpts = [...newQuestionForm.options];
                                nextOpts[idx] = e.target.value;
                                setNewQuestionForm((prev) => ({ ...prev, options: nextOpts }));
                              }}
                              className="w-full px-3 py-1.5 rounded-lg border border-border bg-[rgb(var(--bg-card-rgb))] text-ink text-xs focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                            />
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[9px] font-bold text-ink-soft uppercase mb-1">
                            Question Type
                          </label>
                          <select
                            value={newQuestionForm.type}
                            onChange={(e) =>
                              setNewQuestionForm((prev) => ({
                                ...prev,
                                type: e.target.value as any,
                              }))
                            }
                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-[rgb(var(--bg-card-rgb))] text-ink text-xs focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                          >
                            <option value="MCQ">MCQ</option>
                            <option value="TrueFalse">True/False</option>
                            <option value="Scenario">Scenario</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-ink-soft uppercase mb-1">
                            Source Type
                          </label>
                          <select
                            value={newQuestionForm.sourceType}
                            onChange={(e) =>
                              setNewQuestionForm((prev) => ({
                                ...prev,
                                sourceType: e.target.value as any,
                              }))
                            }
                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-[rgb(var(--bg-card-rgb))] text-ink text-xs focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                          >
                            <option value="faq">FAQ</option>
                            <option value="transcript">Transcript</option>
                            <option value="recent_faq">Recent FAQ</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-accent text-white hover:bg-accent/90 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-subtle"
                      >
                        Add to Pool
                      </button>
                    </div>
                  </form>

                  {/* Questions List */}
                  <div className="space-y-4">
                    <h5 className="text-xs font-bold text-ink-soft uppercase tracking-wider">
                      Question List
                    </h5>

                    {renderedQuestionList}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[rgb(var(--bg-card-rgb))] rounded-2xl border border-border shadow-sm p-8 text-center text-ink-soft">
              No Zoom session selected. Choose a session from the list or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
