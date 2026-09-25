import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AuthModalProvider } from '../../context/AuthModalContext';
import AuthModal from './AuthModal';

// Incident fix (2026-09-25): removed the old FirstVisitAuthPrompt, which
// auto-popped this modal for every anonymous first-time visitor after
// 1.2s. Now that the modal is staff-only sign-in (registration closed,
// students use Samagama), auto-prompting the vast majority of visitors
// — who are students, not staff — with a "Staff sign in" popup they
// can't use is actively confusing. Staff open it deliberately via the
// navbar "Sign in" button instead.

export default function AuthModalHost({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return (
    <AuthModalProvider isAuthenticated={isAuthenticated}>
      {children}
      <AuthModal />
    </AuthModalProvider>
  );
}
