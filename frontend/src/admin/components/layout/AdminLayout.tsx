import React, { type ReactNode, useState } from 'react';
import { Navigate } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AdminNavbar from './AdminNavbar';
import { useAdminAuth } from '../../hooks/useAdminAuth';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAdminAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-admin-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-admin-surface flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
          <div className="w-4 h-4 border border-admin-muted/30 border-t-admin-purple rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/admin/login" replace />;

  return (
    <div className="min-h-screen bg-admin-bg flex">
      <AdminSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 lg:ml-56">
        <AdminNavbar onMobileMenuToggle={() => setMobileOpen(v => !v)} />
        <main className="flex-1 p-5 lg:p-6 overflow-y-auto">{children}</main>
      </div>
 