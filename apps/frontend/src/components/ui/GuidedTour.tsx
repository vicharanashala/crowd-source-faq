import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import api from '../../utils/api';

interface TourStep {
  target?: string;
  title: string;
  content: string;
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center';
  route?: string;
}

const steps: TourStep[] = [
  {
    title: 'Welcome to Yaksha FAQ! 👋',
    content: "Let's take a quick 1-minute tour to help you get familiar with the platform and find answers to your questions faster.",
    placement: 'center',
    route: '/',
  },
  {
    target: '[data-tour="nav-pills"]',
    title: 'Easy Navigation 🧭',
    content: 'This navigation bar allows you to quickly switch between the Home page, FAQs, the Orientation Welcome Package, and the Community Forum.',
    placement: 'bottom',
    route: '/',
  },
  {
    target: '[data-tour="search-bar"]',
    title: 'Instant Search 🔍',
    content: 'Type in anything you need help with. The search checks verified FAQs, meeting transcripts, and community posts to find answers instantly.',
    placement: 'bottom',
    route: '/',
  },
  {
    target: '[data-tour="spurti-chip"]',
    title: 'Spurti Points (SP) 🔥',
    content: 'You start with 100 SP! Earn more points by contributing. You can spend these points on Golden Tickets for priority support from our administrators.',
    placement: 'bottom',
    route: '/',
  },
  {
    target: '[data-tour="nav-pill-support"]',
    title: 'Support Section 🤝',
    content: 'All support queries can be posted in the Support section. Click on this Support link in the navigation bar to create and view your tickets.',
    placement: 'bottom',
    route: '/',
  },
  {
    target: '[data-tour="nav-pill-golden"]',
    title: 'Golden Tickets 🎟️',
    content: 'Spend your Spurti Points (SP) here to create a Golden Ticket. Click on this Golden link to open the prioritization page, where you can raise urgent issues directly to the admin.',
    placement: 'bottom',
    route: '/',
  },
  {
    target: '[data-tour="program-selector"]',
    title: 'Select a Program 🚀',
    content: 'Select active programs like Monsoonship or Summership. Switching programs instantly filters all FAQs, community posts, and activities accordingly.',
    placement: 'bottom',
    route: '/',
  },
  {
    target: '[data-tour="user-profile"]',
    title: 'Your Account 👤',
    content: 'Access your saved items, update your profile or avatar, adjust appearance settings (dark mode), or log out from here.',
    placement: 'bottom',
    route: '/',
  },
  {
    title: "You're Ready! 🎉",
    content: "That's it! You are all set to explore Yaksha FAQ. Don't hesitate to ask questions in the community or reach out to support if you need help.",
    placement: 'center',
    route: '/',
  },
];

// The index of the mandatory program switcher step
const PROGRAM_SWITCHER_STEP_INDEX = 6;

