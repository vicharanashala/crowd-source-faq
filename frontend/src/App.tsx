import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import DiscussionForumPage from "./pages/DiscussionForumPage";
import DiscussionDetailPage from "./pages/DiscussionDetailPage";
import FaqPage from "./pages/FaqPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import QueryResolutionPage from "./pages/QueryResolutionPage";
import EscalationPage from "./pages/EscalationPage";

export default function App() {
  return (
    <div className="min-h-screen bg-parchment">
      <Navbar />
      <Routes>
        <Route path="/" element={<Navigate to="/forum" replace />} />
        <Route path="/forum" element={<DiscussionForumPage />} />
        <Route path="/forum/:id" element={<DiscussionDetailPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/query-resolution" element={<QueryResolutionPage />} />
        <Route path="/escalation" element={<EscalationPage />} />
        <Route path="*" element={<Navigate to="/forum" replace />} />
      </Routes>
    </div>
  );
}
