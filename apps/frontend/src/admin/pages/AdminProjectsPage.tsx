import React, { useState, useEffect } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { motion, AnimatePresence } from 'framer-motion';
import adminApi from '../utils/adminApi';
import { inputStandardRing } from '../../styles/style_config';

interface Project {
  _id: string;
  projectName: string;
  description: string;
  mentorName?: string;
  mentorEmail?: string;
  mentor?: { _id: string; name: string; email: string } | string;
  status: 'active' | 'inactive' | 'archived';
  resources: string[];
  skills: string[];
  problemStatement?: string;
  whyMatters?: string;
  outcomes?: string;
  difficulty?: 'Beginner Friendly' | 'Intermediate' | 'Advanced';
  weeklyCommitment?: string;
  techStack?: string[];
  deliverables?: string[];
  teamSize?: string;
  capacity: number;
  createdAt: string;
}

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [mentors, setMentors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [formData, setFormData] = useState({
    projectName: '',
    description: '',
    mentor: '',
    status: 'active' as 'active' | 'inactive',
    resources: '',
    skills: '',
    problemStatement: '',
    whyMatters: '',
    outcomes: '',
    difficulty: 'Beginner Friendly' as 'Beginner Friendly' | 'Intermediate' | 'Advanced',
    weeklyCommitment: '',
    techStack: '',
    deliverables: '',
    teamSize: '',
    capacity: 30
  });

  const fetchProjects = async () => {
    try {
      const [resProjects, resMentors] = await Promise.all([
        adminApi.get('/admin/projects'),
        adminApi.get('/admin/mentors/all') // get all mentors to show in dropdown
      ]);
      setProjects(resProjects.data);
      setMentors(resMentors.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useBodyScrollLock(isModalOpen);

  const openCreateModal = () => {
    setEditingProject(null);
    setFormData({
      projectName: '',
      description: '',
      mentor: '',
      status: 'active',
      resources: '',
      skills: '',
      problemStatement: '',
      whyMatters: '',
      outcomes: '',
      difficulty: 'Beginner Friendly',
      weeklyCommitment: '',
      techStack: '',
      deliverables: '',
      teamSize: '',
      capacity: 30
    });
    setIsModalOpen(true);
  };

  const openEditModal = (project: Project) => {
    setEditingProject(project);
    setFormData({
      projectName: project.projectName,
      description: project.description,
      mentor: typeof project.mentor === 'object' && project.mentor !== null ? project.mentor?._id : (project.mentor || ''),
      status: project.status === 'archived' ? 'inactive' : project.status, // Prevent saving as archived from normal edit
      resources: project.resources.join('\n'),
      skills: project.skills?.join(', ') || '',
      problemStatement: project.problemStatement || '',
      whyMatters: project.whyMatters || '',
      outcomes: project.outcomes || '',
      difficulty: project.difficulty || 'Beginner Friendly',
      weeklyCommitment: project.weeklyCommitment || '',
      techStack: project.techStack?.join(', ') || '',
      deliverables: project.deliverables?.join('\n') || '',
      teamSize: project.teamSize || '',
      capacity: project.capacity !== undefined ? project.capacity : 30
    });
    setIsModalOpen(true);
  };

  const handleDuplicate = (project: Project) => {
    openEditModal(project);
    setEditingProject(null); // Clear editing project so it creates a new one
    setFormData(prev => ({ ...prev, projectName: `${prev.projectName} (Copy)` }));
  };

  const handleArchive = async (id: string) => {
    if (!window.confirm('Are you sure you want to archive this project?')) return;
    try {
      await adminApi.put(`/admin/projects/${id}/archive`);
      fetchProjects();
    } catch (error) {
      console.error('Error archiving project:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      resources: formData.resources.split('\n').map(r => r.trim()).filter(Boolean),
      skills: formData.skills.split(',').map(s => s.trim()).filter(Boolean),
      techStack: formData.techStack.split(',').map(s => s.trim()).filter(Boolean),
      deliverables: formData.deliverables.split('\n').map(d => d.trim()).filter(Boolean)
    };

    try {
      if (editingProject) {
        await adminApi.put(`/admin/projects/${editingProject._id}`, payload);
      } else {
        await adminApi.post('/admin/projects', payload);
      }
      setIsModalOpen(false);
      fetchProjects();
    } catch (error: any) {
      console.error('Error saving project:', error);
      alert(error.response?.data?.message || 'Failed to save project.');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-serif text-ink mb-2">Projects</h1>
          <p className="text-sm text-ink-soft">Manage onboarding projects and assignments</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-[rgb(var(--bg-primary-rgb))] font-medium rounded-lg hover:bg-accent/90 transition-colors shadow-sm"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create Project
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-ink-soft">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="p-10 text-center text-ink-soft">No active projects found.</div>
        ) : (
          <table className="w-full text-left text-sm text-ink-soft">
            <thead className="bg-bg border-b border-border text-xs uppercase font-medium text-ink-faint">
              <tr>
                <th className="px-6 py-4">Project Name</th>
                <th className="px-6 py-4">Mentor</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Skills</th>
                <th className="px-6 py-4">Resources</th>
                <th className="px-6 py-4">Capacity</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {projects.map((p) => (
                <tr key={p._id} className="hover:bg-bg/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-ink mb-1">{p.projectName}</div>
                    <div className="text-xs text-ink-faint line-clamp-1 max-w-[200px]" title={p.description}>
                      {p.description}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-ink">
                      {typeof p.mentor === 'object' && p.mentor !== null ? p.mentor?.name : p.mentorName}
                    </div>
                    <div className="text-xs text-ink-faint">
                      {(typeof p.mentor === 'object' && p.mentor !== null ? p.mentor?.email : p.mentorEmail) || 'No email'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {p.status === 'active' ? (
                      <span className="px-2 py-1 bg-accent/10 text-accent rounded text-[11px] font-semibold tracking-wider uppercase">Active</span>
                    ) : (
                      <span className="px-2 py-1 bg-ink/10 text-ink-soft rounded text-[11px] font-semibold tracking-wider uppercase">Inactive</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {p.skills && p.skills.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {p.skills.slice(0, 2).map((s, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-bg border border-border text-ink-soft rounded text-[10px]">
                            {s}
                          </span>
                        ))}
                        {p.skills.length > 2 && <span className="text-xs text-ink-faint">+{p.skills.length - 2}</span>}
                      </div>
                    ) : (
                      <span className="text-ink-faint">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {p.resources.length > 0 ? (
                      <span className="px-2 py-1 bg-accent/10 text-accent rounded-full text-xs font-medium">
                        {p.resources.length} link(s)
                      </span>
                    ) : (
                      <span className="text-ink-faint">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-ink font-medium">
                    {p.capacity || 30}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => openEditModal(p)} className="text-ink-soft hover:text-ink transition-colors" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </button>
                      <button onClick={() => handleDuplicate(p)} className="text-ink-soft hover:text-ink transition-colors" title="Duplicate">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      </button>
                      <button onClick={() => handleArchive(p._id)} className="text-danger/70 hover:text-danger transition-colors" title="Archive">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-border bg-bg/50">
                <h2 className="text-xl font-bold text-ink">
                  {editingProject ? 'Edit Project' : 'Create Project'}
                </h2>
              </div>
              
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                <form id="project-form" onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-2 gap-5">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-ink mb-1.5">Project Name</label>
                      <input
                        type="text"
                        required
                        value={formData.projectName}
                        onChange={e => setFormData(prev => ({ ...prev, projectName: e.target.value }))}
                        className={inputStandardRing + ""}
                        placeholder="e.g. AjraSakha"
                      />
                    </div>
                    
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-ink mb-1.5">Description</label>
                      <textarea
                        required
                        rows={3}
                        value={formData.description}
                        onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        className={inputStandardRing + " resize-none"}
                        placeholder="Project overview..."
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-ink mb-1.5">Mentor</label>
                      <select
                        required
                        value={formData.mentor}
                        onChange={e => setFormData(prev => ({ ...prev, mentor: e.target.value }))}
                        className={inputStandardRing + ""}
                      >
                        <option value="">-- Select a Mentor --</option>
                        {mentors.map(m => (
                          <option key={m._id} value={m._id}>{m.name} {m.designation ? `(${m.designation})` : ''}</option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-ink mb-1.5">Status</label>
                      <select
                        value={formData.status}
                        onChange={e => setFormData(prev => ({ ...prev, status: e.target.value as 'active' | 'inactive' }))}
                        className={inputStandardRing + ""}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-ink mb-1.5">Resources (One URL per line)</label>
                      <textarea
                        rows={4}
                        value={formData.resources}
                        onChange={e => setFormData(prev => ({ ...prev, resources: e.target.value }))}
                        className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-ink text-sm font-mono focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-all whitespace-pre"
                        placeholder="https://github.com/...\nhttps://docs.google.com/..."
                      />
                    </div>
                    
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-ink mb-1.5">Skills / Focus Area (Comma separated)</label>
                      <input
                        type="text"
                        value={formData.skills}
                        onChange={e => setFormData(prev => ({ ...prev, skills: e.target.value }))}
                        className={inputStandardRing + ""}
                        placeholder="e.g. React, Node.js, AI"
                      />
                    </div>
                    
                    <div className="col-span-2 mt-4 pt-4 border-t border-border">
                      <h3 className="text-lg font-serif text-ink mb-4">Rich Discovery Info</h3>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-ink mb-1.5">Problem Statement</label>
                      <textarea
                        rows={2}
                        value={formData.problemStatement}
                        onChange={e => setFormData(prev => ({ ...prev, problemStatement: e.target.value }))}
                        className={inputStandardRing + " resize-none"}
                        placeholder="What problem does this project solve?"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-ink mb-1.5">Why This Matters</label>
                      <textarea
                        rows={2}
                        value={formData.whyMatters}
                        onChange={e => setFormData(prev => ({ ...prev, whyMatters: e.target.value }))}
                        className={inputStandardRing + " resize-none"}
                        placeholder="Impact of the project..."
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-ink mb-1.5">Expected Outcomes</label>
                      <input
                        type="text"
                        value={formData.outcomes}
                        onChange={e => setFormData(prev => ({ ...prev, outcomes: e.target.value }))}
                        className={inputStandardRing + ""}
                        placeholder="e.g. Build and deploy a real-world product"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">Difficulty</label>
                      <select
                        value={formData.difficulty}
                        onChange={e => setFormData(prev => ({ ...prev, difficulty: e.target.value as 'Beginner Friendly' | 'Intermediate' | 'Advanced' }))}
                        className={inputStandardRing + ""}
                      >
                        <option value="Beginner Friendly">Beginner Friendly</option>
                        <option value="Intermediate">Intermediate</option>
                        <option value="Advanced">Advanced</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">Weekly Commitment</label>
                      <input
                        type="text"
                        value={formData.weeklyCommitment}
                        onChange={e => setFormData(prev => ({ ...prev, weeklyCommitment: e.target.value }))}
                        className={inputStandardRing + ""}
                        placeholder="e.g. 10-15 hours"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">Team Size</label>
                      <input
                        type="text"
                        value={formData.teamSize}
                        onChange={e => setFormData(prev => ({ ...prev, teamSize: e.target.value }))}
                        className={inputStandardRing + ""}
                        placeholder="e.g. 2-4 members"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">Participant Capacity</label>
                      <input
                        type="number"
                        min="1"
                        value={formData.capacity}
                        onChange={e => setFormData(prev => ({ ...prev, capacity: parseInt(e.target.value) || 0 }))}
                        className={inputStandardRing + ""}
                        placeholder="e.g. 30"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-ink mb-1.5">Tech Stack (Comma separated)</label>
                      <input
                        type="text"
                        value={formData.techStack}
                        onChange={e => setFormData(prev => ({ ...prev, techStack: e.target.value }))}
                        className={inputStandardRing + ""}
                        placeholder="e.g. React, Node, MongoDB"
                      />
                    </div>
                    
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-ink mb-1.5">Deliverables (One per line)</label>
                      <textarea
                        rows={3}
                        value={formData.deliverables}
                        onChange={e => setFormData(prev => ({ ...prev, deliverables: e.target.value }))}
                        className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-all whitespace-pre resize-none"
                        placeholder="Working web application\nAPI Documentation"
                      />
                    </div>
                  </div>
                </form>
              </div>

              <div className="p-6 border-t border-border bg-bg/50 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-lg text-ink-soft hover:bg-bg hover:text-ink transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="project-form"
                  className="px-5 py-2.5 rounded-lg bg-accent text-[rgb(var(--bg-primary-rgb))] font-medium hover:bg-accent/90 transition-colors shadow-sm"
                >
                  {editingProject ? 'Save Changes' : 'Create Project'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
