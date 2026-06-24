import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send, HelpCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import * as queryService from '../services/queryService';
import * as analyticsService from '../services/analyticsService';
import { useToast } from './ui/Toast';

const categories = ['NOC', 'Internship', 'Dates', 'Certificate', 'ViBe', 'Rosetta', 'Other'];

export default function RaiseQueryModal({ isOpen, onClose }) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [question, setQuestion] = useState('');
  const [category, setCategory] = useState('Other');

  const handleSubmit = () => {
    if (!question.trim() || !currentUser) return;
    queryService.submitQuery({
      userId: currentUser.id,
      userName: currentUser.name,
      email: currentUser.email,
      question: question.trim(),
      category,
    });
    analyticsService.logActivity({
      userId: currentUser.id,
      userName: currentUser.name,
      email: currentUser.email,
      action: 'query',
      category,
      question: question.trim(),
      interactionType: 'query',
    });
    showToast('Query raised! Admin will review it.');
    setQuestion('');
    setCategory('Other');
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
        className="relative bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md p-6"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 transition-colors">
          <X size={16} />
        </button>
        <div className="flex items-center gap-2 mb-1">
          <HelpCircle size={18} className="text-amber-500" />
          <h3 className="font-display text-lg font-bold text-slate-900">Raise a Query</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">Can't find what you're looking for? Ask here.</p>

        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400 transition-colors mb-3"
        >
          {categories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Describe your question in detail..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-amber-400 transition-colors resize-none h-28"
        />

        <button
          onClick={handleSubmit}
          disabled={!question.trim()}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-slate-900 text-white text-sm py-2.5 rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
        >
          <Send size={13} />
          Submit Query
        </button>
      </motion.div>
    </div>
  );
}
