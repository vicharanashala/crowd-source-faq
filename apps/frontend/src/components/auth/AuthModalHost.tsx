import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { AuthModalProvider, useAuthModal } from '../../context/AuthModalContext';
import AuthModal from './AuthModal';

const FIRST_VISIT_PROMPT_KEY = 'yaksha_first_visit_prompt_seen';

function FirstVisitAuthPrompt() {
  const { isOpen } = useAuthModal();
  const { isAuthenticated, loading } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    if (
      pathname === '/' ||
      pathname.startsWith('/explore') ||
      pathname.startsWith('/home')
    ) {
      return;
    }
    if (loading) return;
    if (isAuthenticated) return;
    if (typeof window === 'undefined') return;

    let alreadySeen = false;
    try {
      alreadySeen = localStorage.getItem(FIRST_VISIT_PROMPT_KEY) === '1';
    } catch { /* ignored */ }
    if (alreadySeen) return;

    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(FIRST_VISIT_PROMPT_KEY, '1');
      } catch { /* ignored */ }
      window.dispatchEvent(new CustomEvent('authmodal:open', {
        detail: { tab: 'signin' },
      }));
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [loading, isAuthenticated, pathname]);

  void isOpen;
  return null;
}

export default function AuthModalHost({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return (
    <AuthModalProvider isAuthenticated={isAuthenticated}>
      <FirstVisitAuthPrompt />
      {children}
      <AuthModal />
    </AuthModalProvider>
  );
}
