import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { FAQItem, CATEGORIES } from '../data/faqs.js';
import { Users, BookOpen, MessageSquare, ListFilter, Plus, Edit2, Trash2, Check, X, ShieldAlert } from 'lucide-react';

interface AdminStats {
  totalUsers: number;
  totalFaqs: number;
  chatQueriesToday: number;
  topSearchedTerms: Array<{ term: string; count: number }>;
}

interface UserRosterItem {
  id: string;
  name: string;
  email: string;
  role: string;
  spurtiPoints: number;
  streak: number;
  badges: string[];
  createdAt: string;
}

interface CommunitySuggestion {
  id: string;
  question: string;
  answer: string;
  authorId: string;
  createdAt: string;
  author: {
    name: string;
    email: string;
  };
}

export const AdminPanel: React.FC = () => {
  const { user } = useAuth();
  
  // States
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [roster, setRoster] = useState<UserRosterItem[]>([]);
  const [queue, setQueue] = useState<CommunitySuggestion[]>([]);
  const [faqs, setFaqs] = useState<FAQItem[]>([]);

  // FAQ Editor Modal states
  const [showEditor, setShowEditor] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FAQItem | null>(null);
  const [faqId, setFaqId] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [relatedInput, setRelatedInput] = useState('');

  // Fetch admin stats
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Error fetching admin stats:', e);
    }
  };

  // Fetch users roster
  const fetchRoster = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setRoster(data);
      }
    } catch (e) {
      console.error('Error fetching user roster:', e);
    }
  };

  // Fetch moderation queue
  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/admin/queue');
      if (res.ok) {
        const data = await res.json();
        setQueue(data);
      }
    } catch (e) {
      console.error('Error fetching queue:', e);
    }
  };

  // Fetch FAQs list
  const fetchFaqs = async () => {
    try {
      const res = await fetch('/api/faqs');
      if (res.ok) {
        const data = await res.json();
        setFaqs(data);
      }
    } catch (e) {
      console.error('Error fetching FAQs:', e);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchStats();
      fetchRoster();
      fetchQueue();
      fetchFaqs();
    }
  }, [user]);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="text-center py-16 bg-[#07071c] border border-slate-850 rounded-2xl p-8 max-w-xl mx-auto space-y-4">
        <ShieldAlert className="mx-auto text-rose-500 animate-pulse" size={48} />
        <h3 className="font-display text-lg font-bold text-white">Chamber Access Denied</h3>
        <p className="text-slate-450 text-xs font-sans">
          Your current security clearance is insufficient. The Admin Council coordinates here. Present administrative credentials.
        </p>
      </div>
    );
  }

  // Handle delete FAQ
  const handleDeleteFaq = async (id: string) => {
    if (!window.confirm(`Are you sure you want to delete FAQ ${id}?`)) return;

    try {
      const res = await fetch(`/api/admin/faqs/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setFaqs(prev => prev.filter(f => f.id !== id));
        fetchStats();
      }
    } catch (e) {
      console.error('Delete FAQ failed:', e);
    }
  };

  // Handle open editor for creation or update
  const handleOpenEditor = (faq: FAQItem | null = null) => {
    if (faq) {
      setEditingFaq(faq);
      setFaqId(faq.id);
      setCategory(faq.category);
      setQuestion(faq.question);
      setAnswer(faq.answer);
      setTagsInput(faq.tags.join(', '));
      setRelatedInput(faq.related.join(', '));
    } else {
      setEditingFaq(null);
      setFaqId(`FAQ-${Math.floor(100 + Math.random() * 900)}`);
      setCategory(CATEGORIES[0]);
      setQuestion('');
      setAnswer('');
      setTagsInput('');
      setRelatedInput('');
    }
    setShowEditor(true);
  };

  // Submit FAQ form
  const handleFaqSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      id: faqId,
      category,
      question,
      answer,
      tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
      related: relatedInput.split(',').map(r => r.trim()).filter(Boolean),
    };

    try {
      const url = editingFaq ? `/api/faqs/${faqId}` : '/api/faqs';
      const method = editingFaq ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowEditor(false);
        fetchFaqs();
        fetchStats();
      } else {
        const data = await res.json();
        alert(`Error saving FAQ: ${data.error}`);
      }
    } catch (e) {
      console.error('Submit FAQ failed:', e);
    }
  };

  // Approve User Q&A suggestion
  const handleApproveSuggestion = async (id: string) => {
    const categoryName = window.prompt("Assign Category for this Q&A:", CATEGORIES[0]);
    if (categoryName === null) return; // cancelled

    try {
      const res = await fetch(`/api/admin/queue/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: categoryName }),
      });
      if (res.ok) {
        setQueue(prev => prev.filter(q => q.id !== id));
        fetchFaqs();
        fetchStats();
      }
    } catch (e) {
      console.error('Approval failed:', e);
    }
  };

  // Reject User Q&A suggestion
  const handleRejectSuggestion = async (id: string) => {
    if (!window.confirm("Reject and discard this suggestion?")) return;

    try {
      const res = await fetch(`/api/admin/queue/${id}/reject`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setQueue(prev => prev.filter(q => q.id !== id));
      }
    } catch (e) {
      console.error('Rejection failed:', e);
    }
  };

  return (
    <div className="space-y-8">
      
      {/* Live Stats counters */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#07071c] p-4 rounded-xl border border-slate-800 flex items-center justify-between shadow-md">
            <div>
              <span className="text-[10px] text-slate-500 font-mono block">Registered Candidates</span>
              <span className="text-xl font-bold text-white font-mono">{stats.totalUsers}</span>
            </div>
            <Users className="text-cyan-400" size={24} />
          </div>

          <div className="bg-[#07071c] p-4 rounded-xl border border-slate-800 flex items-center justify-between shadow-md">
            <div>
              <span className="text-[10px] text-slate-500 font-mono block">Official FAQ Articles</span>
              <span className="text-xl font-bold text-white font-mono">{stats.totalFaqs}</span>
            </div>
            <BookOpen className="text-violet-400" size={24} />
          </div>

          <div className="bg-[#07071c] p-4 rounded-xl border border-slate-800 flex items-center justify-between shadow-md">
            <div>
              <span className="text-[10px] text-slate-500 font-mono block">Consultations Today</span>
              <span className="text-xl font-bold text-white font-mono">{stats.chatQueriesToday}</span>
            </div>
            <MessageSquare className="text-emerald-400" size={24} />
          </div>

          <div className="bg-[#07071c] p-4 rounded-xl border border-slate-800 space-y-1.5 shadow-md">
            <span className="text-[10px] text-slate-500 font-mono block">Top Consulted Topics</span>
            <div className="flex flex-wrap gap-1">
              {stats.topSearchedTerms.map((t, i) => (
                <span key={i} className="text-[9px] bg-slate-900 text-cyan-400 px-1.5 py-0.5 rounded font-mono border border-slate-850">
                  {t.term} ({t.count})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: FAQ list & Users Roster */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left: FAQ Editor management (size 7) */}
        <div className="lg:col-span-7 bg-[#07071c] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-display font-extrabold text-white text-base tracking-wide">FAQ Management</h3>
              <p className="text-xs text-slate-450">Add, edit, or delete items in database</p>
            </div>
            <button
              onClick={() => handleOpenEditor(null)}
              className="bg-gradient-to-r from-[#7C3AED] to-[#06B6D4] text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:brightness-110"
            >
              <Plus size={14} />
              <span>Add FAQ</span>
            </button>
          </div>

          <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-2 scrollbar-thin">
            {faqs.map(faq => (
              <div key={faq.id} className="p-3 bg-slate-950/60 rounded-xl border border-slate-900 flex items-start justify-between gap-4 text-xs hover:border-slate-850 transition-colors">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] bg-slate-900 text-slate-450 px-1 rounded font-mono">{faq.id}</span>
                    <span className="text-[8px] bg-cyan-950/40 text-cyan-400 px-1 rounded uppercase tracking-wider font-bold">{faq.category}</span>
                  </div>
                  <h4 className="font-semibold text-slate-200 leading-snug">{faq.question}</h4>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleOpenEditor(faq)}
                    className="p-1.5 rounded bg-slate-900 border border-slate-850 hover:bg-[#7C3AED]/20 hover:text-cyan-400 text-slate-400"
                    title="Edit FAQ"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => handleDeleteFaq(faq.id)}
                    className="p-1.5 rounded bg-slate-900 border border-slate-850 hover:bg-rose-950/20 hover:text-rose-450 text-slate-400"
                    title="Delete FAQ"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: User Roster (size 5) */}
        <div className="lg:col-span-5 bg-[#07071c] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="font-display font-extrabold text-white text-base tracking-wide">Candidate Roster</h3>
            <p className="text-xs text-slate-450">Intern profile contribution points</p>
          </div>

          <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-2 scrollbar-thin">
            {roster.map(u => (
              <div key={u.id} className="p-3 bg-slate-950/60 rounded-xl border border-slate-900 flex items-center justify-between text-xs hover:border-slate-850">
                <div className="space-y-0.5">
                  <p className="font-bold text-slate-200">{u.name}</p>
                  <p className="text-[9px] text-slate-500 font-mono">{u.email} • {u.role}</p>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-cyan-400 font-bold">
                  <span>{u.spurtiPoints} SP</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Moderation Queue */}
      <div className="bg-[#07071c] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="font-display font-extrabold text-white text-base tracking-wide">Moderation Queue</h3>
          <p className="text-xs text-slate-450">Community suggested FAQs pending validation</p>
        </div>

        {queue.length === 0 ? (
          <div className="text-center py-8 bg-slate-950/50 rounded-xl text-slate-500 text-xs border border-slate-900">
            No suggestions currently pending review.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {queue.map(item => (
              <div key={item.id} className="p-4 bg-slate-950/70 border border-slate-900 rounded-xl space-y-3 text-xs flex flex-col justify-between hover:border-slate-850">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[10px] text-slate-500 border-b border-slate-900 pb-1">
                    <span>Submitted by: {item.author.name}</span>
                    <span className="font-mono">{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] text-cyan-400 font-mono block">Suggested Question:</span>
                    <p className="font-bold text-slate-200 leading-snug">{item.question}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] text-violet-400 font-mono block">Suggested Answer:</span>
                    <p className="text-slate-350 leading-relaxed font-sans">{item.answer}</p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-900">
                  <button
                    onClick={() => handleRejectSuggestion(item.id)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-850 hover:bg-rose-950/20 text-rose-450 font-bold tracking-wider uppercase text-[10px] cursor-pointer"
                  >
                    <X size={12} />
                    <span>Reject</span>
                  </button>
                  <button
                    onClick={() => handleApproveSuggestion(item.id)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#06B6D4]/15 border border-[#06B6D4]/30 text-[#06B6D4] font-bold tracking-wider uppercase text-[10px] cursor-pointer hover:brightness-110"
                  >
                    <Check size={12} />
                    <span>Approve</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="bg-[#070718] border border-[#7C3AED]/35 w-full max-w-lg rounded-2xl p-6 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowEditor(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>

            <h3 className="text-base font-display font-extrabold text-white mb-4">
              {editingFaq ? `Modify FAQ Article: ${editingFaq.id}` : 'Compile New FAQ Article'}
            </h3>

            <form onSubmit={handleFaqSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-1">Article ID</label>
                  <input
                    type="text"
                    value={faqId}
                    onChange={(e) => setFaqId(e.target.value)}
                    required
                    disabled={!!editingFaq}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-200 focus:outline-none focus:border-[#7C3AED] disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-200 focus:outline-none"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-1">Question</label>
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  required
                  placeholder="Enter the FAQ question"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-200 focus:outline-none focus:border-[#7C3AED]"
                />
              </div>

              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-1">Answer</label>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  required
                  rows={4}
                  placeholder="Enter the official answer text..."
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-200 focus:outline-none focus:border-[#7C3AED] font-sans leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-1">Tags (Comma-separated)</label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="e.g. NOC, Deadline, TPO"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-1">Related IDs (Comma-separated)</label>
                  <input
                    type="text"
                    value={relatedInput}
                    onChange={(e) => setRelatedInput(e.target.value)}
                    placeholder="e.g. FAQ-002, FAQ-005"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-[#7C3AED] to-[#06B6D4] text-white py-2 rounded text-xs font-bold hover:brightness-110 cursor-pointer shadow-lg shadow-violet-950/20"
              >
                {editingFaq ? 'Save Modification' : 'Deploy Article'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminPanel;
