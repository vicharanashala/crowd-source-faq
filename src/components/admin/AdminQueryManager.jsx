import React from 'react';
import { MessageCircle, CheckCircle, Clock } from 'lucide-react';
import * as queryService from '../../services/queryService';

export default function AdminQueryManager() {
  const allQueries = queryService.getAllQueries();
  const pending = allQueries.filter(q => q.status === 'pending');
  const resolved = allQueries.filter(q => q.status === 'resolved');

  const handleResolve = (queryId) => {
    queryService.updateQueryStatus(queryId, 'resolved');
    // Force re-render
    window.dispatchEvent(new Event('storage'));
  };

  const handleReopen = (queryId) => {
    queryService.updateQueryStatus(queryId, 'pending');
    window.dispatchEvent(new Event('storage'));
  };

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle size={15} className="text-orange-400" />
        <h3 className="text-sm font-semibold text-slate-900">Student Queries</h3>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">
            {pending.length} pending
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
            {resolved.length} resolved
          </span>
        </div>
      </div>

      {allQueries.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">No queries raised yet.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {[...pending, ...resolved].map(q => (
            <div key={q.id} className={`border rounded-lg p-3 ${q.status === 'pending' ? 'bg-yellow-50/50 border-yellow-200' : 'bg-white/4 border-white/8'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-slate-800">{q.question}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-500">{q.userName}</span>
                    <span className="text-[10px] text-slate-400">•</span>
                    <span className="text-[10px] text-slate-500">{q.category}</span>
                    <span className="text-[10px] text-slate-400">•</span>
                    <span className="text-[10px] text-slate-400">{new Date(q.timestamp).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {q.status === 'pending' ? (
                    <button
                      onClick={() => handleResolve(q.id)}
                      className="flex items-center gap-1 text-[10px] text-green-600 font-medium bg-green-50 border border-green-200 px-2 py-0.5 rounded-full hover:bg-green-100 transition-colors"
                    >
                      <CheckCircle size={10} />
                      Resolve
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReopen(q.id)}
                      className="flex items-center gap-1 text-[10px] text-yellow-600 font-medium bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full hover:bg-yellow-100 transition-colors"
                    >
                      <Clock size={10} />
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
