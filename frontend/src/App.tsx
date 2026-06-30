import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { AuthModalProvider, useAuthModal } from './context/AuthModalContext';
import { BatchProvider } from './context/BatchContext';
import { FeatureFlagProvider } from './context/FeatureFlagContext';
import { LanguageProvider } from './context/LanguageContext';
import { ToastProvider } from './context/ToastContext';
import AuthModal from './components/auth/AuthModal';
import Spinner from './components/ui/Spinner';
import ErrorBoundary from './components/ui/ErrorBoundary';
import AskAIButton from './components/askai/AskAIButton';
import { FeatureGate } from './components/support/FeatureGate';
import MainLayout from './components/layout/MainLayout';

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
const WelcomePackagePage = lazy(() => import('./pages/WelcomePackagePage'));
const Yaksha2026_27ProgramPage = lazy(() => import('./pages/Yaksha2026_27ProgramPage'));
const ProgramPortalPage = lazy(() => import('./pages/ProgramPortalPage'));
const ProgramPage = lazy(() => import('./pages/ProgramPage'));
const RecoveryPage = lazy(() => import('./pages/RecoveryPage'));

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
const AdminProgramSettingsPage = lazy(() => import('./admin/pages/AdminProgramSettingsPage'));
const AdminDynamicCategoriesPage = lazy(() => import('./admin/pages/AdminDynamicCategoriesPage'));
const AdminCoursesPage = lazy(() => import('./admin/pages/AdminCoursesPage'));
const AdminProgramDashboard = lazy(() => import('./admin/pages/AdminProgramDashboard'));
const AdminProgramDetail = lazy(() => import('./admin/pages/AdminProgramDetail'));
const AdminSupportInbox = lazy(() => import('./admin/pages/AdminSupportInbox'));
const AdminSupportTicket = lazy(() => import('./admin/pages/AdminSupportTicket'));
const AdminSupportGuidance = lazy(() => import('./admin/pages/AdminSupportGuidance'));
const AdminSupportAnalytics = lazy(() => import('./admin/pages/AdminSupportAnalytics'));
const AdminSupportCategories = lazy(() => import('./admin/pages/AdminSupportCategories'));
const AdminGoldenTickets = lazy(() => import('./admin/pages/AdminGoldenTickets'));
const AdminFeatures = lazy(() => import('./admin/pages/AdminFeatures'));
const AdminWelcomePage = lazy(() => import('./admin/pages/AdminWelcomePage'));
const AdminProjectsPage = lazy(() => import('./admin/pages/AdminProjectsPage'));
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
        <Route element={<MainLayout />}>
          {/* `/` is now the merged DoubtDrop-style FAQ discovery page.
              The old HomePage (course picker + accordion) is reachable
              at `/programs` for admins who want the program-portal view.
              Old bookmarks to /faq still work (rendered by the same
              FAQPage) so deep-links to /faq/:id keep functioning. */}
          <Route path="/" element={<HomePage />} />
          {/* v1.69 — Phase 12: the program picker (formerly
              served at `/`) is now at `/programs` for explicit
              program browsing. Admins land here from the
              Programs Hub link; non-admins generally don't
              need it. */}
          <Route path="/programs" element={<ProgramPortalPage />} />
          {/* v1.69 — Phase 12: keep the legacy redirect for
              bookmarks that pointed at the old picker URL. */}
          <Route path="/explore/select" element={<Navigate to="/programs" replace />} />
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

          {/* v1.69 — slug-routed program microsite. Deep-link to a
              specific program (e.g. /program/summership). The home
              page at `/` is the standard FAQ-discovery page, not a
              program portal — the BatchSwitcher in the navbar lets
              users change programs from there. */}
          <Route path="/program/:slug" element={<ProgramPage />} />
          <Route path="/recovery" element={<RecoveryPage />} />

          {/* Member-only: a user's own settings */}
          <Route
            path="/account"
            element={
              <AccountRoute>
                <AccountPage />
              </AccountRoute>
            }
          />
        </Route>

        {/* Admin Panel dedicated routes (guarded by AdminRoute) */}
        {/* v1.68 — /admin/login is gone. The single global AuthModal
            (rendered by AuthModalHost below) handles sign-in for
            everyone. Visiting /admin/login now bounces to / with
            a ?next=/admin hint, so after the user signs in the
            smart-routing in AuthModal.handleLoginSubmit sends them
            to /admin. Same UX, one login page. */}
        <Route
          path="/admin/login"
          element={<AdminLogin />}
        />
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
        <Route path="/admin/welcome" element={<AdminRoute><AdminLayout><AdminWelcomePage /></AdminLayout></AdminRoute>} />
        <Route path="/admin/projects" element={<AdminRoute><AdminLayout><AdminProjectsPage /></AdminLayout></AdminRoute>} />
        <Route path="/admin/auto-answer" element={<AdminRoute><AdminLayout><AdminAutoAnswerQueue /></AdminLayout></AdminRoute>} />
        <Route path="/admin/faq-audit" element={<AdminRoute><AdminLayout><AdminFAQAudit /></AdminLayout></AdminRoute>} />
        <Route path="/admin/batches" element={<AdminRoute><AdminLayout><AdminBatches /></AdminLayout></AdminRoute>} />
        {/* v1.69 — admin CRUD for courses within a program. */}
        <Route path="/admin/courses" element={<AdminRoute><AdminLayout><AdminCoursesPage /></AdminLayout></AdminRoute>} />
        {/* v1.69 — per-program settings editor. Admin sets the
            theme, hero copy, and which sections show on the
            public program page. */}
        <Route path="/admin/programs/:id/settings" element={<AdminRoute><AdminLayout><AdminProgramSettingsPage /></AdminLayout></AdminRoute>} />
        <Route path="/admin/programs/:id/categories" element={<AdminRoute><AdminLayout><AdminDynamicCategoriesPage /></AdminLayout></AdminRoute>} />
        {/* v1.69 — Phase 10: admin program dashboard (list) and
            detail (tabbed per-program view). Each tab in the
            detail view is a thin wrapper around the existing
            per-program admin endpoints added in Phases 4-9. */}
        <Route path="/admin/programs" element={<AdminRoute><AdminLayout><AdminProgramDashboard /></AdminLayout></AdminRoute>} />
        <Route path="/admin/programs/:id" element={<AdminRoute><AdminLayout><AdminProgramDetail /></AdminLayout></AdminRoute>} />

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
      pathname.startsWith('/home') ||
      pathname.startsWith('/admin')
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
          <LanguageProvider>
            <BatchProvider>
              <ToastProvider>
                <AuthModalHost>
                  <Suspense fallback={<div className="min-h-screen bg-bg flex items-center justify-center"><Spinner size="md" /></div>}>
                    {/* H2 fix (v1.68): top-level ErrorBoundary catches any
                        render-time exception from any page. Without it, a
                        single bad render unmounts the whole app. */}
                    <ErrorBoundary sectionName="App (top-level)">
                      <AppRoutes />
                    </ErrorBoundary>
                  </Suspense>
                </AuthModalHost>
              </ToastProvider>
            </BatchProvider>
          </LanguageProvider>
        </FeatureFlagProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
