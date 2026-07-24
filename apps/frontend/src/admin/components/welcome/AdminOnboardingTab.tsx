import React, { useState, useEffect } from 'react';
import adminApi from '../../utils/adminApi';
import { inputStandard } from '../../../styles/style_config';

interface OnboardingUser {
  _id: string;
  name: string;
  email: string;
  orientationCompleted: boolean;
  projectAssigned?: string;
  mentorAssigned?: string;
  projectSelectionLocked: boolean;
  projectAssignedAt?: string;
}

interface Project {
  projectName: string;
  mentorName: string;
}

export default function AdminOnboardingTab() {
  const [users, setUsers] = useState<OnboardingUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<OnboardingUser | null>(null);

  const fetchData = async () => {
    try {
      const [usersRes, projectsRes] = await Promise.all([
        adminApi.get('/admin/welcome/onboarding-status'),
        adminApi.get('/admin/projects')
      ]);
      setUsers(usersRes.data);
      // Admin might see all, we only need them for mapping
      setProjects(projectsRes.data);
    } catch (error) {
      console.error('Error fetching onboarding data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await adminApi.put(`/admin/welcome/onboarding-override/${editingUser._id}`, {
        projectAssigned: editingUser.projectAssigned,
        mentorAssigned: editingUser.mentorAssigned,
        projectSelectionLocked: editingUser.projectSelectionLocked
      });
      setEditingUser(null);
      fetchData();
    } catch (error) {
      console.error('Error updating onboarding status', error);
      alert('Failed to update.');
    }
  };

  const handleProjectSelect = (projectName: string) => {
    if (!editingUser) return;
    const project = projects.find(p => p.projectName === projectName);
    if (project) {
      setEditingUser({
        ...editingUser,
        projectAssigned: project.projectName,
        mentorAssigned: project.mentorName
      });
    } else {
      setEditingUser({
        ...editingUser,
        projectAssigned: '',
        mentorAssigned: ''
      });
    }
  };

  if (loading) return <div>Loading...</div>;

  const filteredUsers = users.filter(u => {
    switch (filter) {
      case 'orientation-pending': return !u.orientationCompleted;
      case 'orientation-complete': return u.orientationCompleted;
      case 'project-assigned': return !!u.projectAssigned;
      case 'project-unassigned': return !u.projectAssigned;
      case 'all':
      default:
        return true;
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-lg font-semibold text-ink">User Onboarding Status</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-card border border-border rounded-lg px-4 py-2 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="all">All Users</option>
          <option value="orientation-pending">Orientation Pending</option>
          <option value="orientation-complete">Orientation Complete</option>
          <option value="project-assigned">Project Assigned</option>
          <option value="project-unassigned">Project Unassigned</option>
        </select>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-left text-sm text-ink-soft">
          <thead className="bg-bg border-b border-border text-xs uppercase font-medium text-ink-faint">
            <tr>
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Orientation</th>
              <th className="px-6 py-4">Project</th>
              <th className="px-6 py-4">Mentor</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredUsers.map((u) => (
              <tr key={u._id} className="hover:bg-bg/50 transition-colors">
                <td className="px-6 py-4 font-medium text-ink">
                  {u.name}
                  <div className="text-xs text-ink-faint font-normal">{u.email}</div>
                </td>
                <td className="px-6 py-4">
                  {u.orientationCompleted ? (
                    <span className="text-accent font-medium">Completed</span>
                  ) : (
                    <span className="text-warning font-medium">Pending</span>
                  )}
                </td>
                <td className="px-6 py-4">{u.projectAssigned || '-'}</td>
                <td className="px-6 py-4">{u.mentorAssigned || '-'}</td>
                <td className="px-6 py-4">
                  {u.projectSelectionLocked ? (
                    <span className="px-2 py-1 bg-danger/10 text-danger rounded text-xs font-semibold">Locked</span>
                  ) : (
                    <span className="px-2 py-1 bg-accent/10 text-accent rounded text-xs font-semibold">Unlocked</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => setEditingUser(u)}
                    className="text-accent hover:underline font-medium"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center">No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingUser(null)}></div>
          <div className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6">
            <h2 className="text-xl font-bold text-ink mb-4">Edit Onboarding Status</h2>
            <p className="text-sm text-ink-soft mb-6">Modifying status for <strong>{editingUser.name}</strong></p>
            
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Assigned Project</label>
                <select
                  value={editingUser.projectAssigned || ''}
                  onChange={(e) => handleProjectSelect(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-ink"
                >
                  <option value="">-- No Project --</option>
                  {projects.map(p => (
                    <option key={p.projectName} value={p.projectName}>{p.projectName}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Mentor (Auto-mapped)</label>
                <input
                  type="text"
                  readOnly
                  value={editingUser.mentorAssigned || ''}
                  className="w-full bg-bg/50 border border-border rounded-lg px-4 py-2.5 text-ink-soft cursor-not-allowed"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="lockCheckbox"
                  checked={editingUser.projectSelectionLocked}
                  onChange={(e) => setEditingUser({ ...editingUser, projectSelectionLocked: e.target.checked })}
                  className="w-4 h-4 rounded border-border"
                />
                <label htmlFor="lockCheckbox" className="text-sm text-ink">Selection Locked</label>
              </div>

              <div className="flex justify-end gap-3 pt-6">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-lg text-ink-soft hover:bg-bg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:bg-accent/90 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
