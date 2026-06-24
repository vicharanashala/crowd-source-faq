import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from './components/Navbar';
import SearchModal from './components/SearchModal';
import HomePage from './components/HomePage';
import FAQPage from './components/FAQPage';
import AdminPage from './components/AdminPage';
import StudentDashboard from './components/StudentDashboard';
import StudentProfile from './components/StudentProfile';
import FeedbackModal from './components/FeedbackModal';
import RaiseQueryModal from './components/RaiseQueryModal';
import { useFAQState } from './hooks/useFAQState';
import { usePageTracker } from './hooks/usePageTracker';
import YakshaMini from './components/YakshaMini';
import AuthPage from './auth/AuthPage';
import AdminLogin from './auth/AdminLogin';
import { useAuth } from './auth/AuthContext';
import ScrollProgress from './components/ui/ScrollProgress';
import { ToastProvider } from './components/ui/Toast';
import FloatingElements from './components/ui/FloatingElements';
import Footer from './components/Footer';
import { pageTransition } from './lib/animations';

export default function App() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [queryOpen, setQueryOpen] = useState(false);
  const { isAdmin, isLoggedIn } = useAuth();
  const location = useLocation();

  const {
    enrichedData,
    vote,
    markSectionRead,
    trackClick,
    readSections,
    readCount,
    totalSections,
  } = useFAQState();

  // Page tracking
  usePageTracker();

  // Global keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const handleAdminAccess = () => {
    if (isAdmin) return;
    setAdminLoginOpen(true);
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-slate-925 text-ink font-sans flex flex-col">
        {/* WOW 17: Scroll Progress */}
        <ScrollProgress />

        {/* WOW 18+19: Ambient Background + Floating Particles */}
        <FloatingElements />

        <Navbar
          onSearchOpen={() => setSearchOpen(true)}
          onAdminAccess={handleAdminAccess}
          onFeedbackOpen={() => setFeedbackOpen(true)}
          onQueryOpen={() => setQueryOpen(true)}
        />

        <SearchModal
          isOpen={searchOpen}
          onClose={() => setSearchOpen(false)}
        />

        {/* Student Auth Modal */}
        <AuthPage />

        {/* Admin Auth Modal */}
        <AdminLogin
          isOpen={adminLoginOpen}
          onClose={() => setAdminLoginOpen(false)}
        />

        {/* Feedback Modal */}
        {isLoggedIn && (
          <FeedbackModal
            isOpen={feedbackOpen}
            onClose={() => setFeedbackOpen(false)}
          />
        )}

        {/* Raise Query Modal */}
        {isLoggedIn && (
          <RaiseQueryModal
            isOpen={queryOpen}
            onClose={() => setQueryOpen(false)}
          />
        )}

        {/* WOW 12: Page Transitions */}
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={pageTransition.initial}
            animate={pageTransition.animate}
            exit={pageTransition.exit}
          >
            <Routes location={location}>
              <Route path="/" element={<HomePage />} />
              <Route
                path="/faq"
                element={
                  <FAQPage
                    data={enrichedData}
                    vote={vote}
                    markSectionRead={markSectionRead}
                    trackClick={trackClick}
                    readSections={readSections}
                    readCount={readCount}
                    totalSections={totalSections}
                  />
                }
              />
              <Route
                path="/admin"
                element={
                  isAdmin
                    ? <AdminPage enrichedData={enrichedData} />
                    : <AdminGate onLogin={() => setAdminLoginOpen(true)} />
                }
              />
              <Route path="/dashboard" element={<StudentDashboard />} />
              <Route path="/profile" element={<StudentProfile />} />
            </Routes>
          </motion.div>
        </AnimatePresence>

        <Footer />
        <YakshaMini />
      </div>
    </ToastProvider>
  );
}

/* Shown when a non-admin navigates to /admin directly */
function AdminGate({ onLogin }) {
  useEffect(() => {
    onLogin();
  }, [onLogin]);

  return (
    <div className="min-h-screen flex items-center justify-center pt-14">
      <div className="text-center">
        <p className="text-sm text-[#7c7260]">Admin authentication required.</p>
        <button
          onClick={onLogin}
          className="mt-3 px-4 py-2 text-xs font-semibold rounded-lg bg-[#1e2d3d] text-white hover:bg-[#2a3d50] transition-colors"
        >
          Login as Admin
        </button>
      </div>
    </div>
  );
}
