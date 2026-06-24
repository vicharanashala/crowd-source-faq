import React from 'react';
import { motion } from 'framer-motion';
import { fadeIn } from '../../lib/animations';

export function SkeletonLine({ className = '' }) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonFAQCard() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
      <div className="flex items-start gap-3">
        <SkeletonLine className="w-2 h-2 rounded-full flex-shrink-0 mt-2" />
        <div className="flex-1 space-y-2">
          <SkeletonLine className="h-4 w-4/5" />
          <SkeletonLine className="h-3 w-1/3" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-start gap-4">
      <SkeletonLine className="w-10 h-10 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <SkeletonLine className="h-7 w-12" />
        <SkeletonLine className="h-3 w-20" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 4, Card = SkeletonFAQCard }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} />
      ))}
    </div>
  );
}

export function FadeInContent({ children, className = '' }) {
  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
}
