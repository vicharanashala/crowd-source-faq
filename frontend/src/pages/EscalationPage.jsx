import { useState, useEffect } from "react";
import EscalationForm from "../components/EscalationForm";
import EscalationTracker from "../components/EscalationTracker";
import AdminDashboard from "../components/AdminDashboard";
import "../styles/escalation.css";

// `role` is passed down from wherever you check the logged-in user's
// role in your real app (auth context, JWT claim, etc.) — see App.jsx
// for how the standalone demo runner wires this up.
const EscalationPage = ({ role }) => {
  const [activeTab, setActiveTab] = useState("submit"); // submit | track | admin
  const isAdmin = role === "admin";

  // If the user switches out of admin while sitting on the Admin
  // Dashboard tab, that tab disappears — so bounce back to a tab
  // that still exists instead of leaving an empty screen.
  useEffect(() => {
    if (!isAdmin && activeTab === "admin") {
      setActiveTab("submit");
    }
  }, [isAdmin, activeTab]);

  return (
    <div className="escalation-page">
      <div className="escalation-page-header">
        <h1 className="escalation-page-title">Escalation Center</h1>
        <p className="escalation-page-subtitle">
          Crowdsourced FAQ · Vicharanashala · IIT Ropar
        </p>
      </div>

      <div className="escalation-tabs">
        <button
          className={activeTab === "submit" ? "tab-active" : ""}
          onClick={() => setActiveTab("submit")}
        >
          Submit Query
        </button>
        <button
          className={activeTab === "track" ? "tab-active" : ""}
          onClick={() => setActiveTab("track")}
        >
          Track Status
        </button>
        {isAdmin && (
          <button
            className={activeTab === "admin" ? "tab-active" : ""}
            onClick={() => setActiveTab("admin")}
          >
            Admin Dashboard
          </button>
        )}
      </div>

      <div className="escalation-content">
        {activeTab === "submit" && (
          <EscalationForm onSubmitted={() => setActiveTab("track")} />
        )}
        {activeTab === "track" && <EscalationTracker />}
        {activeTab === "admin" && isAdmin && <AdminDashboard />}
      </div>
    </div>
  );
};

export default EscalationPage;
