import React, { useRef, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { useMousePosition, useInView, usePrefersReducedMotion, fadeUp, staggerContainer, staggerItem } from '../../lib/animations';

/* ═══════════════════════════════════════════
   TILT CARD — Premium 3D hover tilt
═══════════════════════════════════════════ */
export function TiltCard({ children, className = '', intensity = 3, liftY = -6 }) {
  const ref = useRef(null);
  const pos = useMousePosition(ref);
  const reduced = usePrefersReducedMotion();

  const rotateX = reduced ? 0 : pos.isInside ? (pos.y - 0.5) * -intensity * 2 : 0;
  const rotateY = reduced ? 0 : pos.isInside ? (pos.x - 0.5) * intensity * 2 : 0;
  const y = pos.isInside ? liftY : 0;
  const shadow = pos.isInside
    ? `0 ${12 + Math.abs(rotateX) * 2}px ${24 + Math.abs(rotateX) * 3}px -8px rgba(28,35,51,0.12)`
    : '0 1px 3px rgba(28,35,51,0.06)';

  return (
    <div
      ref={ref}
      className={className}
      style={{
        transform: `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(${y}px)`,
        boxShadow: shadow,
        transition: pos.isInside ? 'transform 0.15s ease-out, box-shadow 0.2s ease-out' : 'transform 0.4s ease-out, box-shadow 0.4s ease-out',
        willChange: 'transform',
      }}
    >
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAGNETIC BUTTON — Follows cursor slightly
═══════════════════════════════════════════ */
export function MagneticButton({ children, className = '', maxDist = 6, onClick, disabled, type = 'button' }) {
  const ref = useRef(null);
  const pos = useMousePosition(ref);
  const reduced = usePrefersReducedMotion();
  const [pressed, setPressed] = useState(false);

  const tx = reduced ? 0 : pos.isInside ? (pos.x - 0.5) * maxDist * 2 : 0;
  const ty = reduced ? 0 : pos.isInside ? (pos.y - 0.5) * maxDist * 2 : 0;
  const scale = pressed ? 0.98 : pos.isInside ? 1.02 : 1;

  return (
    <button
      ref={ref}
      type={type}
      className={`magnetic-btn ${className}`}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        transition: pos.isInside ? 'transform 0.12s ease-out' : 'transform 0.35s ease-out',
        willChange: 'transform',
      }}
    >
      <span className="magnetic-btn-shimmer" />
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════
   SCROLL REVEAL — Animate on viewport entry
═══════════════════════════════════════════ */
export function ScrollReveal({ children, className = '', delay = 0, stagger = false }) {
  const [ref, inView] = useInView({ threshold: 0.1 });
  const reduced = usePrefersReducedMotion();

  if (reduced) return <div ref={ref} className={className}>{children}</div>;

  if (stagger) {
    return (
      <motion.div
        ref={ref}
        className={className}
        variants={staggerContainer}
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      variants={fadeUp}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

/* For stagger children */
export function ScrollRevealItem({ children, className = '' }) {
  return (
    <motion.div className={className} variants={staggerItem}>
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   MOUSE GLOW — Soft golden cursor light
═══════════════════════════════════════════ */
export function MouseGlow({ containerRef }) {
  const [pos, setPos] = useState({ x: 0, y: 0, visible: false });
  const reduced = usePrefersReducedMotion();
  const frameRef = useRef(null);

  const handleMove = useCallback((e) => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        visible: true,
      });
    });
  }, [containerRef]);

  const handleLeave = useCallback(() => {
    setPos(p => ({ ...p, visible: false }));
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || reduced) return;
    el.addEventListener('mousemove', handleMove);
    el.addEventListener('mouseleave', handleLeave);
    return () => {
      el.removeEventListener('mousemove', handleMove);
      el.removeEventListener('mouseleave', handleLeave);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [containerRef, handleMove, handleLeave, reduced]);

  if (reduced) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden z-0"
      aria-hidden="true"
    >
      <div
        style={{
          position: 'absolute',
          left: pos.x - 200,
          top: pos.y - 200,
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(201,161,59,0.08) 0%, transparent 70%)',
          opacity: pos.visible ? 1 : 0,
          transition: 'opacity 0.3s ease',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
