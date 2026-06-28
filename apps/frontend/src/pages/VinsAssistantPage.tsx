import React, { useEffect, useMemo, useState } from 'react';
import api from '../utils/api';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  matchedFaq?: { id: number; category: string; question: string } | null;
}

export default function VinsAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: 'assistant',
      content: 'Hi! I can answer questions about VINS internships, NOC steps, deadlines, and offer letter details.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [status, setStatus] = useState('Ask anything related to the VINS programme.');

  const lastAssistantMessage = useMemo(() => {
    return [...messages].reverse().find((m) => m.role === 'assistant');
  }, [messages]);

  useEffect(() => {
    if (!lastAssistantMessage) return;
    setStatus('Response ready. Share feedback if you want.');
  }, [lastAssistantMessage]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: Message = { id: Date.now(), role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setStatus('Searching the VINS handbook...');

    try {
      const response = await api.post('/vins/chat', { message: trimmed, conversationHistory: messages.map((m) => ({ role: m.role, content: m.content })) });
      const assistantMessage: Message = {
        id: Date.now() + 1,
        role: 'assistant',
        content: response.data.answer,
        matchedFaq: response.data.matchedFaq ?? null,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setStatus('Answer received.');
    } catch (error: any) {
      setMessages((prev) => [...prev, { id: Date.now() + 2, role: 'assistant', content: error?.response?.data?.message || 'The assistant could not respond right now.' }]);
      setStatus('The assistant could not respond right now.');
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async () => {
    if (rating === null || !lastAssistantMessage) return;

    try {
      await api.post('/vins/feedback', {
        question: messages[messages.length - 2]?.content || '',
        answer: lastAssistantMessage.content,
        rating,
        feedback,
      });
      setStatus('Thanks for the feedback.');
      setFeedback('');
      setRating(null);
    } catch {
      setStatus('Feedback could not be saved right now.');
    }
  };

  return (
    <div className="min-h-screen bg-[rgb(var(--bg-page-rgb))] px-4 py-24 text-ink">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row">
        <section className="flex-1 rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">VINS Assistant</p>
              <h1 className="text-2xl font-semibold">Ask anything about your internship journey</h1>
            </div>
            <div className="rounded-full border border-border bg-bg px-3 py-1 text-sm text-ink-soft">{status}</div>
          </div>

          <div className="space-y-3 rounded-2xl border border-border bg-bg/70 p-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === 'user' ? 'bg-accent text-white' : 'border border-border bg-card'}`}>
                  <div>{message.content}</div>
                  {message.matchedFaq && (
                    <div className="mt-2 text-xs text-ink-faint">
                      Matched FAQ: {message.matchedFaq.question}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-ink-soft">Thinking…</div>
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Ask about NOC, deadlines, offer letters, or internships..."
              className="flex-1 rounded-2xl border border-border bg-bg px-4 py-3 text-sm outline-none focus:border-accent"
            />
            <button onClick={sendMessage} disabled={loading} className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
              Send
            </button>
          </div>
        </section>

        <aside className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Helpful topics</h2>
          <ul className="mt-4 space-y-2 text-sm text-ink-soft">
            <li>• NOC upload and eligibility</li>
            <li>• Internship duration and start dates</li>
            <li>• Offer letter acceptance steps</li>
            <li>• Certificate and date confirmation rules</li>
          </ul>

          <div className="mt-6 rounded-2xl border border-border bg-bg/70 p-4">
            <h3 className="text-sm font-semibold">Rate this answer</h3>
            <div className="mt-3 flex gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} onClick={() => setRating(value)} className={`rounded-full border px-3 py-1 text-sm ${rating === value ? 'border-accent bg-accent text-white' : 'border-border text-ink-soft'}`}>
                  {value}★
                </button>
              ))}
            </div>
            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Tell us what was helpful or missing" className="mt-3 min-h-[90px] w-full rounded-2xl border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
            <button onClick={submitFeedback} disabled={rating === null} className="mt-3 rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              Submit feedback
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
