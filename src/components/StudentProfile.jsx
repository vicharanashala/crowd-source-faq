import React from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Calendar, Activity } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useUserProfile } from '../contexts/UserProfileContext';
import { pageTransition } from '../lib/animations';

export default function StudentProfile() {
  const { currentUser } = useAuth();
  const { profile } = useUserProfile();

  if (!profile) {
    return (
      <div className="min-h-screen pt-14 flex items-center justify-center">
        <p className="text-sm text-slate-500">Please log in to view your profile.</p>
      </div>
    );
  }

  return (
    <motion.div className="min-h-screen pt-14 px-4 lg:px-8 py-6 max-w-3xl mx-auto" {...pageTransition}>
      <h2 className="font-display text-2xl font-bold text-slate-900 mb-6">My Profile</h2>

      <div className="glass-card p-6">
        {/* Avatar + Name */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-amber-500/20 border-2 border-amber-500/40 flex items-center justify-center text-lg font-bold text-amber-600">
            {currentUser.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">{currentUser.name}</h3>
            <p className="text-xs text-slate-500">{currentUser.role === 'admin' ? 'Administrator' : 'Student'}</p>
          </div>
        </div>

        {/* Info rows */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <Mail size={14} className="text-slate-400" />
            <span className="text-slate-600">{currentUser.email}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Calendar size={14} className="text-slate-400" />
            <span className="text-slate-600">Joined {new Date(currentUser.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Activity size={14} className="text-slate-400" />
            <span className="text-slate-600">
              {profile.stats.bookmarkCount} bookmarks · {profile.stats.likeCount} likes · {profile.stats.searchCount} searches
            </span>
          </div>
        </div>
      </div>

      {/* Activity Summary */}
      <div className="mt-6 glass-card p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Activity Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { label: 'Bookmarks', value: profile.stats.bookmarkCount },
            { label: 'Likes', value: profile.stats.likeCount },
            { label: 'Dislikes', value: profile.stats.dislikeCount },
            { label: 'Searches', value: profile.stats.searchCount },
            { label: 'Queries Raised', value: profile.stats.queryCount },
            { label: 'Feedback Given', value: profile.stats.feedbackCount },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="text-xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
