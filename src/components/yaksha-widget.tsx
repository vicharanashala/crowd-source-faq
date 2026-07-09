import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { MessageCircle, X, Send, Sparkles, Loader2 } from "lucide-react";
import { askAi } from "@/lib/faq.functions";

type Msg = {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ id: string; question: string }>;
};

export function YakshaWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi, I'm Yakṣa. Ask me anything about the internship — I'll answer from the FAQ knowledge base.",
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const askFn = useServerFn(askAi);

  // Hide widget on the full /ask page to avoid duplication
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hide = pathname === "/ask" || pathname.startsWith("/auth");

  const ask = useMutation({
    mutationFn: (q: string) => askFn({ data: { question: q } }),
    onSuccess: (res) => {
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          content: res.answer,
          sources: (res.sources ?? []).map((s: { id: string; question: string }) => ({
            id: s.id,
            question: s.question,
          })),
        },
      ]);
    },
    onError: (err: Error) => {
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: `Sorry, something went wrong: ${err.message}` },
      ]);
    },
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, ask.isPending]);

  function submit() {
    const q = input.trim();
    if (q.length < 3 || ask.isPending) return;
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setInput("");
    ask.mutate(q);
  }

  if (hide) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ask Yakṣa"
          className="fixed bottom-5 right-5 z-50 group flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-3 shadow-lg hover:shadow-xl transition-all hover:scale-105"
        >
          <MessageCircle className="h-4 w-4" />
          <span className="text-sm font-medium hidden sm:inline">Ask Yakṣa</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[92vw] sm:w-[380px] max-h-[80vh] flex flex-col rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary/5">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">Yakṣa AI</div>
                <div className="text-[10px] text-muted-foreground">
                  Grounded in the FAQ knowledge base
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-3">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  {m.content}
                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/40 space-y-1">
                      <div className="text-[10px] uppercase tracking-wide opacity-70">
                        Sources
                      </div>
                      {m.sources.map((s, idx) => (
                        <Link
                          key={s.id}
                          to="/faq/$id"
                          params={{ id: s.id }}
                          onClick={() => setOpen(false)}
                          className="block text-[11px] hover:underline opacity-90"
                        >
                          [{idx + 1}] {s.question}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {ask.isPending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2 text-sm flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex items-center gap-2 border-t border-border p-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              className="flex-1 bg-transparent px-2 py-2 text-sm focus:outline-none"
              disabled={ask.isPending}
            />
            <button
              type="submit"
              disabled={ask.isPending || input.trim().length < 3}
              className="rounded-lg bg-primary text-primary-foreground p-2 disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
