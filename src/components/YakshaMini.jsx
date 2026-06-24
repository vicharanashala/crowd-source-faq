import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import { askBackend } from '../services/backendApi';

export default function YakshaMini() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Hi! I\'m Yaksha-mini. Ask me anything about the FAQ.',
    },
  ]);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    setMessages(prev => [...prev,{role:'user',text:trimmed}]);
    setInput('');

    try{
      const res=await askBackend(trimmed);

      setMessages(prev=>[
        ...prev,
        {
          role:'assistant',
          text:res.answer
        }
      ]);
    }catch(err){
      setMessages(prev=>[
        ...prev,
        {
          role:'assistant',
          text:'Unable to reach backend.'
        }
      ]);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat panel */}
      {isOpen && (
        <div
          className="w-[340px] flex flex-col rounded-[2rem] shadow-xl overflow-hidden"
          style={{ background: '#fbf7f0', maxHeight: '480px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-[#1a1a1a] rounded-t-[2rem]">
            <div className="flex flex-col gap-0.5">
              <span className="text-white font-bold text-sm tracking-wide leading-tight">
                Yaksha-mini
              </span>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                <span className="text-slate-400 text-[10px] leading-tight">
                  Answers from this site
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white transition-colors p-1 rounded-full"
              aria-label="Close chat"
            >
              <X size={15} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3" style={{ minHeight: '220px', maxHeight: '280px' }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm leading-snug ${
                    msg.role === 'user'
                      ? 'bg-[#1a1a1a] text-white rounded-br-sm'
                      : 'bg-white text-slate-700 shadow-sm rounded-bl-sm'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Footer input */}
          <div className="px-4 pb-4 pt-2">
            <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm border border-slate-100">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Type a question..."
                className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
              />
              <button
                onClick={handleSend}
                className="h-7 w-7 rounded-full bg-[#1a1a1a] flex items-center justify-center flex-shrink-0 hover:bg-slate-700 transition-colors"
                aria-label="Send"
              >
                <Send size={12} className="text-white translate-x-px" />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 text-center mt-2 leading-tight px-2">
              For your specific case, log in at{' '}
              <a
                href="https://samagama.in"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-slate-600"
              >
                samagama.in
              </a>{' '}
              and ask Yaksha.
            </p>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="h-13 w-13 rounded-full bg-[#1a1a1a] hover:bg-slate-700 shadow-xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
        style={{ height: '52px', width: '52px' }}
        aria-label="Open Yaksha-mini chat"
      >
        {isOpen ? (
          <X size={20} className="text-white" />
        ) : (
          <MessageCircle size={20} className="text-white" />
        )}
      </button>
    </div>
  );
}