export default function GuidedTour() {
  const { user, isAuthenticated, fetchUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [tourActive, setTourActive] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // If true, the user has skipped the main tour but must view the Program Switcher step
  const [isMandatoryOnly, setIsMandatoryOnly] = useState(false);

  const step = steps[currentStep];

  // Helper to dynamically check if the target selector is available in the DOM, skipping if disabled/hidden.
  const getNextStepIndex = (fromIndex: number, direction: 'next' | 'back'): number => {
    let index = fromIndex + (direction === 'next' ? 1 : -1);
    while (index >= 0 && index < steps.length) {
      const targetSelector = steps[index].target;
      if (!targetSelector) return index; // Center/fallback steps are always valid
      
      const element = document.querySelector(targetSelector);
      if (element) return index; // Element exists, valid step!
      
      index += direction === 'next' ? 1 : -1;
    }
    return direction === 'next' ? steps.length : -1;
  };

  // We only prompt the user if they are logged in, guidedTourCompleted is false, and they are on the Homepage.
  useEffect(() => {
    if (
      isAuthenticated &&
      user &&
      user.guidedTourCompleted === false &&
      location.pathname === '/' &&
      !tourActive &&
      !showPrompt &&
      !isMandatoryOnly
    ) {
      // Small delay for the page layout/assets to load before showing prompt
      const timer = setTimeout(() => setShowPrompt(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, user, location.pathname, tourActive, showPrompt, isMandatoryOnly]);

  // Handle route change on step change
  useEffect(() => {
    if (tourActive) {
      const stepRoute = steps[currentStep].route;
      if (stepRoute && location.pathname !== stepRoute) {
        navigate(stepRoute);
      }
    }
  }, [tourActive, currentStep, location.pathname, navigate]);

  // Track target element rect on step change, resize, or scroll.
  useEffect(() => {
    if (!tourActive || !step.target) {
      setRect(null);
      return;
    }

    const updateRect = () => {
      const element = document.querySelector(step.target!);
      if (element) {
        setRect(element.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };

    // Attempt to scroll the target element into view nicely
    const element = document.querySelector(step.target);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Wait slightly for scroll to settle, then measure
      const scrollTimeout = setTimeout(updateRect, 350);
      
      window.addEventListener('resize', updateRect);
      window.addEventListener('scroll', updateRect, { passive: true });
      
      return () => {
        clearTimeout(scrollTimeout);
        window.removeEventListener('resize', updateRect);
        window.removeEventListener('scroll', updateRect);
      };
    } else {
      setRect(null);
    }
  }, [tourActive, currentStep, step.target]);

  const handleStartTour = () => {
    setShowPrompt(false);
    setIsMandatoryOnly(false);
    setCurrentStep(0);
    setTourActive(true);
  };

  const handleFinishOrSkip = async () => {
    setTourActive(false);
    setShowPrompt(false);
    setIsMandatoryOnly(false);
    try {
      if (location.pathname !== '/') {
        navigate('/');
      }
      await api.patch('/auth/profile', { guidedTourCompleted: true });
      await fetchUser();
    } catch (err) {
      console.error('Failed to update tour completion status:', err);
    }
  };

  // Triggered when user skips the tour either at startup or during the walkthrough
  const handleTriggerMandatoryOnly = () => {
    setIsMandatoryOnly(true);
    setCurrentStep(PROGRAM_SWITCHER_STEP_INDEX);
    setTourActive(true);
    setShowPrompt(false);
  };

  const handleNext = () => {
    if (isMandatoryOnly) {
      handleFinishOrSkip();
      return;
    }

    const nextIndex = getNextStepIndex(currentStep, 'next');
    if (nextIndex < steps.length) {
      setCurrentStep(nextIndex);
    } else {
      handleFinishOrSkip();
    }
  };

  const handleBack = () => {
    if (isMandatoryOnly) return;
    const prevIndex = getNextStepIndex(currentStep, 'back');
    if (prevIndex >= 0) {
      setCurrentStep(prevIndex);
    }
  };

  // Helper to resolve CSS classes for absolute tooltips based on spotlight container bounds
  const getTooltipPositionClasses = (placement: 'top' | 'bottom' | 'left' | 'right' | 'center') => {
    switch (placement) {
      case 'top':
        return 'bottom-full mb-4 left-1/2 -translate-x-1/2';
      case 'bottom':
        return 'top-full mt-4 left-1/2 -translate-x-1/2';
      case 'left':
        return 'right-full mr-4 top-1/2 -translate-y-1/2';
      case 'right':
        return 'left-full ml-4 top-1/2 -translate-y-1/2';
      default:
        return '';
    }
  };

  if (!isAuthenticated || user?.guidedTourCompleted) return null;

  return (
    <>
      <AnimatePresence>
        {/* 1. First-time login prompt modal */}
        {showPrompt && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleTriggerMandatoryOnly}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
            />
            {/* Prompt dialog */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6 overflow-hidden pointer-events-auto"
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-accent to-accent-dark" />
              <h2 className="text-lg font-serif text-ink mb-2">Welcome, {user?.name || 'User'}! 🎉</h2>
              <p className="text-sm text-ink-soft leading-relaxed mb-6">
                Would you like a quick 1-minute guided tour of Yaksha FAQ to help you get started?
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTriggerMandatoryOnly}
                  className="flex-1 py-2 px-4 rounded-full border border-border text-sm font-semibold text-ink-soft hover:bg-mist transition-colors"
                >
                  Skip Tour
                </button>
                <button
                  onClick={handleStartTour}
                  className="flex-1 py-2 px-4 rounded-full bg-accent text-accent-text text-sm font-semibold hover:bg-accent-hover transition-colors shadow-md shadow-accent/20"
                >
                  Start Tour
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* 2. Active tour walkthrough */}
        {tourActive && (
          <div className="fixed inset-0 z-[9999] pointer-events-none">
            {/* Dimming overlay backdrop (uses clipPath to make the spotlight area clickable) */}
            <div
              className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-[1px] pointer-events-auto"
              style={{
                clipPath: rect
                  ? `polygon(
                      0% 0%,
                      0% 100%,
                      ${rect.left - 8}px 100%,
                      ${rect.left - 8}px ${rect.top - 8}px,
                      ${rect.right + 8}px ${rect.top - 8}px,
                      ${rect.right + 8}px ${rect.bottom + 8}px,
                      ${rect.left - 8}px ${rect.bottom + 8}px,
                      ${rect.left - 8}px 100%,
                      100% 100%,
                      100% 0%
                    )`
                  : 'none',
              }}
            />

            {/* Spotlight highlight border (Spring animate dimensions) */}
            {rect ? (
              <motion.div
                initial={false}
                animate={{
                  x: rect.left - 8,
                  y: rect.top - 8,
                  width: rect.width + 16,
                  height: rect.height + 16,
                }}
                transition={{ type: 'spring', stiffness: 240, damping: 26 }}
                className="fixed pointer-events-none z-[9999] rounded-xl border border-accent/40 ring-4 ring-accent/20"
              >
                {/* Tooltip positioned relative to the spotlight target bounding box */}
                <div
                  className={`absolute ${getTooltipPositionClasses(step.placement)} z-[10000] w-72 sm:w-80 pointer-events-auto`}
                >
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="bg-card/95 border border-border/80 rounded-2xl p-5 shadow-2xl backdrop-blur-md"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-serif text-sm text-ink font-semibold">{step.title}</h3>
                      {!isMandatoryOnly && (
                        <span className="text-[10px] bg-mist text-ink-soft px-2 py-0.5 rounded-full font-medium">
                          {currentStep} / {steps.length - 2}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-soft leading-relaxed mb-5">{step.content}</p>

                    <div className="flex items-center justify-between">
                      {!isMandatoryOnly ? (
                        <button
                          onClick={handleTriggerMandatoryOnly}
                          className="text-[11px] font-semibold text-ink-faint hover:text-danger hover:underline transition-colors"
                        >
                          Skip
                        </button>
                      ) : (
                        <div />
                      )}
                      <div className="flex gap-2">
                        {currentStep > 1 && !isMandatoryOnly && (
                          <button
                            onClick={handleBack}
                            className="px-3 py-1.5 rounded-full border border-border text-[11px] font-semibold text-ink-soft hover:bg-mist hover:text-ink transition-colors"
                          >
                            Back
                          </button>
                        )}
                        <button
                          onClick={handleNext}
                          className="px-3.5 py-1.5 rounded-full bg-accent text-accent-text text-[11px] font-semibold hover:bg-accent-hover transition-colors shadow-sm shadow-accent/15"
                        >
                          {isMandatoryOnly ? 'Got it' : 'Next'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            ) : (
              /* Center fallback modal when no element is highlighted (Welcome / Completion steps) */
              <div className="fixed inset-0 flex items-center justify-center p-4 z-[9999]">
                <div className="fixed inset-0 bg-black/65 backdrop-blur-[2px] pointer-events-auto" />
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="relative w-full max-w-sm bg-card/95 border border-border rounded-2xl shadow-2xl p-6 overflow-hidden pointer-events-auto backdrop-blur-sm"
                >
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent to-accent-dark" />
                  <h3 className="font-serif text-base text-ink mb-2">{step.title}</h3>
                  <p className="text-xs text-ink-soft leading-relaxed mb-6">{step.content}</p>
                  
                  <div className="flex items-center justify-between">
                    {!isMandatoryOnly ? (
                      <button
                        onClick={handleTriggerMandatoryOnly}
                        className="text-[11px] font-semibold text-ink-faint hover:text-danger hover:underline transition-colors"
                      >
                        Skip
                      </button>
                    ) : (
                      <div />
                    )}
                    <div className="flex gap-2">
                      {currentStep > 0 && !isMandatoryOnly && (
                        <button
                          onClick={handleBack}
                          className="px-3.5 py-1.5 rounded-full border border-border text-[11px] font-semibold text-ink-soft hover:bg-mist hover:text-ink transition-colors"
                        >
                          Back
                        </button>
                      )}
                      <button
                        onClick={handleNext}
                        className="px-4 py-1.5 rounded-full bg-accent text-accent-text text-[11px] font-semibold hover:bg-accent-hover transition-colors shadow-sm shadow-accent/15"
                      >
                        {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
