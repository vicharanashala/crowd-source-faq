import React, { useState } from 'react';
import { Pin, X, Edit3, Trash2, AlertTriangle } from 'lucide-react';
import { useAlerts } from '../../contexts/AlertContext';

export default function AdminAlertSystem() {
  const { alerts, pinnedAlert, createAlert, pinAlert, unpinAlert, editAlert, deleteAlert } = useAlerts();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState('normal');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editMessage, setEditMessage] = useState('');

  const handleSubmit = () => {
    if (!title.trim() || !message.trim()) return;
    createAlert({ title, message, note, priority });
    setTitle('');
    setMessage('');
    setNote('');
    setPriority('normal');
  };

  const handleStartEdit = (alert) => {
    setEditingId(alert.id);
    setEditTitle(alert.title);
    setEditMessage(alert.message);
  };

  const handleSaveEdit = (id) => {
    editAlert(id, { title: editTitle, message: editMessage });
    setEditingId(null);
  };

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Pin size={15} className="text-yellow-400" />
        <h3 className="text-sm font-semibold text-slate-900">Admin Alert System</h3>
      </div>
      <p className="text-xs text-slate-500 mb-3">Pin a message to the student-facing portal</p>

      {/* Create form */}
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Alert title (e.g. 'NOC Deadline Extended')"
        className="w-full bg-white/60 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-brand-500/50 transition-colors mb-2"
      />
      <input
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="Alert message for students"
        className="w-full bg-white/60 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-brand-500/50 transition-colors mb-2"
      />
      <input
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Optional note"
        className="w-full bg-white/60 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-brand-500/50 transition-colors mb-2"
      />
      <select
        value={priority}
        onChange={e => setPriority(e.target.value)}
        className="w-full bg-white/60 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-brand-500/50 transition-colors mb-3"
      >
        <option value="low">Low Priority</option>
        <option value="normal">Normal Priority</option>
        <option value="high">High Priority</option>
        <option value="critical">Critical Priority</option>
      </select>
      <button
        onClick={handleSubmit}
        disabled={!title.trim() || !message.trim()}
        className="w-full bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-xs py-2 rounded-lg hover:bg-yellow-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
      >
        📌 Create Alert
      </button>

      {/* Alert history */}
      {alerts.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">History</p>
          {alerts.map(alert => (
            <div key={alert.id} className={`border rounded-lg p-3 ${alert.pinned ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-white/4 border-white/8'}`}>
              {editingId === alert.id ? (
                <div className="space-y-2">
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full bg-white/60 border border-slate-300 rounded px-2 py-1 text-xs text-slate-900 outline-none" />
                  <input value={editMessage} onChange={e => setEditMessage(e.target.value)} className="w-full bg-white/60 border border-slate-300 rounded px-2 py-1 text-xs text-slate-900 outline-none" />
                  <div className="flex gap-2">
                    <button onClick={() => handleSaveEdit(alert.id)} className="text-xs text-green-600 font-medium">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-slate-500">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">{alert.pinned && '📌 '}{alert.title}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{alert.message}</p>
                      {alert.note && <p className="text-[11px] text-slate-400 mt-0.5">{alert.note}</p>}
                      <p className="text-[10px] text-slate-400 mt-1">{new Date(alert.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => alert.pinned ? unpinAlert(alert.id) : pinAlert(alert.id)} className={`p-1 rounded transition-colors ${alert.pinned ? 'text-yellow-500 hover:text-yellow-600' : 'text-slate-400 hover:text-yellow-500'}`} title={alert.pinned ? 'Unpin' : 'Pin'}>
                        <Pin size={12} />
                      </button>
                      <button onClick={() => handleStartEdit(alert)} className="p-1 text-slate-400 hover:text-blue-500 transition-colors" title="Edit">
                        <Edit3 size={12} />
                      </button>
                      <button onClick={() => deleteAlert(alert.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors" title="Delete">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
