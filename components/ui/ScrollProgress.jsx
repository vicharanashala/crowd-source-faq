import React, { useState, useEffect } from 'react';
import { usePrefersReducedMotion } from '../../lib/animations';

export default function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    let ticking = false;
    const update = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docHeight > 0 ? (scrollTop / docHeight) * 100 : 0);
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [reduced]);

  if (reduced) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-[3px] pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-[#c9a13b] to-[#d4a94e]"
        style={{
          width: `${progress}%`,
          transition: 'width 0.1s linear',
          boxShadow: '0 0 8px rgba(201,161,59,0.4)',
        }}
      />
    </div>
  );
}
