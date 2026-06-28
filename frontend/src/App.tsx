import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { FaqAssistant } from "@/components/FaqAssistant";
import { Toaster } from "@/components/ui/sonner";
import { AuthContextProvider } from "@/context/AuthContext";

import Home from "@/pages/Home";
import SearchResults from "@/pages/SearchResults";
import QuestionDetail from "@/pages/QuestionDetail";
import AskQuestion from "@/pages/AskQuestion";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import UserProfile from "@/pages/UserProfile";
import Notifications from "@/pages/Notifications";
import AdminDashboard from "@/pages/AdminDashboard";
import Analytics from "@/pages/Analytics";
import Moderation from "@/pages/Moderation";
import Categories from "@/pages/Categories";

function App() {
  return (
    <div className="App">
      <AuthContextProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<SearchResults />} />
            <Route path="/q/:slug" element={<QuestionDetail />} />
            <Route path="/ask" element={<AskQuestion />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/profile" element={<UserProfile />} />
            <Route path="/profile/:handle" element={<UserProfile />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/categories/:slug" element={<Categories />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/moderation" element={<Moderation />} />
            <Route path="/admin/users" element={<AdminDashboard />} />
            <Route path="/admin/questions" element={<AdminDashboard />} />
            <Route path="/admin/analytics" element={<Navigate to="/analytics" replace />} />
            <Route path="/admin/settings" element={<AdminDashboard />} />
            <Route path="/analytics" element={<Analytics />} />
          </Routes>
          <FaqAssistant />
          <Toaster position="bottom-right" />
        </BrowserRouter>
      </AuthContextProvider>
    </div>
  );
}

export default App;
