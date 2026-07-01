import React, { useState } from 'react';
import AdminOrientationTab from '../components/welcome/AdminOrientationTab';
import AdminOnboardingTab from '../components/welcome/AdminOnboardingTab';
import AdminProjectsPage from './AdminProjectsPage';
import AdminTimelineBuilderTab from '../components/welcome/AdminTimelineBuilderTab';
import AdminMentorsTab from '../components/welcome/AdminMentorsTab';
import AdminAuditLogTab from '../components/welcome/AdminAuditLogTab';

export default function AdminWelcomePage() {
  const [activeTab, setActiveTab] = useState<'orientation' | 'onboarding' | 'projects' | 'timeline' | 'mentors' | 'audit'>('orientation');

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Welcome Package Management</h1>
          <p className="text-sm text-ink-faint mt-1">
            Manage the onboarding orientation video and the project timeline.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border">
          <button
            onClick={() => setActiveTab('orientation')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'orientation'
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-soft hover:text-ink hover:border-border'
            }`}
          >
            Orientation Video
          </button>
          <button
            onClick={() => setActiveTab('onboarding')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'onboarding'
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-soft hover:text-ink hover:border-border'
            }`}
          >
            Onboarding Tracking
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'projects'
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-soft hover:text-ink hover:border-border'
            }`}
          >
            Projects
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'timeline'
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-soft hover:text-ink hover:border-border'
            }`}
          >
            Timeline Builder
          </button>
          <button
            onClick={() => setActiveTab('mentors')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'mentors'
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-soft hover:text-ink hover:border-border'
            }`}
          >
            Mentors
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'audit'
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-soft hover:text-ink hover:border-border'
            }`}
          >
            Audit Log
          </button>
      </div>

      <div className="pt-4">
        {activeTab === 'orientation' && <AdminOrientationTab />}
        {activeTab === 'onboarding' && <AdminOnboardingTab />}
        {activeTab === 'timeline' && <AdminTimelineBuilderTab />}
        {activeTab === 'mentors' && <AdminMentorsTab />}
        {activeTab === 'audit' && <AdminAuditLogTab />}
        {activeTab === 'projects' && (
          <div className="-mt-8">
            <AdminProjectsPage />
          </div>
        )}
      </div>
    </div>
  );
}
