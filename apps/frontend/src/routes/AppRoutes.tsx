import React, { lazy, Suspense, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useFeatureFlag } from '../context/FeatureFlagContext';
import Spinner from '../components/ui/Spinner';
import { FeatureGate } from '../components/support/FeatureGate';
import MainLayout from '../components/layout/MainLayout';
import AskAIButton from '../components/askai/AskAIButton';
import AccountRoute from './guards/AccountRoute';
import AdminRoute from './guards/AdminRoute';

// User pages
const AccountPage = lazy(() => import('../pages/AccountPage'));
const HomePage = lazy(() => import('../pages/HomePage'));
const FAQPage = lazy(() => import('../pages/FAQPage'));
const CommunityPage = lazy(() => import('../pages/CommunityPage'));
const SavedKnowledgePage = lazy(() => import('../pages/SavedKnowledgePage'));
const SupportIndexPage = lazy(() => import('../pages/SupportIndexPage'));
const NewSupportRequestPage = lazy(() => import('../pages/NewSupportRequestPage'));
const SupportTicketPage = lazy(() => import('../pages/SupportTicketPage'));
const GoldenTicketPage = lazy(() => import('../pages/GoldenTicketPage'));
const WelcomePackagePage = lazy(() => import('../pages/WelcomePackagePage'));
const ProgramPortalPage = lazy(() => import('../pages/ProgramPortalPage'));
const ProgramPage = lazy(() => import('../pages/ProgramPage'));

// Admin pages
const AdminLogin = lazy(() => import('../admin/pages/AdminLogin'));
const AdminDashboard = lazy(() => import('../admin/pages/AdminDashboard'));
const AdminFAQs = lazy(() => import('../admin/pages/AdminFAQs'));
const AdminUsers = lazy(() => import('../admin/pages/AdminUsers'));
const AdminSettings = lazy(() => import('../admin/pages/AdminSettings'));
const AdminCommunity = lazy(() => import('../admin/pages/AdminCommunity'));
const AdminModeration = lazy(() => import('../admin/pages/AdminModeration'));
const AdminUnresolvedSearch = lazy(() => import('../admin/pages/AdminUnresolvedSearch'));
const AdminZoomMeetings = lazy(() => import('../admin/pages/AdminZoomMeetings'));
const AdminZoomInsights = lazy(() => import('../admin/pages/AdminZoomInsights'));
const AdminDocumentInsights = lazy(() => import('../admin/pages/AdminDocumentInsights'));
const AdminAISettings = lazy(() => import('../admin/pages/AdminAISettings'));
const FaqReview = lazy(() => import('../admin/pages/FaqReview'));
const AdminAutoAnswerQueue = lazy(() => import('../admin/pages/AdminAutoAnswerQueue'));
const AdminFAQAudit = lazy(() => import('../admin/pages/AdminFAQAudit'));
const AdminBatches = lazy(() => import('../admin/pages/AdminBatches'));
const AdminProgramSettingsPage = lazy(() => import('../admin/pages/AdminProgramSettingsPage'));
const AdminDynamicCategoriesPage = lazy(() => import('../admin/pages/AdminDynamicCategoriesPage'));
const AdminCoursesPage = lazy(() => import('../admin/pages/AdminCoursesPage'));
const AdminProgramDashboard = lazy(() => import('../admin/pages/AdminProgramDashboard'));
const AdminProgramDetail = lazy(() => import('../admin/pages/AdminProgramDetail'));
const AdminSupportInbox = lazy(() => import('../admin/pages/AdminSupportInbox'));
const AdminSupportTicket = lazy(() => import('../admin/pages/AdminSupportTicket'));
const AdminSupportGuidance = lazy(() => import('../admin/pages/AdminSupportGuidance'));
const AdminSupportAnalytics = lazy(() => import('../admin/pages/AdminSupportAnalytics'));
const AdminAnalytics = lazy(() => import('../admin/pages/AdminAnalytics'));
const AdminSupportCategories = lazy(() => import('../admin/pages/AdminSupportCategories'));
const AdminGoldenTickets = lazy(() => import('../admin/pages/AdminGoldenTickets'));
const AdminFeatures = lazy(() => import('../admin/pages/AdminFeatures'));
const AdminWelcomePage = lazy(() => import('../admin/pages/AdminWelcomePage'));
const AdminZoomAssessmentsPage = lazy(() => import('../admin/pages/AdminZoomAssessmentsPage'));
const AdminZoomQuestionsPage = lazy(() => import('../admin/pages/AdminZoomQuestionsPage'));
const AdminProjectsPage = lazy(() => import('../admin/pages/AdminProjectsPage'));
const AdminSupportLayout = lazy(() => import('../admin/components/layout/AdminSupportLayout'));
const AdminLayout = lazy(() => import('../admin/components/layout/AdminLayout'));

