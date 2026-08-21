import React, { useState, useEffect } from 'react';
import adminApi from '../../utils/adminApi';

type InternshipPhase = 'GENERAL' | 'PHASE_1' | 'PHASE_2' | 'PHASE_3' | 'COMPLETED';

interface InternshipUser {
  _id: string;
  name: string;
  email: string;
  currentPhase: InternshipPhase;
}

const PHASE_LABELS: Record<InternshipPhase, string> = {
  GENERAL: 'General',
  PHASE_1: 'Phase 1',
  PHASE_2: 'Phase 2',
  PHASE_3: 'Phase 3',
  COMPLETED: 'Completed',
};

export default function AdminInternshipPhaseTab() {
  const [users, setUsers] = useState<InternshipUser[]>([]);
  const [filter, setFilter] = useState<'all' | InternshipPhase>('all');
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<InternshipUser | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    try {
      const res = await adminApi.get('/admin/internship');
      setUsers(res.data);
    } catch (error) {
      console.error('Error fetching internship progress', error);
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
    setSaving(true);
    try {
      await adminApi.put(`/admin/internship/${editingUser._id}`, {
        currentPhase: editingUser.currentPhase,
      });
      setEditingUser(null);
      fetchData();
    } catch (error) {
      console.error('Error updating internship phase', error);
      alert('Failed to update.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  const filteredUsers = users.filter((u) => filter === 'all' || u.currentPhase === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-lg font-semibold text-ink">Internship Phase</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'all' | InternshipPhase)}
          className="bg-card border border-border rounded-lg px-4 py-2 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="all">All Users</option>
          <option value="GENERAL">General</option>
          <option value="PHASE_1">Phase 1</option>
          <option value="PHASE_2">Phase 2</option>
          <option value="PHASE_3">Phase 3</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-left text-sm text-ink-soft">
          <thead className="bg-bg border-b border-border text-xs uppercase font-medium text-ink-faint">
            <tr>
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Current Phase</th>
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
                  <span className="px-2 py-1 bg-accent/10 text-accent rounded text-xs font-semibold">
                    {PHASE_LABELS[u.currentPhase]}
                  </span>
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
                <td colSpan={3} className="px-6 py-8 text-center">No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingUser(null)}></div>
          <div className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6">
            <h2 className="text-xl font-bold text-ink mb-4">Set Internship Phase</h2>
            <p className="text-sm text-ink-soft mb-6">Updating phase for <strong>{editingUser.name}</strong></p>

            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Current Phase</label>
                <select
                  value={editingUser.currentPhase}
                  onChange={(e) => setEditingUser({ ...editingUser, currentPhase: e.target.value as InternshipPhase })}
                  className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-ink"
                >
                  <option value="GENERAL">General</option>
                  <option value="PHASE_1">Phase 1</option>
                  <option value="PHASE_2">Phase 2</option>
                  <option value="PHASE_3">Phase 3</option>
                  <option value="COMPLETED">Completed</option>
                </select>
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
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
