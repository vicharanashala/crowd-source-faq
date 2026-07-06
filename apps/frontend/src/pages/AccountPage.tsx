import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import Footer from '../components/layout/Footer';
import ProfileCard from '../components/account/ProfileCard';
import PasswordCard from '../components/account/PasswordCard';

interface ZoomStatus {
  connected: boolean;
  connectedAt?: string;
  zoomUserId?: string;
  lastSyncedAt?: string;
}

export default function AccountPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // ─── Zoom Integration ───────────────────────────────────────────
  const [zoomStatus, setZoomStatus] = useState<ZoomStatus | null>(null);
  const [zoomLoading, setZoomLoading] = useState(false);
  const [zoomError, setZoomError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [transcriptUploading, setTranscriptUploading] = useState(false);
  const [transcriptMsg, setTranscriptMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [transcriptMeetingId, setTranscriptMeetingId] = useState<string | null>(null);
  const [transcriptProgress, setTranscriptProgress] = useState<{ stage: string; percent: number; message: string } | null>(null);
  const [transcriptSelectedFile, setTranscriptSelectedFile] = useState<{ file: File; type: 'vtt' | 'txt' } | null>(null);

  // ─── Document Upload (OCR + AI extraction) ─────────────────────
  // v1.68 — admin/moderator only (matches the backend
  // authorize() gate on POST /api/documents/upload). The
  // section is hidden for non-admin users. The per-row
  // review queue is at /admin/document-insights. Mirrors
  // the transcript-upload pattern: pick file → POST → poll
  // for completion via listMyDocuments.
  const isUploadAuthorized = user?.role === 'admin' || user?.role === 'moderator';
  const [docUploading, setDocUploading] = useState(false);
  const [docMsg, setDocMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [docRecentId, setDocRecentId] = useState<string | null>(null);
  const [docRecentStatus, setDocRecentStatus] = useState<string | null>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const transcriptRef = useRef<HTMLInputElement>(null);
  const transcriptPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // v1.70 — fix #8: client-side upload size validation. The file
  // picker accepted files of any size; a 50MB upload would be POSTed
  // in full before the backend's multer limit kicked in (25 MB for
  // docs, 5 MB for Zoom transcripts). Validating up-front avoids the
  // wasted bandwidth + clearer error than "Request failed".
  // Limits mirror the backend multer caps exactly so a "passes here
  // but fails server-side" mismatch is impossible.
  const MAX_DOC_UPLOAD_BYTES = 25 * 1024 * 1024;     // backend: documentController.ts:52
  const MAX_TRANSCRIPT_UPLOAD_BYTES = 5 * 1024 * 1024; // backend: routes/zoom.ts:31
  function formatMB(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(1);
  }
  function validateUploadSize(file: File, maxBytes: number, label: string): string | null {
    if (file.size > maxBytes) {
      return `${label} is ${formatMB(file.size)} MB — exceeds the ${formatMB(maxBytes)} MB limit. Pick a smaller file.`;
    }
    return null;
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('zoom_connected') === '1') {
      setZoomStatus({ connected: true });
      window.history.replaceState({}, '', '/account');
    } else if (params.get('zoom_error')) {
      setZoomError(decodeURIComponent(params.get('zoom_error')!));
      window.history.replaceState({}, '', '/account');
    }
  }, []);

  const fetchZoomStatus = async () => {
    try {
      const res = await api.get<ZoomStatus>('/zoom/auth/status');
      setZoomStatus(res.data);
    } catch {
      setZoomStatus({ connected: false });
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchZoomStatus();
    }
  }, [user]);

  const handleConnectZoom = async () => {
    setZoomLoading(true);
    setZoomError(null);
    try {
      const res = await api.get<{ authUrl: string }>('/zoom/auth/connect');
      if (res.data.authUrl) {
        window.location.href = res.data.authUrl;
      }
    } catch {
      setZoomError('Could not connect to Zoom. Please try again.');
    } finally {
      setZoomLoading(false);
    }
  };

  const handleDisconnectZoom = async () => {
    if (!confirm('Disconnect your Zoom account? Your processed meetings will remain but won\'t update.')) return;
    setDisconnecting(true);
    try {
      await api.delete('/zoom/auth/disconnect');
      setZoomStatus({ connected: false });
    } catch {
      setZoomError('Failed to disconnect. Please try again.');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/'); };

  // Poll progress while a transcript is processing
  useEffect(() => {
    if (!transcriptMeetingId) return;
    const poll = () => {
      api.get<{ stage: string; percent: number; message: string; status: string }>(
        `/zoom/meetings/${transcriptMeetingId}/progress`
      ).then(res => {
        setTranscriptProgress(res.data);
        if (res.data.status === 'completed' || res.data.status === 'done' || res.data.stage === 'done' || res.data.stage === 'failed') {
          setTranscriptMeetingId(null);
          if (res.data.stage === 'failed') {
            setTranscriptMsg({ type: 'err', text: res.data.message || 'Processing failed.' });
          } else {
            setTranscriptMsg({ type: 'ok', text: `Processing done — ${res.data.message}` });
          }
        } else {
          transcriptPollRef.current = setTimeout(poll, 2000);
        }
      }).catch(() => {
        transcriptPollRef.current = setTimeout(poll, 3000);
      });
    };
    poll();
    return () => { if (transcriptPollRef.current) clearTimeout(transcriptPollRef.current); };
  }, [transcriptMeetingId]);

  // Handle Process button — show confirmation modal
  const handleTranscriptProcess = useCallback(() => {
    if (!transcriptSelectedFile) return;
    const topic = (document.getElementById('transcript-topic') as HTMLInputElement)?.value?.trim();
    if (!topic) { setTranscriptMsg({ type: 'err', text: 'Add a meeting topic first.' }); return; }
    setShowProcessModal(true);
  }, [transcriptSelectedFile]);

  // Confirmed in modal — start upload
  const confirmTranscriptProcess = useCallback(() => {
    if (!transcriptSelectedFile) return;
    const topic = (document.getElementById('transcript-topic') as HTMLInputElement)?.value?.trim();
    setShowProcessModal(false);
    setTranscriptMsg(null);
    setTranscriptProgress({ stage: 'queued', percent: 0, message: 'Uploading…' });
    setTranscriptUploading(true);
    const form = new FormData();
    form.append('file', transcriptSelectedFile.file);
    form.append('meetingTopic', topic!);
    api.post('/zoom/upload-transcript', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(res => { setTranscriptMeetingId(res.data.meetingId); })
      .catch((err) => {
        setTranscriptMsg({ type: 'err', text: (err as Error).message || 'Upload failed.' });
        setTranscriptUploading(false);
      });
  }, [transcriptSelectedFile]);

  // Cancel selected file
  const handleTranscriptCancel = useCallback(() => {
    setTranscriptSelectedFile(null);
    setTranscriptProgress(null);
    setTranscriptMsg(null);
    if (transcriptRef.current) transcriptRef.current.value = '';
  }, []);

  // ─── Document upload handlers ───────────────────────────────────
  // File pick → POST /api/documents/upload (multipart) → poll
  // /api/documents/my every 3s until the record hits 'completed'
  // or 'failed'. Mirrors the transcript-upload polling pattern.
  const docPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => { if (docPollRef.current) clearTimeout(docPollRef.current); };
  }, []);

  const pollDoc = useCallback((documentId: string) => {
    api.get<{ items: Array<{ _id: string; status: string; insightsGenerated: number; fileName: string }> }>('/documents/my')
      .then(res => {
        const me = res.data.items.find(d => d._id === documentId);
        if (!me) return;
        setDocRecentStatus(me.status);
        if (me.status === 'completed' || me.status === 'failed') {
          if (me.status === 'completed') {
            setDocMsg({ type: 'ok', text: `Extracted ${me.insightsGenerated} insight${me.insightsGenerated === 1 ? '' : 's'} — admin will review at /admin/document-insights.` });
          } else {
            setDocMsg({ type: 'err', text: 'Extraction failed. See server logs.' });
          }
          setDocUploading(false);
          return;
        }
        docPollRef.current = setTimeout(() => pollDoc(documentId), 3000);
      })
      .catch(() => {
        setDocMsg({ type: 'err', text: 'Lost connection while polling.' });
        setDocUploading(false);
      });
  }, []);

  const handleDocFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = validateUploadSize(file, MAX_DOC_UPLOAD_BYTES, 'Document file');
    if (err) { setDocMsg({ type: 'err', text: err }); setDocUploading(false); return; }
    setDocMsg(null);
    setDocUploading(true);

    const form = new FormData();
    form.append('file', file);
    form.append('title', file.name.replace(/\.[^.]+$/, ''));

    api.post<{ document: { _id: string } }>('/documents/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
      .then(res => {
        setDocRecentId(res.data.document._id);
        setDocRecentStatus('uploaded');
        setDocMsg({ type: 'ok', text: 'Uploaded. OCR + AI extraction in progress…' });
        pollDoc(res.data.document._id);
      })
      .catch((err) => {
        const status = (err as { response?: { status?: number; data?: { message?: string } } })?.response?.status;
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        if (status === 503) {
          setDocMsg({ type: 'err', text: 'Document processing is disabled on this server (no Redis).' });
        } else if (msg) {
          setDocMsg({ type: 'err', text: msg });
        } else {
          setDocMsg({ type: 'err', text: 'Upload failed.' });
        }
        setDocUploading(false);
      });
  };

  const zoomConnectedAt = zoomStatus?.connectedAt
    ? new Date(zoomStatus.connectedAt).toLocaleDateString()
    : null;

  // Relative time label for last sync
  const formatRelativeTime = (dateStr?: string): string | null => {
    if (!dateStr) return null;
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 0) return 'just now';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };
  const lastSyncedLabel = formatRelativeTime(zoomStatus?.lastSyncedAt);

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      {/* pt-20 / pt-24 clears the fixed Navbar (h-14 on mobile, h-16 on sm+).
          Without it the "Account" heading sits behind the header. */}
      <div className="max-w-xl mx-auto px-4 pt-20 sm:pt-24 pb-8 sm:pb-10 space-y-6">
        {/* Page title + back */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">Account</h1>
            <p className="text-sm text-ink-faint mt-0.5">Manage your profile and integrations</p>
          </div>
          <button
            onClick={() => {
              // navigate(-1) is unsafe if the user landed on /account directly —
              // it can push them to about:blank or outside the SPA. Default to
              // home in that case.
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/');
              }
            }}
            className="flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Back
          </button>
        </div>

        {/* Profile card (avatar + name/email edit) */}
        <ProfileCard />

        {/* Password card */}
        <PasswordCard />

        {user?.role === 'admin' && (
          /* Zoom integration card */
          <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Zoom icon */}
                <div className="w-10 h-10 rounded-xl bg-[#2D8CFF]/10 flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M15.5 8.5l5-3v9l-5-3v-3z" fill="#2D8CFF"/>
                    <rect x="2" y="6" width="11" height="12" rx="2" stroke="#2D8CFF" strokeWidth="1.5" fill="none"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-ink">Zoom Integration</h2>
                  <p className="text-xs text-ink-faint mt-0.5">
                    {zoomStatus?.connected
                      ? `Connected · since ${zoomConnectedAt}`
                      : 'Connect to auto-import meeting transcripts'}
                  </p>
                  {zoomStatus?.connected && lastSyncedLabel && (
                    <p className="text-[11px] text-ink-faint mt-0.5 flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      Last synced: {lastSyncedLabel}
                    </p>
                  )}
                </div>
              </div>

              {/* Connection badge */}
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                zoomStatus?.connected
                  ? 'bg-accent/10 text-accent border border-accent/30'
                  : 'bg-gray-100 text-gray-500 border border-gray-200'
              }`}>
                {zoomStatus?.connected ? 'Connected' : 'Not connected'}
              </span>
            </div>

            {/* Error message */}
            {zoomError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                {zoomError}
              </div>
            )}

            {/* Action button */}
            {zoomStatus?.connected ? (
              <button
                onClick={handleDisconnectZoom}
                disabled={disconnecting}
                className="w-full px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect Zoom'}
              </button>
            ) : (
              <button
                onClick={handleConnectZoom}
                disabled={zoomLoading}
                className="w-full px-4 py-2.5 rounded-xl bg-[#2D8CFF] text-accent-text text-sm font-semibold hover:bg-[#1a78ef] active:bg-[#1560d4] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {zoomLoading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Redirecting to Zoom...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M15.5 8.5l5-3v9l-5-3v-3z" fill="white"/>
                      <rect x="2" y="6" width="11" height="12" rx="2" stroke="white" strokeWidth="1.5" fill="none"/>
                    </svg>
                    Connect Zoom Account
                  </>
                )}
              </button>
            )}

            <p className="text-xs text-ink-faint text-center">
              {zoomStatus?.connected
                ? 'Your Zoom account is linked. New recordings will auto-process.'
                : 'You\'ll be redirected to Zoom to authorize access to your recordings.'}
            </p>

            {/* Manual transcript upload — robustness fallback when webhook fails */}
            {(zoomStatus?.connected || (user?.role === 'admin' || user?.role === 'moderator')) && (
              <div className="border-t border-border/60 pt-5 mt-1 space-y-3.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xs font-semibold text-ink">Manual Transcript Upload</h3>
                    <p className="text-[10px] text-ink-faint mt-0.5">When the webhook misses a meeting, drop the file here to extract FAQs.</p>
                  </div>
                </div>

                {/* Topic field — always required */}
                <div>
                  <label htmlFor="transcript-topic" className="text-[11px] font-medium text-ink-soft mb-1.5 block">Meeting topic <span className="text-danger">*</span></label>
                  <input
                    id="transcript-topic"
                    type="text"
                    placeholder="e.g. Q3 Planning, Sprint Retro, Product Review…"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-bg text-sm text-ink placeholder-ink-faint/60 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
                  />
                </div>

                {/* Choose file format — step 1 of 3-step upload flow */}
                <div>
                  <p className="text-[11px] font-medium text-ink-soft mb-1.5">Choose file format</p>
                  <div className="grid grid-cols-2 gap-2">
                    {/* VTT upload */}
                    <div className="flex flex-col gap-1.5">
                      <input
                        ref={transcriptRef}
                        type="file"
                        accept=".vtt,text/vtt"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          const err = validateUploadSize(file, MAX_TRANSCRIPT_UPLOAD_BYTES, 'VTT file');
                          if (err) { setTranscriptMsg({ type: 'err', text: err }); return; }
                          setTranscriptSelectedFile({ file, type: 'vtt' });
                          setTranscriptMsg(null);
                        }}
                        className="hidden"
                        id="transcript-upload-vtt"
                      />
                      <label
                        htmlFor="transcript-upload-vtt"
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl border border-dashed border-accent/40 bg-accent/5 text-accent hover:bg-accent/10 hover:border-accent/60 text-xs font-medium cursor-pointer transition-all"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9V3M3 5l3 3 3-3M2 10h8"/></svg>
                        Zoom .vtt
                      </label>
                    </div>

                    {/* TXT upload */}
                    <div className="flex flex-col gap-1.5">
                      <input
                        type="file"
                        accept=".txt,text/plain"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          const err = validateUploadSize(file, MAX_TRANSCRIPT_UPLOAD_BYTES, 'TXT file');
                          if (err) { setTranscriptMsg({ type: 'err', text: err }); return; }
                          setTranscriptSelectedFile({ file, type: 'txt' });
                          setTranscriptMsg(null);
                        }}
                        className="hidden"
                        id="transcript-upload-txt"
                      />
                      <label
                        htmlFor="transcript-upload-txt"
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl border border-dashed border-accent/40 bg-accent/5 text-accent hover:bg-accent/10 hover:border-accent/60 text-xs font-medium cursor-pointer transition-all"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9V3M3 5l3 3 3-3M2 10h8"/></svg>
                        Plain .txt
                      </label>
                    </div>
                  </div>
                </div>

                {/* State-dependent area: file selected → Process/Cancel, processing → progress, done → success */}
                {transcriptProgress?.stage === 'done' ? (
                  <div className="flex items-center justify-between px-3 py-2 bg-accent/10 border border-accent/30 rounded-xl">
                    <span className="text-xs text-accent">Done — {transcriptProgress.message}</span>
                    <button onClick={handleTranscriptCancel} className="text-[10px] text-accent hover:text-accent-hover font-medium underline">Upload another</button>
                  </div>
                ) : transcriptMeetingId ? (
                  <div className="px-3 py-2.5 bg-accent/5 border border-accent/20 rounded-xl">
                    <div className="flex items-center justify-between text-[11px] text-accent font-medium mb-1.5">
                      <span className="capitalize">{transcriptProgress?.stage}</span>
                      <span>{transcriptProgress?.percent}%</span>
                    </div>
                    <div className="h-1.5 bg-accent/15 rounded-full overflow-hidden mb-1.5">
                      <div className="h-full bg-accent rounded-full transition-all duration-700 ease-out" style={{ width: `${transcriptProgress?.percent ?? 0}%` }} />
                    </div>
                    <p className="text-[10px] text-accent/70">{transcriptProgress?.message}</p>
                  </div>
                ) : transcriptSelectedFile ? (
                  <div className="px-3 py-2.5 bg-accent/5 border border-accent/20 rounded-xl space-y-2">
                    <div className="flex items-center gap-2">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent flex-shrink-0">
                        <path d="M6 9V3M3 5l3 3 3-3M2 10h8"/>
                      </svg>
                      <span className="text-xs text-accent font-medium truncate">{transcriptSelectedFile?.file.name}</span>
                      <span className="text-[10px] text-accent/50 flex-shrink-0">.{transcriptSelectedFile?.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleTranscriptProcess}
                        disabled={transcriptUploading}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-text text-xs font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        Process
                      </button>
                      <button
                        onClick={handleTranscriptCancel}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-ink text-xs font-medium hover:bg-mist transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {transcriptMsg && (
                  <div className={`text-xs px-3 py-2 rounded-lg ${
                    transcriptMsg.type === 'ok'
                      ? 'bg-accent/10 text-accent border border-accent/30'
                      : 'bg-red-50 text-red-600 border border-red-200'
                  }`}>
                    {transcriptMsg.text}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Document Upload — OCR + AI extraction. Admin/moderator
            only (v1.68 — was open to all authed users). Hidden
            for regular users; the per-row review queue lives at
            /admin/document-insights. */}
        {isUploadAuthorized && (
        <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-ink">Upload Knowledge Document</h3>
              <p className="text-[11px] text-ink-faint mt-0.5">
                Drop an image, PDF, DOCX, or XLSX. We OCR + extract FAQ / Policy / HowTo insights
                via AI. Admins review and promote at <code className="font-mono">/admin/document-insights</code>.
              </p>
            </div>
          </div>

          <div>
            <input
              ref={docRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf,.pdf,.docx,.xlsx"
              onChange={handleDocFilePicked}
              className="hidden"
              id="doc-upload"
            />
            <label
              htmlFor="doc-upload"
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl border border-dashed border-accent/40 bg-accent/5 text-accent hover:bg-accent/10 hover:border-accent/60 text-xs font-semibold cursor-pointer transition-all"
            >
              {docUploading ? (
                <>
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" strokeOpacity="0.25"/>
                    <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round"/>
                  </svg>
                  Processing{docRecentStatus ? ` — ${docRecentStatus.replace('_', ' ')}` : '…'}
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Choose file (max 25 MB)
                </>
              )}
            </label>
            <p className="text-[10px] text-ink-faint mt-1.5 text-center">
              PNG · JPEG · PDF · DOCX · XLSX
            </p>
          </div>

          {docMsg && (
            <div className={`px-3 py-2 rounded-xl text-xs ${
              docMsg.type === 'ok'
                ? 'bg-accent/10 border border-accent/30 text-accent'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {docMsg.text}
              {docMsg.type === 'ok' && docRecentStatus === 'completed' && docRecentId && (
                <span className="block text-[10px] mt-1 text-ink-faint">
                  Recent document id: <code className="font-mono">{docRecentId.slice(-8)}</code>
                </span>
              )}
            </div>
          )}
        </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full px-4 py-2.5 rounded-xl border border-border text-ink text-sm font-medium hover:bg-cream transition-all"
        >
          Sign Out
        </button>

      </div>
      {/* Process confirmation modal */}
      {showProcessModal && transcriptSelectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setShowProcessModal(false)} />
          <div className="relative bg-bg rounded-2xl shadow-2xl border border-border w-full max-w-sm p-6 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-ink">Process transcript?</h3>
              <p className="text-xs text-ink-faint mt-1">This will send the file to AI for FAQ extraction. This action cannot be undone.</p>
            </div>
            <div className="bg-cream rounded-xl px-3 py-2 space-y-1">
              <div className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent"><path d="M6 9V3M3 5l3 3 3-3M2 10h8"/></svg>
                <span className="text-xs text-ink font-medium truncate">{transcriptSelectedFile.file.name}</span>
              </div>
              <div className="text-[10px] text-ink-faint">
                Topic: {(document.getElementById('transcript-topic') as HTMLInputElement)?.value || '—'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={confirmTranscriptProcess}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent text-accent-text text-sm font-semibold hover:bg-accent-hover transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Confirm & Process
              </button>
              <button
                onClick={() => setShowProcessModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-ink text-sm font-medium hover:bg-cream transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
