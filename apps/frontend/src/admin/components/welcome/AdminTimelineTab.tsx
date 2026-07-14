import React, { useEffect, useState } from 'react';
import adminApi from '../../utils/adminApi';

interface Project {
  _id: string;
  name: string;
  description: string;
  status: 'completed' | 'current' | 'upcoming';
  progress: number;
}

export default function AdminTimelineTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Project | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'completed' | 'current' | 'upcoming'>('upcoming');
  const [progress, setProgress] = useState(0);

  const fetchProjects = async () => {
    try {
      const res = await adminApi.get('/admin/welcome/projects');
      setProjects(res.data);
    } catch (error) {
      console.error('Error fetching projects', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name, description, status, progress };
    try {
      if (editing) {
        await adminApi.put(`/admin/welcome/projects/${editing._id}`, payload);
      } else {
        await adminApi.post('/admin/welcome/projects', payload);
      }
      resetForm();
      fetchProjects();
    } catch (error) {
      console.error('Error saving project', error);
    }
  };

  const handleEdit = (p: Project) => {
    setEditing(p);
    setName(p.name);
    setDescription(p.description);
    setStatus(p.status);
    setProgress(p.progress);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
      await adminApi.delete(`/admin/welcome/projects/${id}`);
      fetchProjects();
    } catch (error) {
      console.error('Error deleting project', error);
    }
  };

  const resetForm = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setStatus('upcoming');
    setProgress(0);
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-8">
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-ink mb-4">{editing ? 'Edit Project' : 'Create Project'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
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
              className="w-full bg-bg border border-border rounded-lg px-4 py-2 text-ink h-24"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className="w-full bg-bg border border-border rounded-lg px-4 py-2 text-ink"
              >
                <option value="completed">Completed</option>
                <option value="current">Current</option>
                <option value="upcoming">Upcoming</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Progress (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={progress}
                onChange={e => setProgress(Number(e.target.value))}
                className="w-full bg-bg border border-border rounded-lg px-4 py-2 text-ink"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90"
            >
              {editing ? 'Update Project' : 'Create Project'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-mist text-ink rounded-lg font-medium hover:bg-mist/80"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-mist/50">
          <h2 className="text-sm font-bold text-ink">Timeline Projects</h2>
        </div>
        <ul className="divide-y divide-border">
          {projects.map(p => (
            <li key={p._id} className="p-5 flex items-center justify-between group">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="font-medium text-ink">{p.name}</h3>
                  <span className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-full ${
                    p.status === 'completed' ? 'bg-green-500/10 text-green-600' :
                    p.status === 'current' ? 'bg-accent/10 text-accent' :
                    'bg-yellow-500/10 text-yellow-600'
                  }`}>
                    {p.status}
                  </span>
                </div>
                <p className="text-sm text-ink-faint mt-1">{p.description}</p>
                <div className="mt-2 text-xs font-medium text-ink-faint">
                  Progress: {p.progress}%
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEdit(p)}
                  className="px-3 py-1.5 text-sm text-ink-soft hover:text-ink hover:bg-mist rounded-md transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(p._id)}
                  className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {projects.length === 0 && (
            <div className="p-8 text-center text-ink-faint">No projects found.</div>
          )}
        </ul>
      </div>
    </div>
  );
}
