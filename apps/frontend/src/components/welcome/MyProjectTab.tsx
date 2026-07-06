import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import api from '../../utils/api';

interface Project {
  projectName: string;
  mentorName: string;
  mentorEmail?: string;
  description: string;
  status: string;
  resources: string[];
}

export default function MyProjectTab() {
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  // Accordion state
  const [expandedSection, setExpandedSection] = useState<'details' | 'mentor' | 'resources' | null>('details');

  useEffect(() => {
    const fetchProjectDetails = async () => {
      if (!user?.projectAssigned) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get('/welcome/my-project');
        setProject(res.data || null);
      } catch (error) {
        console.error('Error fetching project details', error);
        setProject(null);
      } finally {
        setLoading(false);
      }
    };
    fetchProjectDetails();
  }, [user]);

  if (loading || !user?.projectAssigned) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      {/* Header Dashboard Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[2rem] border border-[rgb(var(--border-rgb))]/30 bg-[rgb(var(--bg-card-rgb))]/40 backdrop-blur-[40px] shadow-[0_8px_32px_rgba(0,0,0,0.08)] p-10 sm:p-14 group mb-8"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[rgb(var(--bg-primary-rgb))]/10 via-transparent to-[rgb(var(--bg-primary-rgb))]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[100px] pointer-events-none translate-x-1/3 -translate-y-1/3"></div>

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div className="flex-1 w-full">
            <div className="flex items-center gap-4 mb-4">
              <h2 className="text-4xl sm:text-5xl font-serif text-ink tracking-tight">{user.projectAssigned}</h2>
              {user.projectSelectionLocked && (
                <span className="px-3 py-1 bg-accent/100/10 text-accent border border-accent/20 rounded-full text-xs font-semibold tracking-wide flex items-center gap-1.5 whitespace-nowrap">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  Selection Locked
                </span>
              )}
            </div>
            
            <p className="text-lg text-ink-soft mb-8 max-w-xl">
              You are officially a part of <span className="font-medium text-ink">{user.projectAssigned}</span>. Your journey starts here. Review your project dashboard below.
            </p>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-bg/50 backdrop-blur-md rounded-xl p-5 border border-border/40">
                <p className="text-[10px] font-bold text-ink-faint uppercase tracking-wider mb-1">Mentor</p>
                <p className="text-lg font-medium text-ink">{user.mentorAssigned}</p>
              </div>
              <div className="bg-bg/50 backdrop-blur-md rounded-xl p-5 border border-border/40">
                <p className="text-[10px] font-bold text-ink-faint uppercase tracking-wider mb-1">Status</p>
                <p className={`text-lg font-medium uppercase tracking-wider text-sm mt-1 ${
                  (project?.status || 'active').toLowerCase() === 'active' ? 'text-accent' : 'text-red-500'
                }`}>
                  {project?.status || 'Active'}
                </p>
              </div>
              <div className="bg-bg/50 backdrop-blur-md rounded-xl p-5 border border-border/40 col-span-2 lg:col-span-1">
                <p className="text-[10px] font-bold text-ink-faint uppercase tracking-wider mb-1">Date Assigned</p>
                <p className="text-lg font-medium text-ink">
                  {user.projectAssignedAt ? new Date(user.projectAssignedAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  }) : 'Pending'}
                </p>
              </div>
            </div>
          </div>

          <div className="hidden lg:flex flex-shrink-0 relative w-32 h-32 md:w-48 md:h-48 rounded-full border border-border/20 bg-gradient-to-tr from-accent/20 to-transparent items-center justify-center overflow-hidden shadow-inner">
             <div className="absolute inset-0 backdrop-blur-[20px]"></div>
             <svg className="w-16 h-16 md:w-24 md:h-24 text-accent relative z-10 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
             </svg>
          </div>
        </div>
      </motion.div>

      {/* Expandable Content Sections */}
      {project && (
        <div className="space-y-4">
          
          {/* Details Section */}
          <div className="spatial-glass-card border border-[rgb(var(--border-rgb))]/30 bg-[rgb(var(--bg-card-rgb))]/40 backdrop-blur-xl rounded-2xl overflow-hidden">
            <button 
              onClick={() => setExpandedSection(expandedSection === 'details' ? null : 'details')}
              className="w-full flex items-center justify-between p-6 hover:bg-[rgb(var(--text-primary-rgb))]/5 transition-colors focus-visible:outline-none"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                </div>
                <h3 className="text-xl font-bold text-ink">Project Details</h3>
              </div>
              <motion.div animate={{ rotate: expandedSection === 'details' ? 180 : 0 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-soft">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </motion.div>
            </button>
            <AnimatePresence>
              {expandedSection === 'details' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-6 pt-0 border-t border-[rgb(var(--border-rgb))]/10 mt-2">
                    <p className="text-ink-soft leading-relaxed">
                      {project.description}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mentor Contact Section */}
          <div className="spatial-glass-card border border-[rgb(var(--border-rgb))]/30 bg-[rgb(var(--bg-card-rgb))]/40 backdrop-blur-xl rounded-2xl overflow-hidden">
            <button 
              onClick={() => setExpandedSection(expandedSection === 'mentor' ? null : 'mentor')}
              className="w-full flex items-center justify-between p-6 hover:bg-[rgb(var(--text-primary-rgb))]/5 transition-colors focus-visible:outline-none"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                </div>
                <h3 className="text-xl font-bold text-ink">Mentor Contact</h3>
              </div>
              <motion.div animate={{ rotate: expandedSection === 'mentor' ? 180 : 0 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-soft">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </motion.div>
            </button>
            <AnimatePresence>
              {expandedSection === 'mentor' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-6 pt-0 border-t border-[rgb(var(--border-rgb))]/10 mt-2">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-bg border border-border flex items-center justify-center text-xl font-bold text-ink-soft">
                        {project.mentorName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-ink text-lg">{project.mentorName}</p>
                        {project.mentorEmail ? (
                           <p className="text-ink-soft text-sm">{project.mentorEmail}</p>
                        ) : (
                           <p className="text-ink-faint text-sm italic">Contact info unavailable</p>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Resources Section */}
          <div className="spatial-glass-card border border-[rgb(var(--border-rgb))]/30 bg-[rgb(var(--bg-card-rgb))]/40 backdrop-blur-xl rounded-2xl overflow-hidden">
            <button 
              onClick={() => setExpandedSection(expandedSection === 'resources' ? null : 'resources')}
              className="w-full flex items-center justify-between p-6 hover:bg-[rgb(var(--text-primary-rgb))]/5 transition-colors focus-visible:outline-none"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                </div>
                <h3 className="text-xl font-bold text-ink">Project Resources</h3>
              </div>
              <motion.div animate={{ rotate: expandedSection === 'resources' ? 180 : 0 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-soft">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </motion.div>
            </button>
            <AnimatePresence>
              {expandedSection === 'resources' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-6 pt-0 border-t border-[rgb(var(--border-rgb))]/10 mt-2">
                    {project.resources && project.resources.length > 0 ? (
                      <ul className="space-y-3">
                        {project.resources.map((res, i) => (
                          <li key={i} className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded bg-accent/10 flex items-center justify-center">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                            </div>
                            <a href={res} target="_blank" rel="noopener noreferrer" className="text-ink-soft hover:text-accent transition-colors underline-offset-4 hover:underline text-sm font-mono break-all">
                              {res}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-ink-faint italic text-sm p-4 bg-bg rounded-lg border border-border/50 text-center">
                        No external resources have been uploaded for this project yet.
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      )}
    </div>
  );
}
