import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import OrientationTab from '../components/welcome/OrientationTab';
import ProjectTimelineTab from '../components/welcome/ProjectTimelineTab';
import MyProjectTab from '../components/welcome/MyProjectTab';
import ProjectDiscoveryTab from '../components/welcome/ProjectDiscoveryTab';
// v1.69 — Welcome Package Management: additive Resources viewer.
// Rendered below the existing tab content — preserves the tab UX
// exactly while adding the new resource system without modifying
// any existing tab.
import ResourceViewerTab from '../components/welcome/ResourceViewerTab';
import api from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import { useProgram } from '../context/ProgramContext';
import { HomeDoodles } from '../components/ui/PageDoodles';

export default function WelcomePackagePage() {
  const { user } = useAuth();
  const { currentProgram } = useProgram();

  // v1.69 — Conditional layout state: WelcomePackagePage fetches
  // orientation + resources in parallel and uses the loaded state
  // to decide which sections to render. This implements the spec:
  //   Case A (only video)   → show Orientation, hide Resources section
  //   Case B (only resources) → hide Orientation section entirely
  //   Case C (both)         → show both
  //   Case D (neither)      → show both empty-state messages
  // We track `null` (not yet loaded), then a tuple of (orientation,
  // resources). The orientation tab inside AnimatePresence swaps
  // between rendering <OrientationTab /> and an empty placeholder
  // based on whether resources have content (Case B).
  type SectionState = {
    loaded: boolean;
    hasOrientation: boolean;
    hasResources: boolean;
  };
  const [sections, setSections] = useState<SectionState>({
    loaded: false,
    hasOrientation: false,
    hasResources: false,
  });

  const [activeTab, setActiveTab] = useState<'orientation' | 'timeline' | 'my-project' | 'discovery'>(() => {
    if (!user?.orientationCompleted) return 'orientation';
    if (user?.orientationCompleted && !user.projectSelectionLocked) return 'discovery';
    return 'my-project';
  });

  useEffect(() => {
    if (user?.orientationCompleted && !user.projectSelectionLocked && activeTab === 'orientation') {
      setActiveTab('discovery');
    } else if (user?.orientationCompleted && user.projectSelectionLocked && (activeTab === 'discovery' || activeTab === 'orientation')) {
      setActiveTab('my-project');
    }
  }, [user, activeTab]);

  // v1.69 — Fetch orientation + resources in parallel to drive the
  // conditional layout. We pass the active program's batchId
  // explicitly so the backend scopes correctly even on first mount
  // before the localStorage interceptor has populated.
  useEffect(() => {
    let cancelled = false;
    const params = currentProgram?._id ? { batchId: currentProgram._id } : {};
    Promise.all([
      api.get('/welcome/orientation', { params }).catch(() => ({ data: null })),
      api.get('/welcome/resources', { params }).catch(() => ({ data: [] })),
    ])
      .then(([orientationRes, resourcesRes]) => {
        if (cancelled) return;
        const orientation = orientationRes?.data;
        const resources = resourcesRes?.data || [];
        setSections({
          loaded: true,
          hasOrientation: !!(orientation && orientation._id),
          hasResources: Array.isArray(resources) && resources.length > 0,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setSections({ loaded: false, hasOrientation: false, hasResources: false });
      });
    return () => { cancelled = true; };
  }, [currentProgram?._id, activeTab]);

  const tabs = (() => {
    if (!user?.orientationCompleted) {
      return [
        { id: 'orientation', label: 'Orientation' }
      ] as const;
    }
    if (user?.orientationCompleted && !user.projectSelectionLocked) {
      return [
        { id: 'discovery', label: 'Project Discovery' }
      ] as const;
    }
    return [
      { id: 'my-project', label: 'My Project' },
      { id: 'timeline', label: 'Project Timeline' }
    ] as const;
  })();

  // Conditional rendering decisions (Cases A / B / C / D):
  //   - resourcesHidden:  render the Resources section at all?
  //     Hide only when resources is empty AND orientation has
  //     content (Case A).
  //   - orientationHidden: render the OrientationTab at all?
  //     Hide when orientation is empty AND resources have content
  //     (Case B). When orientation is the active tab but hidden,
  //     render an empty placeholder inside AnimatePresence so the
  //     motion.div still has a child to animate.
  //   - In all other cases (both empty, both present) we render
  //     both sections; the inner tab components surface their own
  //     empty-state messages (Case D / C).
  const resourcesHidden = sections.loaded && !sections.hasResources && sections.hasOrientation;
  const orientationHidden = sections.loaded && !sections.hasOrientation && sections.hasResources;

  return (
    <div className="bg-bg text-ink min-h-screen relative z-0">

      {/* Ambient Spatial Background Orbs */}
      <div className="pointer-events-none absolute inset-0 z-[-1] overflow-hidden mt-16">
        <HomeDoodles />
      </div>

      <div className="pt-28 sm:pt-32 pb-20 px-4 sm:px-6 max-w-[1200px] mx-auto relative z-10">

        <div className="mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg px-3 py-1.5 -ml-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            Back
          </Link>
        </div>

        <div className="flex flex-col items-center mb-16 text-center">
          <motion.h1
            initial={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            className="text-4xl sm:text-6xl font-serif tracking-tight text-ink text-glow-spatial mb-4"
          >
            Welcome Package
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-ink-soft max-w-2xl"
          >
            Explore our ecosystem through a spatial interface.
          </motion.p>
        </div>

        {/* Floating Command Palette Tab Navigation */}
        <div className="flex justify-center mb-12">
          <div className="spatial-nav-pill flex p-1.5 rounded-full relative bg-[rgb(var(--bg-primary-rgb))]/30 border border-[rgb(var(--border-rgb))]/10 shadow-[inset_0_2px_10px_rgba(0,0,0,0.05)]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`relative px-10 py-3 text-sm font-semibold rounded-full transition-colors z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  activeTab === tab.id ? 'text-ink' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTabSpatialPill"
                    className="absolute inset-0 bg-[rgb(var(--bg-card-rgb))] rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.08)] border border-[rgb(var(--border-rgb))]/40 z-[-1]"
                    transition={{ type: 'spring', bounce: 0.25, duration: 0.6 }}
                  />
                )}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20, scale: 0.98, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -20, scale: 0.98, filter: 'blur(10px)' }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              {/* v1.69 — Conditional orientation rendering (Cases
                  A/B/C/D). When orientation tab is active AND the
                  orientation is empty AND resources exist (Case B),
                  render an empty placeholder inside AnimatePresence
                  so the motion.div still has a child — that way the
                  transition still animates and we don't display the
                  "No active orientation found." empty state. */}
              {activeTab === 'orientation' && !orientationHidden && <OrientationTab />}
              {activeTab === 'orientation' && orientationHidden && <div aria-hidden />}
              {activeTab === 'discovery' && <ProjectDiscoveryTab />}
              {activeTab === 'my-project' && <MyProjectTab />}
              {activeTab === 'timeline' && <ProjectTimelineTab />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* v1.69 — Conditional resources rendering (Cases A/B/C/D).
            We hide the entire Resources section when resources is
            empty AND orientation has content (Case A — only video).
            In all other cases we render the viewer; it surfaces
            its own empty-state message ("No resources published.")
            when both are empty (Case D), or its actual resource list
            when resources exist (Cases B/C). */}
        {!resourcesHidden && (
          <div className="relative z-10 mt-12">
            <ResourceViewerTab refreshKey={activeTab} />
          </div>
        )}

      </div>
    </div>
  );
}
