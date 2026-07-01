import React from 'react';
import { motion } from 'framer-motion';

interface TimelineCardHeaderProps {
  status: 'completed' | 'current' | 'upcoming';
  isExpanded: boolean;
  isLeft?: boolean;
  extraBadge?: React.ReactNode;
}

export function TimelineCardHeader({ status, isExpanded, isLeft, extraBadge }: TimelineCardHeaderProps) {
  return (
    <motion.div layout="position" className={`flex items-center gap-3 mb-3 ${isLeft ? 'sm:justify-end' : 'sm:justify-start'}`}>
      <div className="flex items-center gap-2.5">
        <span className={`px-3 py-1 text-[9px] uppercase font-bold tracking-widest rounded-full shadow-inner ${
          status === 'completed' ? 'spatial-glass-subtle text-ink-soft' :
          status === 'current' ? 'bg-accent/20 text-accent border border-accent/50 shadow-[0_0_10px_rgb(var(--accent-rgb)_/_0.2)]' :
          'spatial-glass-subtle text-ink-soft border-dashed border-[rgb(var(--border-rgb))]/20'
        }`}>
          {status}
        </span>
        <motion.div
          initial={false}
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="flex items-center justify-center opacity-60 hover:opacity-100 group-hover:opacity-100 transition-opacity cursor-pointer text-ink-soft hover:text-ink"
        >
          <svg 
            className="w-[18px] h-[18px]" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </div>

      {extraBadge && (
        <div className="flex items-center">
          {extraBadge}
        </div>
      )}
    </motion.div>
  );
}
