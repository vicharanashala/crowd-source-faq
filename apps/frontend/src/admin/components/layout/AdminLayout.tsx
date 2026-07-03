import React, { type ReactNode, useState } from 'react';
import { Navigate } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AdminHeader from './AdminHeader';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import ErrorBoundary from '../../../components/ui/ErrorBoundary';
import { AdminProgramScopeWiring, installAdminScopedApiInterceptor } from '../../utils/adminScopedApi';
import { useProgram } from '../../../context/ProgramContext';

// v1.69 — multi-program scoping: install the adminApi request
// interceptor once at app boot. The interceptor reads the active
// program id from ProgramContext on every request and attaches it
// as `?batchId=...` so every admin endpoint scopes itself
// automatically. Pages don't need to remember to pass batchId.
installAdminScopedApiInterceptor();

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAdminAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { currentProgram } = useProgram();

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center shadow-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-accent animate-pulse">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/?next=/admin" replace />;

  return (
    <div className="min-h-screen bg-bg text-ink selection:bg-accent/20 flex flex-col font-sans">
      {/* v1.69 — wiring component. Renders null but pushes the active
          program id into the adminApi interceptor on every render,
          so the next request always carries the right batchId. */}
      <AdminProgramScopeWiring />
      <AdminHeader mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      <div className="flex-1 flex w-full max-w-[1600px] mx-auto relative pt-4 md:pt-6">
        <AdminSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

        <main key={currentProgram?._id ?? 'none'} className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 pb-16 lg:pb-24">
          <ErrorBoundary sectionName="AdminPage" level="section">
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
