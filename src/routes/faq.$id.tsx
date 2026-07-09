import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ThumbsUp, ThumbsDown, ArrowLeft, Sparkles, Bookmark, BookmarkCheck, MessageSquare, Trash2, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { SiteHeader, SiteFooter, Container } from "@/components/site";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  getFaq,
  getMyVote,
  semanticSearch,
  trackView,
  voteFaq,
  toggleBookmark,
  isBookmarked,
  listFaqComments,
  addFaqComment,
  deleteFaqComment,
} from "@/lib/faq.functions";
import { supabase } from "@/integrations/supabase/client";

const faqOpts = (id: string) => queryOptions({ queryKey: ["faq", id], queryFn: () => getFaq({ data: { id } }) });

export const Route = createFileRoute("/faq/$id")({
  loader: async ({ context, params }) => {
    const f = await context.queryClient.ensureQueryData(faqOpts(params.id));
    if (!f) throw notFound();
    return f;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.question} — Vidyā` },
          { name: "description", content: loaderData.answer.slice(0, 155) },
          { property: "og:title", content: loaderData.question },
          { property: "og:description", content: loaderData.answer.slice(0, 155) },
        ]
      : [{ title: "FAQ — Vidyā" }, { name: "robots", content: "noindex" }],
  }),
  notFoundComponent: () => (
    <div className="min-h-screen">
      <SiteHeader />
      <Container className="py-24 text-center">
        <h1 className="font-display text-3xl text-primary">This entry doesn't exist</h1>
        <Button asChild variant="ornate" className="mt-6"><Link to="/browse">Back to browse</Link></Button>
      </Container>
    </div>
  ),
  component: FaqPage,
});

function FaqPage() {
  const { id } = Route.useParams();
  const { data: faq } = useSuspenseQuery(faqOpts(id));
  const [user, setUser] = useState<{ id: string } | null>(null);

  const trackViewFn = useServerFn(trackView);
  const voteFn = useServerFn(voteFaq);
  const myVoteFn = useServerFn(getMyVote);
  const searchFn = useServerFn(semanticSearch);

  useEffect(() => {
    trackViewFn({ data: { faqId: id } }).catch(() => {});
    supabase.auth.getUser().then(({ data }) => setUser(data.user ? { id: data.user.id } : null));
  }, [id, trackViewFn]);

  const qc = useQueryClient();
  const myVoteQ = useQuery({
    queryKey: ["myVote", id, user?.id],
    queryFn: () => myVoteFn({ data: { faqId: id } }),
    enabled: !!user,
  });

  const mutate = useMutation({
    mutationFn: (value: 1 | -1 | 0) => voteFn({ data: { faqId: id, value } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faq", id] });
      qc.invalidateQueries({ queryKey: ["myVote", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const similar = useQuery({
    queryKey: ["similar", id, faq?.question],
    queryFn: () => searchFn({ data: { query: `${faq!.question}\n${faq!.answer.slice(0, 300)}`, k: 5 } }),
    enabled: !!faq,
    staleTime: 60_000,
  });

  if (!faq) return null;
  const myVote = myVoteQ.data ?? 0;
  const similarItems = (similar.data ?? []).filter((s: { id: string }) => s.id !== id).slice(0, 4);

  function toggleVote(v: 1 | -1) {
    if (!user) {
      toast.info("Sign in to vote");
      return;
    }
    mutate.mutate(myVote === v ? 0 : v);
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Container className="py-12">
        <Link to="/browse" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-3 w-3" /> Back to browse
        </Link>

        <article className="mt-6 grid lg:grid-cols-[1fr_280px] gap-10">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              {faq.categories?.name}
            </div>
            <h1 className="mt-3 font-display text-3xl md:text-5xl leading-tight text-primary">
              {faq.question}
            </h1>
            <div className="ornate-divider my-6" />
            <div className="prose prose-neutral max-w-none text-foreground/90 whitespace-pre-wrap font-serif text-lg leading-relaxed">
              {faq.answer}
            </div>

            <div className="mt-10 flex items-center gap-3 flex-wrap">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Was this helpful?</div>
              <Button
                variant={myVote === 1 ? "ornate" : "outline"}
                size="sm"
                onClick={() => toggleVote(1)}
                disabled={mutate.isPending}
              >
                <ThumbsUp className="h-3 w-3" /> {faq.upvotes}
              </Button>
              <Button
                variant={myVote === -1 ? "destructive" : "outline"}
                size="sm"
                onClick={() => toggleVote(-1)}
                disabled={mutate.isPending}
              >
                <ThumbsDown className="h-3 w-3" /> {faq.downvotes}
              </Button>
              <BookmarkButton faqId={id} user={user} />
              <span className="text-xs text-muted-foreground ml-auto">{faq.view_count} views</span>
            </div>

            <CommentsSection faqId={id} user={user} />
          </div>

          <aside className="space-y-6">
            <div className="paper-card rounded-xl p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-gold" /> Similar questions
              </div>
              <div className="mt-3 space-y-2">
                {similar.isLoading && <div className="text-sm text-muted-foreground">Finding…</div>}
                {similarItems.length === 0 && !similar.isLoading && (
                  <div className="text-sm text-muted-foreground">Nothing similar yet.</div>
                )}
                {similarItems.map((s: { id: string; question: string }) => (
                  <Link
                    key={s.id}
                    to="/faq/$id"
                    params={{ id: s.id }}
                    className="block text-sm hover:text-plum text-primary/90 border-b border-border/50 pb-2 last:border-0"
                  >
                    {s.question}
                  </Link>
                ))}
              </div>
            </div>

            <div className="paper-card rounded-xl p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Still stuck?</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask the AI for a grounded answer or raise a query for a human reply.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <Button asChild variant="ornate" size="sm"><Link to="/ask">Ask AI</Link></Button>
                <Button asChild variant="outline" size="sm"><Link to="/queries">Raise a query</Link></Button>
              </div>
            </div>
          </aside>
        </article>
      </Container>
      <SiteFooter />
    </div>
  );
}

function BookmarkButton({ faqId, user }: { faqId: string; user: { id: string } | null }) {
  const qc = useQueryClient();
  const toggleFn = useServerFn(toggleBookmark);
  const isFn = useServerFn(isBookmarked);
  const q = useQuery({
    queryKey: ["bookmark", faqId, user?.id],
    queryFn: () => isFn({ data: { faqId } }),
    enabled: !!user,
  });
  const m = useMutation({
    mutationFn: () => toggleFn({ data: { faqId } }),
    onSuccess: (r) => {
      qc.setQueryData(["bookmark", faqId, user?.id], r.bookmarked);
      qc.invalidateQueries({ queryKey: ["myBookmarks"] });
      toast.success(r.bookmarked ? "Bookmarked" : "Removed bookmark");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const on = !!q.data;
  return (
    <Button
      variant={on ? "ornate" : "outline"}
      size="sm"
      disabled={m.isPending}
      onClick={() => {
        if (!user) return toast.info("Sign in to bookmark");
        m.mutate();
      }}
    >
      {on ? <BookmarkCheck className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
      {on ? "Saved" : "Save"}
    </Button>
  );
}

function CommentsSection({ faqId, user }: { faqId: string; user: { id: string } | null }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listFaqComments);
  const addFn = useServerFn(addFaqComment);
  const delFn = useServerFn(deleteFaqComment);
  const [body, setBody] = useState("");
  const key = ["faqComments", faqId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => listFn({ data: { faqId } }),
    enabled: !!user,
  });
  const add = useMutation({
    mutationFn: (b: string) => addFn({ data: { faqId, body: b } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
        <MessageSquare className="h-3.5 w-3.5 text-primary" /> Discussion
        {q.data && <span className="ml-1 normal-case tracking-normal">({q.data.length})</span>}
      </div>

      {!user ? (
        <div className="paper-card rounded-xl p-6 text-center text-sm text-muted-foreground">
          <Link to="/auth" className="text-primary hover:underline">Sign in</Link> to join the discussion.
        </div>
      ) : (
        <>
          <div className="paper-card rounded-xl p-4 mb-6">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Share your thoughts, an additional example, or a follow-up question…"
              maxLength={2000}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">{body.length}/2000</span>
              <Button
                size="sm"
                variant="ornate"
                disabled={!body.trim() || add.isPending}
                onClick={() => add.mutate(body.trim())}
              >
                <Send className="h-3 w-3" /> {add.isPending ? "Posting…" : "Post"}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {q.isLoading && <div className="text-sm text-muted-foreground">Loading comments…</div>}
            {!q.isLoading && !q.data?.length && (
              <div className="text-sm text-muted-foreground italic">Be the first to comment.</div>
            )}
            {q.data?.map((c) => {
              const initials = (c.author.full_name ?? "U").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
              return (
                <div key={c.id} className="flex gap-3">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={c.author.avatar_url ?? undefined} />
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 paper-card rounded-xl p-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-foreground">{c.author.full_name ?? "Anonymous"}</span>
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </span>
                      {c.user_id === user.id && (
                        <button
                          className="ml-auto text-muted-foreground hover:text-rose-600"
                          onClick={() => del.mutate(c.id)}
                          disabled={del.isPending}
                          aria-label="Delete comment"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-foreground/90 whitespace-pre-wrap">{c.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

