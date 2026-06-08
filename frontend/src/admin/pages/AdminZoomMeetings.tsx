import { useEffect, useState, useCallback, useRef, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import adminApi from '../utils/adminApi';

interface ZoomMeeting {
  _id: string;
  zoomMeetingId: string;
  topic: string;
  startTime: string;
  duration: number;
  hostEmail: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  insightCount: number;
  createdAt: string;
  progress?: { stage: string; percent: number; message: string };
}

interface MeetingsResponse {
  meetings: ZoomMeeting[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface ZoomStatus {
  connected: boolean;
  connectedAt?: string;
  zoomUserId?: string;
  hasCredentials: boolean;
}

type StatusFilter = 'all' | 'pending' | 'processing' | 'completed' | 'failed';

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function timeAgo(d: string): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusBadge({ status }: { status: ZoomMeeting['status'] }) {
  const styles: Record<ZoomMeeting['status'], string> = {
    pending:    'bg-warning/10 text-warning',
    processing: 'bg-blue-500/10 text-blue-400',
    completed:  'bg-success/10 text-success',
    failed:     'bg-danger/10 text-danger',
  };
  const labels: Record<ZoomMeeting['status'], string> = {
    pending: 'Pending', processing: 'Processing', completed: 'Completed', failed: 'Failed',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function MeetingRowSkeleton() {
  return (
    <tr className="admin-tr">
      <td className="px-4 py-3"><div className="h-4 w-32 bg-mist rounded animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-4 w-24 bg-mist rounded animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-4 w-12 bg-mist rounded animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-4 w-16 bg-mist rounded animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-4 w-8 bg-mist rounded animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-4 w-20 bg-mist rounded animate-pulse" /></td>
    </tr>
  );
}

export default function AdminZoomMeetings() {
  const [meetings, setMeetings] = useState<ZoomMeeting[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [stats, setStats] = useState({ total: 0, processing: 0, completed: 0, failed: 0 });

  const [zoomStatus, setZoomStatus] = useState<ZoomStatus | null>(null);
  const [zoomLoading, setZoomLoading] = useState(false);
  const [zoomError, setZoomError] = useState<string | null>(null);

  const [uploadMsg, setUploadMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ stage: string; percent: number; message: string } | null>(null);
  const [uploadSelectedFile, setUploadSelectedFile] = useState<{ file: File; type: 'vtt' | 'txt' } | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [uploadMeetingId, setUploadMeetingId] = useState<string | null>(null);
  const uploadPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('zoom_connected') === '1') {
      setZoomStatus((prev) => prev ? { ...prev, connected: true } : { connected: true, hasCredentials: true });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('zoom_error')) {
      setZoomError(decodeURIComponent(params.get('zoom_error')!));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const fetchMeetings = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '10' });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    adminApi.get<MeetingsResponse>(`/zoom/meetings?${params}`)
      .then(res => { setMeetings(res.data.meetings); setTotal(res.data.total); setPages(res.data.pages); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  const fetchStats = () => {
    Promise.all([
      adminApi.get<{ total: number }>('/zoom/meetings?limit=1'),
      adminApi.get<{ meetings: ZoomMeeting[] }>('/zoom/meetings?limit=1000&status=processing'),
      adminApi.get<{ meetings: ZoomMeeting[] }>('/zoom/meetings?limit=1000&status=completed'),
      adminApi.get<{ meetings: ZoomMeeting[] }>('/zoom/meetings?limit=1000&status=failed'),
    ]).then(([all, proc, comp, fail]) => {
      setStats({ total: all.data.total, processing: proc.data.meetings.length, completed: comp.data.meetings.length, failed: fail.data.meetings.length });
    }).catch(() => {});
  };

  const fetchZoomStatus = useCallback(() => {
    adminApi.get<ZoomStatus>('/zoom/auth/status')
      .then(res => setZoomStatus(res.data))
      .catch(() => setZoomStatus({ connected: false, hasCredentials: false }));
  }, []);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);
  useEffect(() => { fetchStats(); }, []);
  useEffect(() => { fetchZoomStatus(); }, [fetchZoomStatus]);

  const handleConnectZoom = async () => {
    setZoomLoading(true);
    setZoomError(null);
    try {
      const res = await adminApi.get<{ authUrl: string }>('/zoom/auth/connect');
      window.location.href = res.data.authUrl;
    } catch (err: any) {
      setZoomError(err.response?.data?.message || 'Failed to start Zoom OAuth flow');
      setZoomLoading(false);
    }
  };

  const handleTranscriptUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const type = ext === 'vtt' ? 'vtt' : 'txt';
    setUploadSelectedFile({ file, type });
    setUploadMsg(null);
  };

  const handleTranscriptProcess = () => {
    if (!uploadSelectedFile) return;
    const topic = (document.getElementById('upload-topic') as HTMLInputElement)?.value?.trim();
    if (!topic) { setUploadMsg({ type: 'err', text: 'Enter a meeting topic first.' }); return; }
    setShowProcessModal(true);
  };

  const confirmTranscriptProcess = () => {
    if (!uploadSelectedFile) return;
    const topic = (document.getElementById('upload-topic') as HTMLInputElement)?.value?.trim();
    setShowProcessModal(false);
    setUploadMsg(null);
    setUploadProgress({ stage: 'queued', percent: 0, message: 'Uploading…' });
    const form = new FormData();
    form.append('file', uploadSelectedFile.file);
    form.append('meetingTopic', topic!);
    adminApi.post('/zoom/upload-transcript', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(res => { setUploadMeetingId(res.data.meetingId); })
      .catch((err: any) => {
        setUploadMsg({ type: 'err', text: err.response?.data?.message || 'Upload failed.' });
      });
  };

  const handleTranscriptCancel = () => {
    setUploadSelectedFile(null);
    setUploadProgress(null);
    setUploadMsg(null);
    if (uploadRef.current) uploadRef.current.value = '';
  };

  useEffect(() => {
    if (!uploadMeetingId) return;
    const poll = () => {
      adminApi.get<{ stage: string; percent: number; message: string; status: string }>(
        `/zoom/meetings/${uploadMeetingId}/progress`
      ).then(res => {
        setUploadProgress(res.data);
        if (['completed', 'done', 'failed'].includes(res.data.status) || ['done', 'failed'].includes(res.data.stage)) {
          setUploadMeetingId(null);
          if (res.data.stage === 'failed') setUploadMsg({ type: 'err', text: res.data.message });
          else { setUploadMsg({ type: 'ok', text: res.data.message }); fetchMeetings(); }
        } else {
          uploadPollRef.current = setTimeout(poll, 2000);
        }
      }).catch(() => { uploadPollRef.current = setTimeout(poll, 3000); });
    };
    poll();
    return () => { if (uploadPollRef.current) clearTimeout(uploadPollRef.current); };
  }, [uploadMeetingId]);

  const FILTER_TABS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'processing', label: 'Processing' },
    { key: 'completed', label: 'Completed' },
    { key: 'failed', label: 'Failed' },
  ];

  return (
    <>
      <div className="space-y-5 max-w-5xl">
        <p className="text-sm text-ink-faint -mt-2">AI-extracted FAQs and announcements from Zoom recordings</p>

        {/* No credentials banner */}
        {zoomStatus && !zoomStatus.hasCredentials && (
          <div className="flex items-start gap-3 px-4 py-3 bg-warning/10 border border-warning/20 rounded-xl">
            <svg className="flex-shrink-0 mt-0.5 text-warning" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-warning">Zoom App credentials not configured</p>
              <p className="text-xs text-warning/80 mt-0.5">
                Add <code className="font-mono bg-warning/20 px-1 rounded">ZOOM_CLIENT_ID</code> and <code className="font-mono bg-warning/20 px-1 rounded">ZOOM_CLIENT_SECRET</code> to <code className="font-mono bg-warning/20 px-1 rounded">backend/.env.local</code> and restart the server, then connect an admin Zoom account below.
              </p>
            </div>
          </div>
        )}

        {/* Connect banner */}
        {zoomStatus && zoomStatus.hasCredentials && !zoomStatus.connected && (
          <div className="flex items-start gap-3 px-4 py-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <svg className="flex-shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="#2D8CFF" stroke="#2D8CFF">
              <path d="M15.5 8.5l5-3v9l-5-3v-3z" fill="#2D8CFF"/>
              <rect x="2" y="6" width="11" height="12" rx="2" stroke="#2D8CFF" strokeWidth="1.5" fill="none"/>
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-400">Connect an admin Zoom account</p>
              <p className="text-xs text-blue-400/80 mt-0.5">
                Click below to authorize this portal to read your meeting recordings. Recordings will be ingested automatically once the webhook is registered with Zoom.
              </p>
              {zoomError && <p className="text-xs text-danger mt-1.5 font-medium">{zoomError}</p>}
            </div>
            <button
              onClick={handleConnectZoom}
              disabled={zoomLoading}
              className="flex-shrink-0 px-4 py-2 rounded-lg bg-[#2D8CFF] hover:bg-[#1a78ef] text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {zoomLoading ? (
                <><span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin inline-block" />Redirecting…</>
              ) : (
                <><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M15.5 8.5l5-3v9l-5-3v-3z" fill="white"/><rect x="2" y="6" width="11" height="12" rx="2" stroke="white" strokeWidth="1.5" fill="none"/></svg>Connect Zoom</>
              )}
            </button>
          </div>
        )}

        {/* Connected banner */}
        {zoomStatus?.connected && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-success/10 border border-success/20 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <p className="text-sm font-medium text-success">
                Zoom connected
                {zoomStatus.connectedAt && (
                  <span className="text-success/70 font-normal"> · since {new Date(zoomStatus.connectedAt).toLocaleDateString()}</span>
                )}
              </p>
            </div>
            <Link to="/account" className="text-xs text-success/80 hover:text-success font-medium underline underline-offset-2">
              Manage in account settings →
            </Link>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="admin-stat-mini p-4">
            <p className="text-xs text-ink-faint font-medium">Total Meetings</p>
            <p className="text-2xl font-bold text-ink mt-1">{stats.total}</p>
          </div>
          <div className="admin-stat-mini p-4">
            <p className="text-xs text-ink-faint font-medium">Processing</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{stats.processing}</p>
          </div>
          <div className="admin-stat-mini p-4">
            <p className="text-xs text-ink-faint font-medium">Completed</p>
            <p className="text-2xl font-bold text-success mt-1">{stats.completed}</p>
          </div>
          <div className="admin-stat-mini p-4">
            <p className="text-xs text-ink-faint font-medium">Failed</p>
            <p className="text-2xl font-bold text-danger mt-1">{stats.failed}</p>
          </div>
        </div>

        {/* Transcript upload section */}
        <div className="admin-card-surface p-4 space-y-3">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-faint">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <h3 className="text-sm font-semibold text-ink">Upload Transcript</h3>
          </div>
          <p className="text-xs text-ink-faint">Upload a Zoom VTT transcript or plain text file for AI FAQ extraction.</p>

          <input id="upload-topic" type="text" placeholder="Meeting topic (e.g. Q3 Planning, Sprint Retro)" className="admin-input" />

          {uploadSelectedFile && !uploadMeetingId && (
            <div className="px-3 py-2.5 bg-[#2D8CFF]/10 border border-[#2D8CFF]/20 rounded-xl space-y-2">
              <div className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#2D8CFF" strokeWidth="1.5"><path d="M6 9V3M3 5l3 3 3-3M2 10h8"/></svg>
                <span className="text-xs text-[#2D8CFF] font-medium truncate">{uploadSelectedFile.file.name}</span>
                <span className="text-[10px] text-[#2D8CFF]/50 flex-shrink-0">.{uploadSelectedFile.type}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTranscriptProcess}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2D8CFF] text-white text-xs font-semibold hover:bg-[#1a78ef] transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Process
                </button>
                <button onClick={handleTranscriptCancel} className="flex-1 admin-btn-outline text-xs py-1.5">Cancel</button>
              </div>
            </div>
          )}

          {uploadMeetingId && uploadProgress && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-[#2D8CFF] font-medium">
                <span className="capitalize">{uploadProgress.stage}</span>
                <span>{uploadProgress.percent}%</span>
              </div>
              <div className="h-1.5 bg-[#2D8CFF]/15 rounded-full overflow-hidden">
                <div className="h-full bg-[#2D8CFF] rounded-full transition-all duration-700 ease-out" style={{ width: `${uploadProgress.percent}%` }} />
              </div>
              <p className="text-[10px] text-ink-faint">{uploadProgress.message}</p>
            </div>
          )}

          {uploadProgress?.stage === 'done' && (
            <div className="flex items-center justify-between px-3 py-2 bg-success/10 border border-success/20 rounded-xl">
              <span className="text-xs text-success">Done — {uploadProgress.message}</span>
              <button onClick={handleTranscriptCancel} className="text-[10px] text-success/80 hover:text-success font-medium underline">Upload another</button>
            </div>
          )}

          {uploadMsg && !uploadMeetingId && (
            <span className={`text-xs font-medium ${uploadMsg.type === 'ok' ? 'text-success' : 'text-danger'}`}>{uploadMsg.text}</span>
          )}

          <div className="flex items-center gap-3">
            <input ref={uploadRef} type="file" accept=".vtt,.txt,text/vtt,text/plain" onChange={handleTranscriptUpload} className="hidden" id="admin-transcript-upload" />
            <label htmlFor="admin-transcript-upload" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#2D8CFF] text-white hover:bg-[#1a78ef] cursor-pointer transition-colors">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9V3M3 5l3 3 3-3M2 10h8"/></svg>
              Upload .vtt or .txt
            </label>
          </div>
        </div>

        {/* Filter tabs + table */}
        <div className="admin-table-wrap">
          <div className="flex border-b border-border">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setStatusFilter(tab.key); setPage(1); }}
                className={`px-4 py-2.5 text-xs font-semibold transition-colors ${
                  statusFilter === tab.key
                    ? 'text-ink border-b-2 border-accent bg-mist'
                    : 'text-ink-faint hover:text-ink-soft hover:bg-mist'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <table className="w-full">
            <thead>
              <tr className="admin-thead-row">
                <th className="admin-th">Topic</th>
                <th className="admin-th">Date</th>
                <th className="admin-th">Duration</th>
                <th className="admin-th">Status</th>
                <th className="admin-th">Insights</th>
                <th className="admin-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <MeetingRowSkeleton key={i} />)
              ) : meetings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-empty">
                    <svg className="mx-auto mb-2 text-ink-faint" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <p>No meetings found</p>
                    {zoomStatus && !zoomStatus.connected && zoomStatus.hasCredentials && (
                      <button
                        onClick={handleConnectZoom}
                        disabled={zoomLoading}
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2D8CFF] hover:bg-[#1a78ef] text-white text-xs font-semibold disabled:opacity-50 transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15.5 8.5l5-3v9l-5-3v-3z" fill="white"/><rect x="2" y="6" width="11" height="12" rx="2" stroke="white" strokeWidth="1.5" fill="none"/></svg>
                        {zoomLoading ? 'Redirecting…' : 'Connect Zoom to start ingesting recordings'}
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                meetings.map(meeting => (
                  <tr key={meeting._id} className="admin-tr">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-ink max-w-xs truncate">{meeting.topic}</div>
                      <div className="text-[10px] text-ink-faint">{meeting.hostEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-soft">{timeAgo(meeting.startTime)}</td>
                    <td className="px-4 py-3 text-sm text-ink-soft">{formatDuration(meeting.duration)}</td>
                    <td className="px-4 py-3"><StatusBadge status={meeting.status} /></td>
                    <td className="px-4 py-3 text-sm text-ink-soft">{meeting.insightCount}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin/zoom-insights?meetingId=${meeting._id}`}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-medium text-white bg-accent hover:bg-accent/80 transition-colors"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        View Insights
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {pages > 1 && (
            <div className="admin-pagination">
              <span>Page {page} of {pages} · {total} meetings</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="admin-pagination-btn">← Prev</button>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= pages} className="admin-pagination-btn">Next →</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Process confirmation modal */}
      {showProcessModal && uploadSelectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowProcessModal(false)} />
          <div className="admin-modal-panel relative w-full max-w-sm p-6 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-ink">Process transcript?</h3>
              <p className="text-xs text-ink-faint mt-1">This will send the file to AI for FAQ extraction. This action cannot be undone.</p>
            </div>
            <div className="bg-mist rounded-xl px-3 py-2 space-y-1 border border-border">
              <div className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#2D8CFF" strokeWidth="1.5"><path d="M6 9V3M3 5l3 3 3-3M2 10h8"/></svg>
                <span className="text-xs text-ink font-medium truncate">{uploadSelectedFile.file.name}</span>
              </div>
              <div className="text-[10px] text-ink-faint">
                Topic: {(document.getElementById('upload-topic') as HTMLInputElement)?.value || '—'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={confirmTranscriptProcess}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2D8CFF] text-white text-sm font-semibold hover:bg-[#1a78ef] transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Confirm & Process
              </button>
              <button onClick={() => setShowProcessModal(false)} className="flex-1 admin-btn-outline text-sm py-2.5">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
