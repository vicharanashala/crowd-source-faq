import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, ExternalLink, Loader2, MessageCircle, Send, User, X, BookOpen } from "lucide-react";
import api from "@/lib/api";

type ChatRole = "assistant" | "user";

type Citation = {
  id?: string;
  title?: string;
  slug?: string;
};

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  citations?: Citation[];
  matches?: Citation[];
};


const starterMessage: ChatMessage = {
  id: "assistant-starter",
  role: "assistant",
  text: "Welcome to CrowdFAQ Copilot! Ask me any technical or community question. I'll search our community-sourced knowledge base and answer you instantly.",
};

const buildId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const FaqAssistant = () => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([starterMessage]);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const trimmedInput = input.trim();
  const canSend = trimmedInput.length > 0 && !loading;

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const toggleOpen = () => {
    setOpen((value) => !value);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const submitMessage = async (event: FormEvent) => {
    event.preventDefault();

    if (!canSend) {
      return;
    }

    const userMessage: ChatMessage = {
      id: buildId(),
      role: "user",
      text: trimmedInput,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Build history from current messages for multi-turn RAG
      const history = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await api.post("/ai/chat", { message: trimmedInput, history });
      const payload = res.data;

      if (!payload.success) {
        throw new Error(payload?.error?.message || "FAQ assistant is unavailable");
      }

      setMessages((current) => [
        ...current,
        {
          id: buildId(),
          role: "assistant",
          text: payload.data.answer,
          citations: payload.data.citations || payload.data.matches || [],
        },
      ]);
    } catch (error) {
      let errorMessage = "FAQ assistant is unavailable right now. Please try again in a moment.";
      if (error && typeof error === "object" && "response" in error) {
        const responseData = (error as any).response?.data;
        errorMessage = responseData?.error?.message || responseData?.message || (error as any).message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      setMessages((current) => [
        ...current,
        {
          id: buildId(),
          role: "assistant",
          text: errorMessage,
        },
      ]);
    } finally {
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  // Helper to parse [Source N] and replace with interactive Link
  const renderMessageText = (text: string, citations: Citation[] = []) => {
    if (!text) return "";

    const regex = /\[Source\s+(\d+)\]/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const matchIndex = match.index;
      const fullMatch = match[0];
      const sourceNum = parseInt(match[1], 10);

      // Add text before the match
      if (matchIndex > lastIndex) {
        parts.push(text.substring(lastIndex, matchIndex));
      }

      const citation = citations[sourceNum - 1];
      if (citation) {
        const targetPath = citation.slug ? `/q/${citation.slug}` : `/q/${citation.id}`;
        parts.push(
          <Link
            key={`inline-citation-${sourceNum}-${matchIndex}`}
            to={targetPath}
            className="inline-flex items-center align-baseline px-1.5 py-0.5 bg-[#E8F0ED] hover:bg-[#00684A] text-[#00684A] hover:text-white border border-[#00684A]/20 text-[10px] font-bold rounded mx-0.5 transition-colors cursor-pointer"
            title={citation.title}
          >
            [{sourceNum}]
          </Link>
        );
      } else {
        parts.push(fullMatch);
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-[calc(100vw-2rem)] max-w-[420px] sm:bottom-6 sm:right-6 sm:w-[420px] font-sans">
      {open && (
        <section
          className="mb-3 border border-[#E6E6E1] bg-white shadow-[0_12px_40px_rgba(0,30,43,0.16)] rounded-2xl overflow-hidden flex flex-col h-[520px] transition-all duration-300 ease-in-out"
          aria-label="FAQ assistant"
          data-testid="faq-assistant-panel"
        >
          {/* Header (MongoDB Dark Slate Theme) */}
          <div className="flex h-16 shrink-0 items-center justify-between bg-[#001E2B] px-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#00684A] text-white">
                <Bot size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white tracking-wide">CrowdFAQ Copilot</p>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#02B875] animate-pulse" />
                  <p className="text-[11px] text-[#A6C0B5]">AI assistant online</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#A6C0B5] hover:text-white hover:bg-white/10 transition-colors"
              title="Close assistant"
              aria-label="Close assistant"
            >
              <X size={18} />
            </button>
          </div>

          {/* Chat Panel Body */}
          <div className="flex-1 overflow-y-auto bg-[#F9FBFB] p-4 space-y-4">
            {messages.map((message) => {
              const hasCitations = (message.citations || message.matches || []).length > 0;
              const activeCitations = message.citations || message.matches || [];

              return (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "assistant" && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#E6E6E1] bg-white text-[#00684A] shadow-sm">
                      <Bot size={15} />
                    </div>
                  )}
                  
                  <div className="flex flex-col gap-2 max-w-[80%]">
                    {/* Message Bubble */}
                    <div
                      className={`px-4 py-3 text-sm leading-relaxed whitespace-pre-line shadow-sm border ${
                        message.role === "user"
                          ? "border-[#00684A] bg-[#00684A] text-white rounded-2xl rounded-tr-none"
                          : "border-[#E6E6E1] bg-white text-[#1C2D24] rounded-2xl rounded-tl-none"
                      }`}
                    >
                      {message.role === "assistant"
                        ? renderMessageText(message.text, activeCitations)
                        : message.text}
                    </div>

                    {/* Sources (MongoDB Pill-style) */}
                    {message.role === "assistant" && hasCitations && (
                      <div className="mt-1 pl-1 space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#8A8A85] flex items-center gap-1">
                          <BookOpen size={10} /> Sources
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {activeCitations.slice(0, 3).map((c, i) => {
                            const targetPath = c.slug ? `/q/${c.slug}` : `/q/${c.id}`;
                            return (
                              <Link
                                key={c.id || i}
                                to={targetPath}
                                className="inline-flex items-center gap-1 rounded-lg border border-[#E6E6E1] bg-white px-2.5 py-1 text-xs text-[#1C2D24] hover:bg-[#E8F0ED] hover:border-[#00684A] hover:text-[#00684A] transition-all max-w-[220px] truncate shadow-sm"
                                title={c.title}
                              >
                                <span className="font-semibold text-[#00684A] shrink-0">[{i + 1}]</span>
                                <span className="truncate">{c.title}</span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {message.role === "user" && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#E6E6E1] bg-white text-[#001E2B] shadow-sm">
                      <User size={15} />
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div className="flex items-center gap-2 pl-1 text-xs font-bold uppercase tracking-wider text-[#00684A]">
                <Loader2 size={14} className="animate-spin" />
                Searching CrowdFAQ...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input Area (MongoDB Styled Focus states) */}
          <form onSubmit={submitMessage} className="flex border-t border-[#E6E6E1] bg-white p-3 shrink-0">
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="min-w-0 flex-1 border border-[#E6E6E1] rounded-xl px-4 py-2.5 text-sm outline-none transition-all focus:border-[#00684A] focus:ring-1 focus:ring-[#00684A]"
              placeholder="Ask a technical or platform question..."
              aria-label="Ask the FAQ assistant"
              data-testid="faq-assistant-input"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="ml-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#00684A] text-white transition-all hover:bg-[#004d36] disabled:cursor-not-allowed disabled:opacity-50"
              title="Send message"
              aria-label="Send message"
              data-testid="faq-assistant-send"
            >
              <Send size={15} />
            </button>
          </form>
        </section>
      )}

      {/* Launcher Button (MongoDB green color & pulse effect) */}
      <button
        type="button"
        onClick={toggleOpen}
        className="ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#00684A] text-white shadow-[0_8px_24px_rgba(0,104,74,0.3)] transition-all hover:bg-[#02B875] hover:scale-105 duration-200"
        title={open ? "Close FAQ assistant" : "Open FAQ assistant"}
        aria-label={open ? "Close FAQ assistant" : "Open FAQ assistant"}
        data-testid="faq-assistant-toggle"
      >
        {open ? <X size={22} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
};
