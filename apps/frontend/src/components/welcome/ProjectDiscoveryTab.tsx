import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';
import ProjectSelectionModal, { type Project } from './ProjectSelectionModal';

export default function ProjectDiscoveryTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { fetchUser } = useAuth();

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await api.get('/welcome/projects');
        setProjects(res.data);
      } catch (error) {
        console.error('Error fetching projects', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, []);

  const handleSelect = (project: Project) => {
    setSelectedProject(project);
    setIsModalOpen(true);
  };

  const handleModalSuccess = async () => {
    setIsModalOpen(false);
    await fetchUser(); // Updates user state which transitions WelcomePackagePage tab to 'my-project'
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-16"
      >
        <h2 className="text-4xl font-serif text-ink tracking-tight mb-4">Project Discovery</h2>
        <p className="text-ink-soft max-w-3xl mx-auto text-lg leading-relaxed">
          Browse our available onboarding tracks. These aren't just tutorials—they are real-world simulations designed to accelerate your growth. Select a project that aligns with your goals.
        </p>
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div 
          key="grid"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="grid grid-cols-1 xl:grid-cols-2 gap-8"
        >
          {projects.map((p) => {
            const isFull = (p.capacity !== undefined && p.selectedCount !== undefined) && p.selectedCount >= p.capacity;
            
            return (
            <motion.div
              key={p.projectName}
              whileHover={isFull ? {} : { y: -4 }}
              className={`bg-card border rounded-2xl shadow-sm flex flex-col transition-all group overflow-hidden ${
                isFull 
                  ? 'border-red-500/30 opacity-90 cursor-not-allowed' 
                  : 'border-[rgb(var(--border-rgb))]/30 hover:shadow-lg hover:border-accent/50 cursor-pointer'
              }`}
              onClick={() => {
                if (!isFull) handleSelect(p);
              }}
            >
              {/* Card Header (Project Name & Mentor) */}
              <div className={`p-6 pb-5 border-b relative ${
                isFull ? 'bg-red-500/5 backdrop-blur-sm border-red-500/10' : 'border-[rgb(var(--border-rgb))]/10 bg-bg/30'
              }`}>
                {!isFull && (
                  <div className="absolute top-6 right-6 p-2 bg-accent/10 text-accent rounded-full opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </div>
                )}
                
                {p.capacity !== undefined && (
                  <div className={`absolute top-6 right-6 p-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-1.5 backdrop-blur-md transition-all duration-300 ${
                    isFull 
                      ? 'bg-red-500/10 text-red-500 border-red-500/20' 
                      : 'bg-accent/10 text-accent border-accent/20 group-hover:-translate-x-12'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${isFull ? 'bg-red-500 animate-pulse' : 'bg-accent'}`}></div>
                    {p.selectedCount || 0} / {p.capacity} Seats
                  </div>
                )}
                
                <div className="flex items-start gap-4 pr-12">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center text-[rgb(var(--bg-primary-rgb))] shadow-md flex-shrink-0">
                    <span className="text-2xl font-bold font-serif">{p.projectName.charAt(0)}</span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-ink group-hover:text-accent transition-colors">{p.projectName}</h3>
                    <div className="flex items-center gap-2 mt-1.5 text-sm">
                      <div className="w-5 h-5 rounded-full bg-[rgb(var(--bg-primary-rgb))]/40 border border-border flex items-center justify-center text-[8px] font-bold text-ink-soft">
                        {(p.mentor?.name || p.mentorName || '?').charAt(0)}
                      </div>
                      <span className="text-ink-soft font-medium">Mentor: <span className="text-ink">{p.mentor?.name || p.mentorName}</span></span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Body (The details) */}
              <div className="p-6 flex-1 flex flex-col gap-6">
                
                {/* Summary & Problem Statement */}
                <div>
                  <p className="text-ink text-base leading-relaxed font-medium mb-4">{p.description}</p>
                  
                  {p.problemStatement && (
                    <div className="bg-bg/50 rounded-xl p-4 border border-[rgb(var(--border-rgb))]/20 mb-4">
                      <h4 className="text-xs font-bold text-ink-soft uppercase tracking-wider mb-2">Problem Statement</h4>
                      <p className="text-sm text-ink-soft leading-relaxed">{p.problemStatement}</p>
                    </div>
                  )}
                  
                  {p.whyMatters && (
                    <p className="text-sm text-ink-soft leading-relaxed">
                      <strong className="text-ink font-semibold">Why this matters:</strong> {p.whyMatters}
                    </p>
                  )}
                </div>

                {/* Grid for meta info (Difficulty, Time, Team) */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-accent/5 rounded-xl border border-accent/10">
                  {p.difficulty && (
                    <div>
                      <span className="block text-[10px] font-bold text-accent uppercase tracking-wider mb-1">Difficulty</span>
                      <span className="text-sm font-medium text-ink">{p.difficulty}</span>
                    </div>
                  )}
                  {p.weeklyCommitment && (
                    <div>
                      <span className="block text-[10px] font-bold text-accent uppercase tracking-wider mb-1">Commitment</span>
                      <span className="text-sm font-medium text-ink">{p.weeklyCommitment}</span>
                    </div>
                  )}
                  {p.teamSize && (
                    <div>
                      <span className="block text-[10px] font-bold text-accent uppercase tracking-wider mb-1">Team Size</span>
                      <span className="text-sm font-medium text-ink">{p.teamSize}</span>
                    </div>
                  )}
                </div>

                {/* Tech Stack & Skills */}
                <div className="space-y-4">
                  {(p.techStack && p.techStack.length > 0) && (
                    <div>
                      <h4 className="text-xs font-bold text-ink-soft uppercase tracking-wider mb-2">Tech Stack</h4>
                      <div className="flex flex-wrap gap-2">
                        {p.techStack.map((tech, i) => (
                          <span key={`tech-${i}`} className="px-2.5 py-1 bg-ink/5 text-ink rounded-lg text-xs font-medium">
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {((p.skills && p.skills.length > 0) || p.outcomes) && (
                    <div>
                      <h4 className="text-xs font-bold text-ink-soft uppercase tracking-wider mb-2">Expected Outcomes & Skills</h4>
                      {p.outcomes && <p className="text-sm text-ink mb-3 font-medium">{p.outcomes}</p>}
                      <div className="flex flex-wrap gap-1.5">
                        {p.skills?.map((skill, i) => (
                          <div key={`skill-${i}`} className="flex items-center gap-1.5 text-xs text-ink-soft">
                            <svg className="text-green-500 w-3 h-3 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                            {skill}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </motion.div>
            );
          })}
          
          {projects.length === 0 && (
            <div className="col-span-full text-center py-16 px-4 border-2 border-dashed border-[rgb(var(--border-rgb))]/30 rounded-2xl bg-[rgb(var(--bg-card-rgb))]/20">
              <div className="w-16 h-16 bg-bg border border-border flex items-center justify-center rounded-full mx-auto mb-4 text-ink-soft">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
              </div>
              <h3 className="text-xl font-bold text-ink mb-2">No Projects Available</h3>
              <p className="text-ink-soft max-w-md mx-auto">There are currently no active onboarding projects available for selection. Please contact your mentor or administrator.</p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <ProjectSelectionModal 
        isOpen={isModalOpen}
        project={selectedProject}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}
