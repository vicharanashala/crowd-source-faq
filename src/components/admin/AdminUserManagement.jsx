import React from 'react';
import { Users, Ban, CheckCircle } from 'lucide-react';
import * as userService from '../../services/userService';
import * as searchService from '../../services/searchService';
import * as faqService from '../../services/faqService';
import * as queryService from '../../services/queryService';
import { useAnalytics } from '../../contexts/AnalyticsContext';

export default function AdminUserManagement() {
  const { refreshAnalytics } = useAnalytics();
  const users = userService.getAllUsers();

  const handleToggleStatus = (userId) => {
    userService.toggleUserStatus(userId);
    refreshAnalytics();
  };

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users size={15} className="text-brand-400" />
        <h3 className="text-sm font-semibold text-slate-900">User Management</h3>
        <span className="ml-auto text-xs text-slate-500">{users.length} students</span>
      </div>

      {users.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">No registered students yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200">
                {['Name', 'Email', 'Joined', 'Last Active', 'Searches', 'Likes', 'Bookmarks', 'Queries', 'Status', ''].map(h => (
                  <th key={h} className="px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const searches = searchService.getSearchHistory(user.id).length;
                const likes = faqService.getUserLikes(user.id).length;
                const bookmarks = faqService.getUserBookmarks(user.id).length;
                const queries = queryService.getUserQueries(user.id).length;
                const isActive = user.status !== 'disabled';

                return (
                  <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-2 py-2 text-xs font-medium text-slate-800 whitespace-nowrap">{user.name}</td>
                    <td className="px-2 py-2 text-xs text-slate-600 whitespace-nowrap">{user.email}</td>
                    <td className="px-2 py-2 text-[11px] text-slate-500 whitespace-nowrap">{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td className="px-2 py-2 text-[11px] text-slate-500 whitespace-nowrap">{user.lastActive ? new Date(user.lastActive).toLocaleDateString() : '—'}</td>
                    <td className="px-2 py-2 text-xs text-slate-600 text-center">{searches}</td>
                    <td className="px-2 py-2 text-xs text-slate-600 text-center">{likes}</td>
                    <td className="px-2 py-2 text-xs text-slate-600 text-center">{bookmarks}</td>
                    <td className="px-2 py-2 text-xs text-slate-600 text-center">{queries}</td>
                    <td className="px-2 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => handleToggleStatus(user.id)}
                        className={`p-1 rounded transition-colors ${isActive ? 'text-red-400 hover:text-red-600' : 'text-green-400 hover:text-green-600'}`}
                        title={isActive ? 'Disable user' : 'Enable user'}
                      >
                        {isActive ? <Ban size={12} /> : <CheckCircle size={12} />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
