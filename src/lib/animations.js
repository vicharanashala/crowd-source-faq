import { useRef, useEffect, useCallback, useState } from 'react';

/* ── Framer Motion Shared Variants ── */

export const fadeUp = {
  hidden: { opacity: 0, y: 30, filter: 'blur(6px)' },
  visible: {
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1, scale: 1,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
};

export const slideUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 20, filter: 'blur(4px)' },
  visible: {
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

export const pageTransition = {
  initial: { opacity: 0, scale: 0.98, y: 8 },
  animate: {
    opacity: 1, scale: 1, y: 0,
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0, scale: 0.98, y: -8,
    transition: { duration: 0.2 },
  },
};

export const accordionContent = {
  hidden: { height: 0, opacity: 0 },
  visible: {
    height: 'auto', opacity: 1,
    transition: { height: { duration: 0.35, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.25, delay: 0.1 } },
  },
  exit: {
    height: 0, opacity: 0,
    transition: { height: { duration: 0.25, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.15 } },
  },
};

/* ── Hooks ── */

/** Detect prefers-reduced-motion */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mql.matches);
    const handler = (e) => setReduced(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return reduced;
}

/** Track mouse position relative to an element for tilt/magnetic effects */
export function useMousePosition(ref) {
  const [pos, setPos] = useState({ x: 0.5, y: 0.5, isInside: false });
  const frameRef = useRef(null);

  const handleMove = useCallback((e) => {
    if (!ref.current) return;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const rect = ref.current.getBoundingClientRect();
      setPos({
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
        isInside: true,
      });
    });
  }, [ref]);

  const handleLeave = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    setPos({ x: 0.5, y: 0.5, isInside: false });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('mousemove', handleMove);
    el.addEventListener('mouseleave', handleLeave);
    return () => {
      el.removeEventListener('mousemove', handleMove);
      el.removeEventListener('mouseleave', handleLeave);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [ref, handleMove, handleLeave]);

  return pos;
}

/** IntersectionObserver hook for scroll-triggered reveals */
export function useInView(options = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (options.once !== false) observer.unobserve(el);
        }
      },
      { threshold: options.threshold || 0.15, rootMargin: options.rootMargin || '0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [options.threshold, options.rootMargin, options.once]);

  return [ref, inView];
}