function SupportRoute() {
  return <SupportIndexPage />;
}

function SupportNewRoute() {
  return <NewSupportRequestPage />;
}

function SupportTicketRoute() {
  return <SupportTicketPage />;
}

function GoldenRoute() {
  return (
    <FeatureGate featureKey="goldenTicket" featureLabel="Golden Ticket">
      <GoldenTicketPage />
    </FeatureGate>
  );
}

export default function AppRoutes() {
  const { loading } = useAuth();
  const location = useLocation();
  const askAiEnabled = useFeatureFlag('askAiChatbot');
  const [mounted, setMounted] = useState(false);

  // Prevent flash: only render routes after first auth resolution
  useEffect(() => {
    setMounted(true);
  }, []);

  if (loading || !mounted) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  // Chatbot visibility is admin-controlled via the `askAiChatbot` feature
  // flag (/admin/features). Never shown on admin pages. `askAiEnabled` is
  // undefined while flags load and null for an unknown key — both treated
  // as off so the button never flashes in.
  const showAskAI = askAiEnabled === true && !location.pathname.startsWith('/admin');

  return (
    <>
      <Suspense fallback={<div className="min-h-screen bg-bg flex items-center justify-center"><Spinner size="md" /></div>}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/programs" element={<ProgramPortalPage />} />
            <Route path="/explore/select" element={<Navigate to="/programs" replace />} />
            <Route path="/faq" element={<FAQPage />} />
            <Route path="/faq/:id" element={<FAQPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/saved" element={<SavedKnowledgePage />} />
            <Route path="/support" element={<SupportRoute />} />
            <Route path="/support/new" element={<SupportNewRoute />} />
            <Route path="/support/:id" element={<SupportTicketRoute />} />
            <Route path="/golden" element={<GoldenRoute />} />
            <Route path="/program/:slug" element={<ProgramPage />} />
            <Route
              path="/account"
              element={
                <AccountRoute>
                  <AccountPage />
                </AccountRoute>
              }
            />
            <Route
              path="/welcome"
              element={
                <AccountRoute>
                  <FeatureGate featureKey="welcomePackage" featureLabel="Welcome Package">
                    <WelcomePackagePage />
                  </FeatureGate>
                </AccountRoute>
              }
            />
          </Route>

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
          <Route path="/admin/unresolved-search" element={<AdminRoute><AdminLayout><AdminUnresolvedSearch /></AdminLayout></AdminRoute>} />
          <Route path="/admin/analytics" element={<AdminRoute><AdminLayout><AdminAnalytics /></AdminLayout></AdminRoute>} />
           <Route path="/admin/zoom-meetings" element={<AdminRoute><AdminLayout><AdminZoomMeetings /></AdminLayout></AdminRoute>} />
          <Route path="/admin/zoom-insights" element={<AdminRoute><AdminLayout><AdminZoomInsights /></AdminLayout></AdminRoute>} />
          <Route path="/admin/document-insights" element={<AdminRoute><AdminLayout><FeatureGate featureKey="documentPipeline" featureLabel="Document Pipeline"><AdminDocumentInsights /></FeatureGate></AdminLayout></AdminRoute>} />
          <Route path="/admin/settings/ai" element={<AdminRoute><AdminLayout><AdminAISettings /></AdminLayout></AdminRoute>} />
          <Route path="/admin/faqs/review" element={<AdminRoute><AdminLayout><FeatureGate featureKey="faqFreshness" featureLabel="FAQ Freshness Review"><FaqReview /></FeatureGate></AdminLayout></AdminRoute>} />
          <Route path="/admin/welcome" element={<AdminRoute><AdminLayout><AdminWelcomePage /></AdminLayout></AdminRoute>} />
          <Route path="/admin/zoom" element={<AdminRoute><AdminLayout><AdminZoomAssessmentsPage /></AdminLayout></AdminRoute>} />
          <Route path="/admin/zoom/questions" element={<AdminRoute><AdminLayout><AdminZoomQuestionsPage /></AdminLayout></AdminRoute>} />
          <Route path="/admin/projects" element={<AdminRoute><AdminLayout><AdminProjectsPage /></AdminLayout></AdminRoute>} />
          <Route path="/admin/auto-answer" element={<AdminRoute><AdminLayout><FeatureGate featureKey="aiAutoAnswer" featureLabel="AI Auto-Answer"><AdminAutoAnswerQueue /></FeatureGate></AdminLayout></AdminRoute>} />
          <Route path="/admin/faq-audit" element={<AdminRoute><AdminLayout><FeatureGate featureKey="faqFreshness" featureLabel="FAQ Freshness Audit"><AdminFAQAudit /></FeatureGate></AdminLayout></AdminRoute>} />
          <Route path="/admin/batches" element={<AdminRoute><AdminLayout><AdminBatches /></AdminLayout></AdminRoute>} />
          <Route path="/admin/courses" element={<AdminRoute><AdminLayout><AdminCoursesPage /></AdminLayout></AdminRoute>} />
          <Route path="/admin/programs/:id/settings" element={<AdminRoute><AdminLayout><AdminProgramSettingsPage /></AdminLayout></AdminRoute>} />
          <Route path="/admin/programs/:id/categories" element={<AdminRoute><AdminLayout><AdminDynamicCategoriesPage /></AdminLayout></AdminRoute>} />
          <Route path="/admin/programs" element={<AdminRoute><AdminLayout><AdminProgramDashboard /></AdminLayout></AdminRoute>} />
          <Route path="/admin/programs/:id" element={<AdminRoute><AdminLayout><AdminProgramDetail /></AdminLayout></AdminRoute>} />
          <Route path="/admin/support" element={<AdminRoute><AdminLayout><FeatureGate featureKey="sessionSupport" featureLabel="Support Dashboard"><AdminSupportLayout /></FeatureGate></AdminLayout></AdminRoute>}>
            <Route index element={<AdminSupportInbox />} />
            <Route path="analytics" element={<AdminSupportAnalytics />} />
            <Route path="guidance" element={<AdminSupportGuidance />} />
            <Route path="categories" element={<AdminSupportCategories />} />
            <Route path=":id" element={<AdminSupportTicket />} />
          </Route>
          <Route path="/admin/golden-tickets" element={<AdminRoute><AdminLayout><FeatureGate featureKey="goldenTicket" featureLabel="Golden Tickets"><AdminSupportLayout /></FeatureGate></AdminLayout></AdminRoute>}>
            <Route index element={<AdminGoldenTickets />} />
          </Route>
          <Route path="/admin/features" element={<AdminRoute><AdminLayout><AdminFeatures /></AdminLayout></AdminRoute>} />

          <Route path="*" element={<Navigate to="/" state={{ from: location.pathname }} />} />
        </Routes>
      </Suspense>
      {showAskAI && <AskAIButton />}
    </>
  );
}
