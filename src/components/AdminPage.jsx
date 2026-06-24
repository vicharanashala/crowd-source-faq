import React, { useState } from 'react';
import { BarChart3, Users, MessageCircle, Activity, Settings } from 'lucide-react';
import AdminOverviewCards from './admin/AdminOverviewCards';
import AdminHeatmap from './admin/AdminHeatmap';
import AdminTopSearches from './admin/AdminTopSearches';
import AdminPanicMode from './admin/AdminPanicMode';
import AdminSelfHealing from './admin/AdminSelfHealing';
import AdminAlertSystem from './admin/AdminAlertSystem';
import AdminRecentActivity from './admin/AdminRecentActivity';
import AdminUserManagement from './admin/AdminUserManagement';
import AdminFeedbackView from './admin/AdminFeedbackView';
import AdminQueryManager from './admin/AdminQueryManager';

const tabs = [
  { id: 'overview', label: 'Overview', icon: <BarChart3 size={13} /> },
  { id: 'users', label: 'Users', icon: <Users size={13} /> },
  { id: 'queries', label: 'Queries', icon: <MessageCircle size={13} /> },
  { id: 'activity', label: 'Activity', icon: <Activity size={13} /> },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="min-h-screen pt-14 px-4 lg:px-8 py-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold text-slate-900 mb-1">Admin Dashboard</h2>
        <p className="text-sm text-slate-500">Live analytics, urgency overrides, and self-healing suggestions</p>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 mb-6 border-b border-slate-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-150 -mb-px ${
              activeTab === tab.id
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <span className={activeTab === tab.id ? 'text-amber-500' : 'text-slate-400'}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          <AdminOverviewCards />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Heatmap + Self-healing */}
            <div className="lg:col-span-2 space-y-5">
              <AdminHeatmap />
              <AdminSelfHealing />
            </div>

            {/* Right: Alerts + Top Searches + Panic */}
            <div className="space-y-4">
              <AdminAlertSystem />
              <AdminTopSearches />
              <AdminPanicMode />
            </div>
          </div>
        </div>
      )}

      {/* Users tab */}
      {activeTab === 'users' && (
        <AdminUserManagement />
      )}

      {/* Queries tab */}
      {activeTab === 'queries' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <AdminQueryManager />
          <AdminFeedbackView />
        </div>
      )}

      {/* Activity tab */}
      {activeTab === 'activity' && (
        <AdminRecentActivity />
      )}
    </div>
  );
}
