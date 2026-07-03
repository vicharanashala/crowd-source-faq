import { useState } from 'react';
import ZoomAssessmentModal from './ZoomAssessmentModal';
import { useAuth } from '../../hooks/useAuth';

export default function ZoomBubble() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { user } = useAuth();

  // If user is admin, they don't need to take the assessment
  if (user?.role === 'admin') return null;

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border/70 bg-card hover:border-[#2D8CFF]/60 text-ink text-xs font-semibold shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md z-50"
      >
        <span className="w-2 h-2 rounded-full bg-[#2D8CFF] animate-pulse" />
        Zoom
      </button>

      {isModalOpen && (
        <ZoomAssessmentModal onClose={() => setIsModalOpen(false)} />
      )}
    </>
  );
}
