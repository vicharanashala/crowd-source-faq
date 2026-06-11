import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { AuthModalProvider, useAuthModal } from './context/AuthModalContext';
import { BatchProvider } from './context/BatchContext';
import { FeatureFlagProvider } from './context/FeatureFlagContext';
import AuthModal from './components/auth/AuthModal';
import Spinner from './components/ui/Spinner';
import AskAIButton from './components/askai/AskAIButton';
import { FeatureGate } from './components/support/FeatureGate';

// User pages
const AccountPage = lazy(() => import('./pages/AccountPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const FAQPage = lazy(() => import('./pages/FAQPage'));
const CommunityPage = lazy(() => import('./pages/CommunityPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const SavedKnowledgePage = lazy(() => import('./pages/SavedKnowledgePage'));
const BatchPortalPage = lazy(() => import('./pages/BatchPortalPage'));
const SupportIndexPage = lazy(() => import('./pages/SupportIndexPage'));
const NewSupportRequestPage = lazy(() => import('./pages/NewSupportRequestPage'));
const SupportTicketPage = lazy(() => import('./pages/SupportTicketPage'));
const GoldenTicketPage = lazy(() => import('./pages/GoldenTicketPage'));

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
const AdminDocumentInsights = lazy(() => import('./admin/pages/AdminDocumentInsights'));
const AdminAISettings = lazy(() => import('./admin/pages/AdminAISettings'));
const FaqReview = lazy(() => import('./admin/pages/FaqReview'));
const AdminAutoAnswerQueue = lazy(() => import('./admin/pages/AdminAutoAnswerQueue'));
const AdminFAQAudit = lazy(() => import('./admin/pages/AdminFAQAudit'));
const AdminBatches = lazy(() => import('./admin/pages/AdminBatches'));
const AdminSupportInbox = lazy(() => import('./admin/pages/AdminSupportInbox'));
const AdminSupportTicket = lazy(() => import('./admin/pages/AdminSupportTicket'));
const AdminSupportGuidance = lazy(() => import('./admin/pages/AdminSupportGuidance'));
const AdminSupportAnalytics = lazy(() => import('./admin/pages/AdminSupportAnalytics'));
const AdminSupportCategories = lazy(() => import('./admin/pages/AdminSupportCategories'));
const AdminGoldenTickets = lazy(() => import('./admin/pages/AdminGoldenTickets'));
const AdminFeatures = lazy(() => import('./admin/pages/AdminFeatures'));
const AdminLayout = lazy(() => import('./admin/components/layout/AdminLayout'));

interface AccountRouteProps {
  children: React.ReactNode;
}

// Account/settings is the only member-only page now — it's a logged-in
// user's own profile. Anonymous visitors get bounced to home (where the
// auth modal is mounted and they can sign in).
function AccountRoute({ children }: AccountRouteProps) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }
  return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
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

// Component defining all available URLs in the app.
// All "content" routes (home, faq, community, leaderboard) are now public —
// read access is universal, write actions open the auth modal in place.
function AppRoutes() {
  const { loading } = useAuth();
  const location = useLocation();

  // Prevent route flashing by waiting for the initial auth check to finish
  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  // Hide the floating Ask AI bar on /admin/* routes (admin has its own panel).
  const showAskAI = !location.pathname.startsWith('/admin');

  return (
    <>
      <Routes>
        {/* The public FAQ discovery page is now the base URL — anyone
            landing on the site gets the no-auth, anonymous-analytics
            experience. */}
        <Route path="/" element={<HomePage />} />
        <Route path="/explore/select" element={<BatchPortalPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/faq/:id" element={<FAQPage />} />
        <Route path="/community" element={<CommunityPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/saved" element={<SavedKnowledgePage />} />

        {/* Session Support (experimental — gated by feature flag at page level) */}
        <Route path="/support" element={<SupportIndexPage />} />
        <Route path="/support/new" element={<NewSupportRequestPage />} />
        <Route path="/support/:id" element={<SupportTicketPage />} />

        {/* v1.65.1 — Golden Ticket (user-driven flow). Wrapped in
            FeatureGate so admins can toggle the whole feature off
            from /admin/features. When off, the page shows the same
            "this feature is currently off" panel the rest of the
            app uses for experimental features. The backend also
            gates /golden/queue and /me/sp with the same flag. */}
        <Route
          path="/golden"
          element={
            <FeatureGate featureKey="goldenTicket" featureLabel="Golden Ticket">
              <GoldenTicketPage />
            </FeatureGate>
          }
        />

        {/* Member-only: a user's own settings */}
        <Route
          path="/account"
          element={
            <AccountRoute>
              <AccountPage />
            </AccountRoute>
          }
        />

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
        <Route path="/admin/document-insights" element={<AdminRoute><AdminLayout><AdminDocumentInsights /></AdminLayout></AdminRoute>} />
        <Route path="/admin/settings/ai" element={<AdminRoute><AdminLayout><AdminAISettings /></AdminLayout></AdminRoute>} />
        <Route path="/admin/faqs/review" element={<AdminRoute><AdminLayout><FaqReview /></AdminLayout></AdminRoute>} />
        <Route path="/admin/auto-answer" element={<AdminRoute><AdminLayout><AdminAutoAnswerQueue /></AdminLayout></AdminRoute>} />
        <Route path="/admin/faq-audit" element={<AdminRoute><AdminLayout><AdminFAQAudit /></AdminLayout></AdminRoute>} />
        <Route path="/admin/batches" element={<AdminRoute><AdminLayout><AdminBatches /></AdminLayout></AdminRoute>} />

        {/* Session Support admin (not gated by feature flag) */}
        <Route path="/admin/support" element={<AdminRoute><AdminLayout><AdminSupportInbox /></AdminLayout></AdminRoute>} />
        <Route path="/admin/support/analytics" element={<AdminRoute><AdminLayout><AdminSupportAnalytics /></AdminLayout></AdminRoute>} />
        <Route path="/admin/support/guidance" element={<AdminRoute><AdminLayout><AdminSupportGuidance /></AdminLayout></AdminRoute>} />
        <Route path="/admin/support/categories" element={<AdminRoute><AdminLayout><AdminSupportCategories /></AdminLayout></AdminRoute>} />
        <Route path="/admin/golden-tickets" element={<AdminRoute><AdminLayout><AdminGoldenTickets /></AdminLayout></AdminRoute>} />
        <Route path="/admin/support/:id" element={<AdminRoute><AdminLayout><AdminSupportTicket /></AdminLayout></AdminRoute>} />

        {/* Feature flag toggles (admin only) */}
        <Route path="/admin/features" element={<AdminRoute><AdminLayout><AdminFeatures /></AdminLayout></AdminRoute>} />

        {/* Catch-all fallback: redirect any unknown URL to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showAskAI && <AskAIButton />}
    </>
  );
}

// Inner wrapper that subscribes to isAuthenticated so the AuthModalProvider
// can detect the false→true flip and replay any pending gated action.
function AuthModalHost({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return (
    <AuthModalProvider isAuthenticated={isAuthenticated}>
      <FirstVisitAuthPrompt />
      {children}
      <AuthModal />
    </AuthModalProvider>
  );
}

// localStorage flag that controls the one-time auto-popup for anonymous
// visitors. The flag is set as soon as the modal has been shown once — we
// never clear it (signing in and signing out doesn't re-trigger the prompt).
const FIRST_VISIT_PROMPT_KEY = 'yaksha_first_visit_prompt_seen';

/**
 * FirstVisitAuthPrompt — pops the sign-in/sign-up modal exactly once, the
 * first time an anonymous visitor lands on the site.
 *
 * Spec ("Authentication & Access Control Fixes"):
 *  - Appears once when a non-authenticated user first enters the website
 *  - Does NOT reappear on subsequent page navigations (Home → FAQ → Community
 *    → Leaderboard, etc.)
 *  - Does NOT reappear when the user signs out and visits again
 *  - Does NOT appear at all if the user is already signed in
 *  - Reappearing on a restricted action is handled separately by useAuthGate()
 */
function FirstVisitAuthPrompt() {
  const { isOpen } = useAuthModal();
  const { isAuthenticated, loading } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    // The public FAQ discovery page is at "/" — no auth prompt there.
    // The legacy /home and /explore paths (if any) also bypass it.
    if (
      pathname === '/' ||
      pathname.startsWith('/explore') ||
      pathname.startsWith('/home')
    ) {
      return;
    }
    if (loading) return;             // wait for the initial auth check
    if (isAuthenticated) return;    // signed-in users don't need a welcome prompt
    if (typeof window === 'undefined') return;

    let alreadySeen = false;
    try {
      alreadySeen = localStorage.getItem(FIRST_VISIT_PROMPT_KEY) === '1';
    } catch { /* localStorage disabled — silently skip */ }
    if (alreadySeen) return;

    // Defer 1.2s so the home page actually paints before the modal lands.
    // If the user closes the modal manually, the flag is still set (we never
    // re-prompt) — they can keep browsing as anon or hit the navbar sign-in.
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(FIRST_VISIT_PROMPT_KEY, '1');
      } catch { /* noop */ }
      window.dispatchEvent(new CustomEvent('authmodal:open', {
        detail: { tab: 'signin' },
      }));
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [loading, isAuthenticated, pathname]);

  // No-op render — this component is purely a side-effect host.
  void isOpen;
  return null;
}

// The absolute root of the React tree
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FeatureFlagProvider>
          <BatchProvider>
            <AuthModalHost>
              <Suspense fallback={<div className="min-h-screen bg-bg flex items-center justify-center"><Spinner size="md" /></div>}>
                <AppRoutes />
              </Suspense>
            </AuthModalHost>
          </BatchProvider>
        </FeatureFlagProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
