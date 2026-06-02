import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Spinner from './components/ui/Spinner';

// User pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const FAQPage = lazy(() => import('./pages/FAQPage'));
const CommunityPage = lazy(() => import('./pages/CommunityPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));

// Admin pages
const AdminLogin = lazy(() => import('./admin/pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./admin/pages/AdminDashboard'));
const AdminFAQs = lazy(() => import('./admin/pages/AdminFAQs'));
const AdminUsers = lazy(() => import('./admin/pages/AdminUsers'));
const AdminSettings = lazy(() => import('./admin/pages/AdminSettings'));
const AdminCommunity = lazy(() => import('./admin/pages/AdminCommunity'));
const AdminModeration = lazy(() => import('./admin/pages/AdminModeration'));
const AdminLeaderboard = lazy(() => import('./admin/pages/AdminLeaderboard'));
const AdminUnresolvedSearch = lazy(() => import('./admin/pages/AdminUnresolvedSearch'));
const AdminZoomMeetings = lazy(() => import('./admin/pages/AdminZoomMeetings'));
const AdminZoomInsights = lazy(() => import('./admin/pages/AdminZoomInsights'));
const AdminAISettings = lazy(() => import('./admin/pages/AdminAISettings'));
const FaqReview = lazy(() => import('./admin/pages/FaqReview'));
const AdminLayout = lazy(() => import('./admin/components/layout/AdminLayout'));

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Helper component to lock down specific routes
function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, loading } = useAuth();

  // Show a minimal loading spinner while the app verifies the token in the background
  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  // If authenticated, render the requested page; otherwise, kick them back to login
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

interface AdminRouteProps {
  children: React.ReactNode;
}

function AdminRoute({ children }: AdminRouteProps) {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  return isAuthenticated && (user?.role === 'admin' || user?.role === 'moderator')
    ? children
    : <Navigate to="/" replace />;
}

// Component defining all available URLs in the app
function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();

  // Prevent route flashing by waiting for the initial auth check to finish
  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <Routes>
      {/* Public Routes: Redirect to home if the user is already logged in */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />}
      />

      {/* Private Routes: Wrapped in ProtectedRoute to enforce authentication */}
      <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
      <Route path="/faq" element={<ProtectedRoute><FAQPage /></ProtectedRoute>} />
      <Route path="/faq/:id" element={<ProtectedRoute><FAQPage /></ProtectedRoute>} />
      <Route path="/community" element={<ProtectedRoute><CommunityPage /></ProtectedRoute>} />
      <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
      <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />

      {/* Admin Panel dedicated routes (guarded by AdminRoute) */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminRoute><AdminLayout><AdminDashboard /></AdminLayout></AdminRoute>} />
      <Route path="/admin/faqs" element={<AdminRoute><AdminLayout><AdminFAQs /></AdminLayout></AdminRoute>} />
      <Route path="/admin/users" element={<AdminRoute><AdminLayout><AdminUsers /></AdminLayout></AdminRoute>} />
      <Route path="/admin/settings" element={<AdminRoute><AdminLayout><AdminSettings /></AdminLayout></AdminRoute>} />
      <Route path="/admin/community" element={<AdminRoute><AdminLayout><AdminCommunity /></AdminLayout></AdminRoute>} />
      <Route path="/admin/moderation" element={<AdminRoute><AdminLayout><AdminModeration /></AdminLayout></AdminRoute>} />
      <Route path="/admin/leaderboard" element={<AdminRoute><AdminLayout><AdminLeaderboard /></AdminLayout></AdminRoute>} />
      <Route path="/admin/unresolved-search" element={<AdminRoute><AdminLayout><AdminUnresolvedSearch /></AdminLayout></AdminRoute>} />
      <Route path="/admin/zoom-meetings" element={<AdminRoute><AdminLayout><AdminZoomMeetings /></AdminLayout></AdminRoute>} />
      <Route path="/admin/zoom-insights" element={<AdminRoute><AdminLayout><AdminZoomInsights /></AdminLayout></AdminRoute>} />
      <Route path="/admin/settings/ai" element={<AdminRoute><AdminLayout><AdminAISettings /></AdminLayout></AdminRoute>} />
      <Route path="/admin/faqs/review" element={<AdminRoute><AdminLayout><FaqReview /></AdminLayout></AdminRoute>} />

      {/* Catch-all fallback: Redirect any unknown URLs to the home page */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// The absolute root of the React tree
export default function App() {
  return (
    // 1. BrowserRouter enables URL navigation
    <BrowserRouter>
      {/* 2. AuthProvider injects global user state into all child components */}
      <AuthProvider>
        <Suspense fallback={<div className="min-h-screen bg-bg flex items-center justify-center"><Spinner size="md" /></div>}>
          {/* 4. AppRoutes actually renders the correct page based on the URL */}
          <AppRoutes />
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}