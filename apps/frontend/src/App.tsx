import React, { Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { BatchProvider } from './context/BatchContext';
import { FeatureFlagProvider } from './context/FeatureFlagContext';
import AuthModalHost from './components/auth/AuthModalHost';
import AppRoutes from './routes/AppRoutes';
import Spinner from './components/ui/Spinner';
import ErrorBoundary from './components/ui/ErrorBoundary';

export default function App() {
  return (
    <BrowserRouter basename="/csfaq">
      <AuthProvider>
        <BatchProvider>
          <FeatureFlagProvider>
            <AuthModalHost>
              <Suspense fallback={<div className="min-h-screen bg-bg flex items-center justify-center"><Spinner size="md" /></div>}>
                <ErrorBoundary sectionName="App (top-level)">
                  <AppRoutes />
                </ErrorBoundary>
              </Suspense>
            </AuthModalHost>
          </FeatureFlagProvider>
        </BatchProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
