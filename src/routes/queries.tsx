import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, HelpCircle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { SiteHeader, SiteFooter, Container } from "@/components/site";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { listRecentQueries, submitQuery } from "@/lib/faq.functions";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";

const opts = queryOptions({ queryKey: ["recentQueries"], queryFn: () => listRecentQueries() });

export const Route = createFileRoute("/queries")({
  head: () => ({
    meta: [
      { title: "Community queries — Vidyā" },
      { name: "description", content: "See questions the community has raised and their admin answers." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: QueriesPage,
});

function QueriesPage() {
  const { data: queries } = useSuspenseQuery(opts);
  const qc = useQueryClient();
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [q, setQ] = useState("");
  const [hint, setHint] = useState("");
  const submitFn = useServerFn(submitQuery);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ? { id: data.user.id } : null));
    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => setUser(s?.user ? { id: s.user.id } : null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const mut = useMutation({
    mutationFn: () => submitFn({ data: { question: q, category_hint: hint || undefined } }),
    onSuccess: () => {
      toast.success("Query submitted");
      setQ("");
      setHint("");
      qc.invalidateQueries({ queryKey: ["recentQueries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Container className="py-12">
        <div className="grid lg:grid-cols-[1fr_360px] gap-10">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Community</div>
            <h1 className="font-display text-4xl md:text-5xl text-primary mt-2">Recent queries</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Questions the community has raised. Once an admin answers, the reply becomes part of the FAQ.
            </p>

            <div className="mt-8 space-y-3">
              {queries.length === 0 && (
                <div className="paper-card rounded-xl p-6 text-sm text-muted-foreground">
                  No queries yet. Be the first to ask.
                </div>
              )}
              {queries.map((qu) => (
                <div key={qu.id} className="paper-card rounded-xl p-5">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {qu.status === "answered" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 px-2 py-0.5">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Answered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 px-2 py-0.5">
                        <Clock className="h-2.5 w-2.5" /> {qu.status}
                      </span>
                    )}
                    {qu.category_hint && <span>{qu.category_hint}</span>}
                    <span className="ml-auto">
                      {formatDistanceToNow(new Date(qu.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="mt-2 font-display text-lg text-primary">{qu.question}</div>
                  {qu.admin_answer && (
                    <div className="mt-3 text-sm text-foreground/85 border-l-2 border-gold pl-4 whitespace-pre-wrap">
                      {qu.admin_answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <aside>
            <div className="paper-card rounded-xl p-5 sticky top-24">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                <HelpCircle className="h-3 w-3 text-gold" /> Raise a query
              </div>
              {user ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (q.trim().length < 10) return toast.error("Question is too short");
                    mut.mutate();
                  }}
                  className="mt-4 space-y-3"
                >
                  <Textarea
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Describe your question…"
                    rows={5}
                  />
                  <Input
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    placeholder="Topic (optional) — e.g. NOC, Rosetta"
                  />
                  <Button variant="ornate" type="submit" disabled={mut.isPending} className="w-full">
                    {mut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Submit
                  </Button>
                </form>
              ) : (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground">Sign in to raise a query.</p>
                  <Button asChild variant="ornate" size="sm" className="mt-3 w-full">
                    <Link to="/auth">Sign in</Link>
                  </Button>
                </div>
              )}
            </div>
          </aside>
        </div>
      </Container>
      <SiteFooter />
    </div>
  );
}
