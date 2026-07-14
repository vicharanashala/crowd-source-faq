import React, { useEffect, useState } from 'react';
import adminApi from '../../utils/adminApi';

interface Orientation {
  _id: string;
  title: string;
  description: string;
  videoUrl: string;
  transcript: string;
  completionThreshold: number;
  createdAt: string;
}

export default function AdminOrientationTab() {
  const [orientations, setOrientations] = useState<Orientation[]>([]);
  const [metrics, setMetrics] = useState({ totalQuestions: 0 });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [transcript, setTranscript] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTranscriptText, setEditTranscriptText] = useState('');
  const [completionThreshold, setCompletionThreshold] = useState<number>(90);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [oriRes, metRes] = await Promise.all([
        adminApi.get('/admin/welcome/orientations'),
        adminApi.get('/admin/welcome/orientations/metrics'),
      ]);
      setOrientations(oriRes.data);
      setMetrics(metRes.data);
    } catch (error) {
      console.error('Error fetching orientation data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    if (transcript.trim()) {
      formData.append('transcript', transcript);
    }
    formData.append('completionThreshold', completionThreshold.toString());
    formData.append('video', file);

    try {
      await adminApi.post('/admin/welcome/orientations', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setTitle('');
      setDescription('');
      setTranscript('');
      setFile(null);
      fetchData();
    } catch (error) {
      console.error('Error uploading orientation', error);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this orientation?')) return;
    try {
      await adminApi.delete(`/admin/welcome/orientations/${id}`);
      fetchData();
    } catch (error) {
      console.error('Error deleting orientation', error);
    }
  };

  const handleUpdateTranscript = async (id: string) => {
    try {
      // Find the orientation to keep its existing threshold if we only update transcript here
      // But actually, we could allow updating threshold here too. Let's just update transcript for now.
      await adminApi.put(`/admin/welcome/orientations/${id}`, {
        transcript: editTranscriptText
      });
      setEditingId(null);
      fetchData();
    } catch (error) {
      console.error('Error updating transcript', error);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-wider mb-1">Total AI Questions</p>
          <p className="text-3xl font-bold text-ink">{metrics.totalQuestions}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-ink mb-4">Upload New Orientation</h2>
        <form onSubmit={handleUpload} className="space-y-4 max-w-xl">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="w-full bg-bg border border-border rounded-lg px-4 py-2 text-ink"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
              className="w-full bg-bg border border-border rounded-lg px-4 py-2 text-ink h-20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Transcript (Optional)</label>
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="Leave blank to use default mock transcript"
              className="w-full bg-bg border border-border rounded-lg px-4 py-2 text-ink h-24"
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-ink">Completion Threshold</label>
              <span className="text-sm text-accent font-medium">{completionThreshold}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={completionThreshold}
              onChange={e => setCompletionThreshold(parseInt(e.target.value))}
              className="w-full accent-accent"
            />
            <p className="text-xs text-ink-faint mt-1">Percentage of the video the user must watch to complete orientation.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Video File</label>
            <input
              type="file"
              accept="video/*"
              onChange={e => setFile(e.target.files?.[0] || null)}
              required
              className="block w-full text-sm text-ink-soft
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-accent/10 file:text-accent
                hover:file:bg-accent/20"
            />
          </div>
          <button
            type="submit"
            disabled={uploading}
            className="px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload Video'}
          </button>
        </form>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-mist/50">
          <h2 className="text-sm font-bold text-ink">Orientation History</h2>
        </div>
        <ul className="divide-y divide-border">
          {orientations.map(o => (
            <li key={o._id} className="p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-ink">{o.title}</h3>
                  <p className="text-sm text-ink-faint mt-1">{o.description}</p>
                  <div className="text-xs text-ink-faint mt-2 flex gap-4">
                    <span>Uploaded: {new Date(o.createdAt).toLocaleDateString()}</span>
                    <span>Threshold: {o.completionThreshold}%</span>
                    <button onClick={() => setPreviewUrl(o.videoUrl)} className="text-accent hover:underline">Preview Video</button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingId(editingId === o._id ? null : o._id);
                      setEditTranscriptText(o.transcript || '');
                    }}
                    className="px-3 py-1.5 text-sm text-ink-faint hover:bg-bg rounded-md transition-colors border border-border"
                  >
                    {editingId === o._id ? 'Cancel Edit' : 'Edit Transcript'}
                  </button>
                  <button
                    onClick={() => handleDelete(o._id)}
                    className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {editingId === o._id && (
                <div className="bg-bg border border-border rounded-lg p-4 mt-2">
                  <label className="block text-sm font-medium text-ink mb-2">Edit Transcript</label>
                  <textarea
                    value={editTranscriptText}
                    onChange={e => setEditTranscriptText(e.target.value)}
                    className="w-full bg-card border border-border rounded-lg px-4 py-2 text-ink h-32 mb-3"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 text-sm text-ink-faint hover:bg-bg rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleUpdateTranscript(o._id)}
                      className="px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:bg-accent/90"
                    >
                      Save Transcript
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {orientations.length === 0 && (
            <div className="p-8 text-center text-ink-faint">No orientations uploaded yet.</div>
          )}
        </ul>
      </div>

      {/* Video Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setPreviewUrl(null)}></div>
          <div className="relative w-full max-w-4xl bg-black rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex justify-end p-4 absolute top-0 right-0 z-10 bg-gradient-to-b from-black/50 to-transparent w-full pointer-events-none">
              <button onClick={() => setPreviewUrl(null)} className="text-white hover:text-red-400 pointer-events-auto">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <video src={previewUrl} controls autoPlay className="w-full max-h-[80vh]" />
          </div>
        </div>
      )}
    </div>
  );
}
