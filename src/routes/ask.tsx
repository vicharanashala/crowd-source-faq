import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { motion } from "motion/react";

import { SiteHeader, SiteFooter, Container } from "@/components/site";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askAi } from "@/lib/faq.functions";

export const Route = createFileRoute("/ask")({
  head: () => ({
    meta: [
      { title: "Ask Vidyā — AI answers grounded in the FAQ" },
      { name: "description", content: "Ask any question about the Vicharanashala Internship and get an AI answer grounded in the FAQ, with sources." },
    ],
  }),
  validateSearch: (s) => z.object({ q: z.string().optional() }).parse(s),
  component: Ask,
});

function Ask() {
  const { q: initial } = Route.useSearch();
  const [question, setQuestion] = useState(initial ?? "");
  const askFn = useServerFn(askAi);
  const mut = useMutation({
    mutationFn: (question: string) => askFn({ data: { question } }),
  });

  useEffect(() => {
    if (initial && !mut.data && !mut.isPending) mut.mutate(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (question.trim().length < 3) return;
    mut.mutate(question.trim());
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Container className="py-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-primary">
              <Sparkles className="h-3 w-3" /> Grounded in the FAQ
            </div>
            <h1 className="mt-4 font-display text-4xl md:text-5xl text-primary">Ask Vidyā</h1>
            <p className="mt-3 text-muted-foreground">
              Every answer cites the FAQ entries it came from. No hallucination — only what's in
              the knowledge base.
            </p>
          </div>

          <form onSubmit={submit} className="mt-8 paper-card rounded-xl p-4">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What do you want to know?"
              rows={3}
              className="border-0 bg-transparent focus-visible:ring-0 text-base resize-none"
            />
            <div className="flex justify-between items-center pt-2 border-t border-border/60">
              <div className="text-xs text-muted-foreground">Powered by semantic search + Gemini</div>
              <Button type="submit" variant="ornate" disabled={mut.isPending || question.trim().length < 3}>
                {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {mut.isPending ? "Thinking…" : "Ask"}
              </Button>
            </div>
          </form>

          {mut.error && (
            <div className="mt-6 text-sm text-destructive">Something went wrong. Try again.</div>
          )}

          {mut.data && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 paper-card rounded-xl p-6"
            >
              <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Answer</div>
              <div className="mt-3 font-serif text-lg leading-relaxed whitespace-pre-wrap text-foreground/90">
                {mut.data.answer}
              </div>

              {mut.data.sources && mut.data.sources.length > 0 && (
                <div className="mt-8">
                  <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Sources</div>
                  <div className="mt-3 space-y-2">
                    {mut.data.sources.map((s: { id: string; question: string; similarity: number }, i: number) => (
                      <Link
                        key={s.id}
                        to="/faq/$id"
                        params={{ id: s.id }}
                        className="flex items-baseline gap-3 text-sm hover:text-plum text-primary/90 border-b border-border/50 pb-2 last:border-0"
                      >
                        <span className="font-display text-gold text-lg leading-none">[{i + 1}]</span>
                        <span className="flex-1">{s.question}</span>
                        <span className="text-xs text-muted-foreground">
                          {(s.similarity * 100).toFixed(0)}%
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </Container>
      <SiteFooter />
    </div>
  );
}
