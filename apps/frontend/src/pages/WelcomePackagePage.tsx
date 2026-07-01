import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import OrientationTab from '../components/welcome/OrientationTab';
import ProjectTimelineTab from '../components/welcome/ProjectTimelineTab';
import MyProjectTab from '../components/welcome/MyProjectTab';
import ProjectDiscoveryTab from '../components/welcome/ProjectDiscoveryTab';
import { useAuth } from '../hooks/useAuth';
import { HomeDoodles } from '../components/ui/PageDoodles';

export default function WelcomePackagePage() {
  const { user } = useAuth();
  
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
              {activeTab === 'orientation' && <OrientationTab />}
              {activeTab === 'discovery' && <ProjectDiscoveryTab />}
              {activeTab === 'my-project' && <MyProjectTab />}
              {activeTab === 'timeline' && <ProjectTimelineTab />}
            </motion.div>
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
