import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';
import { useAuth } from './AuthContext';
import { useToast } from '../components/ui/Toast';

const backdrop = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const modal = {
  hidden: { opacity: 0, scale: 0.92, y: 30 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', damping: 25, stiffness: 300 },
  },
  exit: { opacity: 0, scale: 0.92, y: 30, transition: { duration: 0.2 } },
};

export default function AuthPage() {
  const { authOpen, closeAuth, pendingAction, setPendingAction } = useAuth();
  const { showToast } = useToast();
  const [view, setView] = useState('login');

  const handleSuccess = () => {
    showToast('Logged In');
    if (pendingAction) {
      // Execute the queued action after successful auth
      const action = pendingAction;
      setPendingAction(null);
      closeAuth();
      // Small delay to let state settle before running the action
      setTimeout(() => action(), 50);
    } else {
      closeAuth();
    }
    setView('login');
  };

  const handleClose = () => {
    closeAuth();
    setView('login');
  };

  return (
    <AnimatePresence>
      {authOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          variants={backdrop}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-[#1e2d3d]/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-md"
            variants={modal}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <AnimatePresence mode="wait">
              {view === 'login' ? (
                <LoginForm
                  key="login"
                  onSuccess={handleSuccess}
                  onSwitchToSignup={() => setView('signup')}
                  onClose={handleClose}
                />
              ) : (
                <SignupForm
                  key="signup"
                  onSuccess={handleSuccess}
                  onSwitchToLogin={() => setView('login')}
                  onClose={handleClose}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
