import React from 'react';
import { usePrefersReducedMotion } from '../../lib/animations';

const particles = [
  { size: 6, x: '10%', duration: 28, delay: 0, opacity: 0.035 },
  { size: 4, x: '25%', duration: 22, delay: 4, opacity: 0.03 },
  { size: 8, x: '45%', duration: 32, delay: 2, opacity: 0.025 },
  { size: 5, x: '65%', duration: 26, delay: 6, opacity: 0.04 },
  { size: 3, x: '80%', duration: 20, delay: 8, opacity: 0.035 },
  { size: 7, x: '90%', duration: 30, delay: 1, opacity: 0.02 },
];

export default function FloatingElements() {
  const reduced = usePrefersReducedMotion();
  if (reduced) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
      {/* Ambient gradient blobs */}
      <div className="ambient-bg">
        <div className="ambient-blob ambient-blob-1" />
        <div className="ambient-blob ambient-blob-2" />
        <div className="ambient-blob ambient-blob-3" />
      </div>
      {/* Floating circles */}
      {particles.map((p, i) => (
        <div
          key={i}
          className="floating-particle"
          style={{
            width: p.size,
            height: p.size,
            left: p.x,
            opacity: p.opacity,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
