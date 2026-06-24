import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, Send } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import * as feedbackService from '../services/feedbackService';
import * as analyticsService from '../services/analyticsService';
import { useToast } from './ui/Toast';

export default function FeedbackModal({ isOpen, onClose }) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);

  const handleSubmit = () => {
    if (!text.trim() || rating === 0 || !currentUser) return;
    feedbackService.submitFeedback({
      userId: currentUser.id,
      userName: currentUser.name,
      email: currentUser.email,
      feedback: text.trim(),
      rating,
    });
    analyticsService.logActivity({
      userId: currentUser.id,
      userName: currentUser.name,
      email: currentUser.email,
      action: 'feedback',
      interactionType: 'feedback',
    });
    showToast('Feedback submitted! Thank you.');
    setText('');
    setRating(0);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md p-6"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 transition-colors">
          <X size={16} />
        </button>
        <h3 className="font-display text-lg font-bold text-slate-900 mb-1">Share Feedback</h3>
        <p className="text-xs text-slate-500 mb-4">Help us improve the FAQ portal</p>

        {/* Star rating */}
        <div className="flex items-center gap-1 mb-4">
          {[1, 2, 3, 4, 5].map(s => (
            <button
              key={s}
              onMouseEnter={() => setHoverRating(s)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setRating(s)}
              className="transition-transform hover:scale-110"
            >
              <Star
                size={24}
                className={(hoverRating || rating) >= s ? 'text-amber-400' : 'text-slate-200'}
                fill={(hoverRating || rating) >= s ? 'currentColor' : 'none'}
              />
            </button>
          ))}
          {rating > 0 && <span className="ml-2 text-xs text-slate-500">{rating}/5</span>}
        </div>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="What do you think about the portal? What can we improve?"
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-amber-400 transition-colors resize-none h-28"
        />

        <button
          onClick={handleSubmit}
          disabled={!text.trim() || rating === 0}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-slate-900 text-white text-sm py-2.5 rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
        >
          <Send size={13} />
          Submit Feedback
        </button>
      </motion.div>
    </div>
  );
}
