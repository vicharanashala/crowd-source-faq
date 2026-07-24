import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import adminApi from '../../utils/adminApi';
import { inputStandard } from '../../../styles/style_config';

interface Mentor {
  _id: string;
  name: string;
  email: string;
  designation?: string;
  bio?: string;
  profilePicture?: string;
  officeHours?: string;
  meetingLink?: string;
  status: 'active' | 'archived';
  projectsAssigned?: number;
}

export default function AdminMentorsTab() {
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMentor, setEditingMentor] = useState<Mentor | null>(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    designation: '',
    bio: '',
    profilePicture: '',
    officeHours: '',
    meetingLink: '',
  });

  const fetchMentors = useCallback(async () => {
    try {
      const res = await adminApi.get('/admin/mentors');
      setMentors(res.data);
    } catch (error) {
      console.error('Error fetching mentors', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMentors(); }, [fetchMentors]);

  const openCreate = () => {
    setEditingMentor(null);
    setForm({ name: '', email: '', designation: '', bio: '', profilePicture: '', officeHours: '', meetingLink: '' });
    setIsModalOpen(true);
  };

  const openEdit = (m: Mentor) => {
    setEditingMentor(m);
    setForm({
      name: m.name,
      email: m.email,
      designation: m.designation || '',
      bio: m.bio || '',
      profilePicture: m.profilePicture || '',
      officeHours: m.officeHours || '',
      meetingLink: m.meetingLink || '',
    });
    setIsModalOpen(true);
  };

  const handleArchive = async (id: string) => {
    if (!window.confirm('Archive this mentor? They will no longer appear in selections.')) return;
    try {
      await adminApi.put(`/admin/mentors/${id}/archive`);
      fetchMentors();
    } catch (error) {
      console.error('Error archiving mentor', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingMentor) {
        await adminApi.put(`/admin/mentors/${editingMentor._id}`, form);
      } else {
        await adminApi.post('/admin/mentors', form);
      }
      setIsModalOpen(false);
      fetchMentors();
    } catch (error) {
      console.error('Error saving mentor', error);
      alert('Failed to save mentor.');
    }
  };

  if (loading) return <div className="p-8 text-center text-ink-soft">Loading mentors...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Mentors</h2>
          <p className="text-sm text-ink-faint mt-0.5">Manage mentor profiles. Projects reference these mentors.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-[rgb(var(--bg-primary-rgb))] font-medium rounded-lg hover:bg-accent/90 transition-colors shadow-sm"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Mentor
        </button>
      </div>

      {/* Mentor Cards */}
      {mentors.length === 0 ? (
        <div className="bg-card border-2 border-dashed border-border rounded-xl p-12 text-center">
          <p className="text-ink-soft">No mentors added yet. Create a mentor to assign them to projects.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mentors.map((m) => (
            <div key={m._id} className="bg-card border border-border rounded-xl p-5 group hover:border-accent/30 transition-all">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center text-[rgb(var(--bg-primary-rgb))] text-lg font-bold font-serif flex-shrink-0">
                  {m.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-ink truncate">{m.name}</h3>
                  <p className="text-xs text-ink-faint truncate">{m.designation || 'No designation'}</p>
                  <p className="text-xs text-ink-faint truncate">{m.email}</p>
                </div>
              </div>

              {m.bio && (
                <p className="text-xs text-ink-soft leading-relaxed mb-3 line-clamp-2">{m.bio}</p>
              )}

              <div className="flex items-center gap-3 text-[10px] text-ink-faint mb-4">
                {m.officeHours && <span>Office: {m.officeHours}</span>}
                {m.meetingLink && <span className="text-accent">Meeting Link ↗</span>}
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3 mt-2">
                <div className="text-xs font-medium text-ink-soft">
                  <span className="text-ink font-bold">{m.projectsAssigned || 0}</span> {m.projectsAssigned === 1 ? 'Project' : 'Projects'}
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(m)} className="text-xs text-ink-soft hover:text-ink font-medium transition-colors">Edit</button>
                  <span className="text-border">·</span>
                  <button onClick={() => handleArchive(m._id)} className="text-xs text-danger/60 hover:text-danger font-medium transition-colors">Archive</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-border bg-bg/50">
                <h2 className="text-xl font-bold text-ink">{editingMentor ? 'Edit Mentor' : 'Add Mentor'}</h2>
              </div>

              <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                <form id="mentor-form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">Name *</label>
                      <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputStandard} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">Email *</label>
                      <input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputStandard} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">Designation</label>
                    <input type="text" value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} className={inputStandard} placeholder="e.g. Senior Engineer" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">Bio</label>
                    <textarea rows={3} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:border-accent transition-all resize-none" placeholder="Short bio..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">Office Hours</label>
                      <input type="text" value={form.officeHours} onChange={e => setForm(f => ({ ...f, officeHours: e.target.value }))} className={inputStandard} placeholder="Mon/Wed 3-5pm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">Meeting Link</label>
                      <input type="url" value={form.meetingLink} onChange={e => setForm(f => ({ ...f, meetingLink: e.target.value }))} className={inputStandard} placeholder="https://zoom.us/j/..." />
                    </div>
                  </div>
                </form>
              </div>

              <div className="p-6 border-t border-border bg-bg/50 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-lg text-ink-soft hover:bg-bg hover:text-ink transition-colors font-medium">Cancel</button>
                <button type="submit" form="mentor-form" className="px-5 py-2.5 rounded-lg bg-accent text-[rgb(var(--bg-primary-rgb))] font-medium hover:bg-accent/90 transition-colors shadow-sm">
                  {editingMentor ? 'Save Changes' : 'Add Mentor'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
