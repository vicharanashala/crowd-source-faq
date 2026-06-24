import React from 'react';
import { Star, MessageCircle } from 'lucide-react';
import * as feedbackService from '../../services/feedbackService';

export default function AdminFeedbackView() {
  const feedback = feedbackService.getAllFeedback();
  const avgRating = feedbackService.getAverageRating();

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle size={15} className="text-pink-400" />
        <h3 className="text-sm font-semibold text-slate-900">Student Feedback</h3>
        {feedback.length > 0 && (
          <span className="ml-auto text-xs text-slate-500 flex items-center gap-1">
            <Star size={10} className="text-amber-400" /> {avgRating}/5 avg
          </span>
        )}
      </div>

      {feedback.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">No feedback submitted yet.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {feedback.map(f => (
            <div key={f.id} className="bg-white/4 border border-white/8 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-800">{f.userName}</span>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={10}
                      className={i < f.rating ? 'text-amber-400' : 'text-slate-200'}
                      fill={i < f.rating ? 'currentColor' : 'none'}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{f.feedback}</p>
              <p className="text-[10px] text-slate-400 mt-1">{new Date(f.timestamp).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
