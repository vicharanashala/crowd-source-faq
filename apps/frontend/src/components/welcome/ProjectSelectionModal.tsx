import React, { useState } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../utils/api';

// v1.68 — shared Project type. The onboarding CMS
// (PR #62) had two separate local `Project` interfaces
// (one in ProjectDiscoveryTab, one in ProjectSelectionModal)
// which TS flagged as "Two different types with this name
// exist, but they are unrelated" when the discovery
// tab passed a Project to the selection modal. Extracted
// here so both sides agree on the shape.
export interface Project {
  projectName: string;
  description: string;
  status: string;
  resources: string[];
  // Optional rich discovery fields
  mentor?: { _id: string; name: string };
  mentorName?: string;
  mentorEmail?: string;
  skills?: string[];
  problemStatement?: string;
  whyMatters?: string;
  outcomes?: string;
  difficulty?: 'Beginner Friendly' | 'Intermediate' | 'Advanced';
  weeklyCommitment?: string;
  techStack?: string[];
  deliverables?: string[];
  teamSize?: string;
  // Capacity fields (PR #62)
  capacity?: number;
  selectedCount?: number;
}

interface ProjectSelectionModalProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProjectSelectionModal({ isOpen, project, onClose, onSuccess }: ProjectSelectionModalProps) {
  const [confirming, setConfirming] = useState(false);

  useBodyScrollLock(isOpen);

  const handleProceed = async () => {
    if (!project) return;
    setConfirming(true);
    try {
      await api.post('/welcome/select-project', { project: project.projectName });
      onSuccess();
    } catch (error) {
      console.error('Error selecting project', error);
      alert('Failed to select project. Please try again.');
      setConfirming(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-bg/80 backdrop-blur-md"
            onClick={confirming ? undefined : onClose}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-bg border border-border rounded-2xl shadow-2xl p-6 space-y-5"
          >
            <div className="text-center">
              <h2 className="text-2xl font-serif text-ink mb-2">Select this project?</h2>
              <p className="text-sm text-ink-soft">
                {project?.projectName}
              </p>
            </div>

            <div className="text-xs text-ink-faint text-center">
              Once selected, your assignment is <span className="font-semibold text-ink">locked</span> for the duration of the program. Please confirm your choice.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={confirming}
                className="px-4 py-2 rounded-lg text-sm font-medium text-ink-soft hover:text-ink hover:bg-bg/40 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProceed}
                disabled={confirming}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-accent hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {confirming ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Selecting...
                  </>
                ) : (
                  <>Confirm Selection</>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
