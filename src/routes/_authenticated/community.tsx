import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MessageSquare, Plus, ThumbsUp, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { SiteHeader, SiteFooter, Container } from "@/components/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  listCommunityPosts, createCommunityPost, voteCommunityPost, deleteCommunityPost,
} from "@/lib/community.functions";

export const Route = createFileRoute("/_authenticated/community")({
  head: () => ({ meta: [{ title: "Community — Vidyā" }, { name: "robots", content: "noindex" }] }),
  component: CommunityPage,
});

function CommunityPage() {
  const listFn = useServerFn(listCommunityPosts);
  const createFn = useServerFn(createCommunityPost);
  const voteFn = useServerFn(voteCommunityPost);
  const delFn = useServerFn(deleteCommunityPost);
  const qc = useQueryClient();

  const posts = useQuery({ queryKey: ["communityPosts"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("discussion");

  const create = useMutation({
    mutationFn: () => createFn({ data: { title, body, kind } }),
    onSuccess: () => {
      toast.success("Posted");
      setOpen(false); setTitle(""); setBody("");
      qc.invalidateQueries({ queryKey: ["communityPosts"] });
    },
  });
  const vote = useMutation({
    mutationFn: (p: { post_id: string; value: 1 | -1 | 0 }) => voteFn({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["communityPosts"] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["communityPosts"] }); },
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Container className="py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-4xl text-primary flex items-center gap-3">
              <MessageSquare className="h-7 w-7" /> Community
            </h1>
            <p className="text-sm text-muted-foreground mt-2">Discuss, ask, and share with peers.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="ornate"><Plus className="h-4 w-4 mr-1" /> New post</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New community post</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <select value={kind} onChange={(e) => setKind(e.target.value)} className="w-full h-9 px-2 border rounded-md text-sm bg-background">
                  <option value="discussion">Discussion</option>
                  <option value="question">Question</option>
                  <option value="announcement">Announcement</option>
                </select>
                <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
                <Textarea rows={6} placeholder="Write something…" value={body} onChange={(e) => setBody(e.target.value)} />
                <Button variant="ornate" disabled={!title.trim() || !body.trim() || create.isPending} onClick={() => create.mutate()}>
                  Publish
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {posts.isLoading ? (
          <div className="text-muted-foreground text-sm">Loading…</div>
        ) : !posts.data?.length ? (
          <div className="paper-card rounded-xl p-12 text-center text-sm text-muted-foreground">
            No posts yet. Be the first to start a discussion.
          </div>
        ) : (
          <ul className="space-y-3">
            {posts.data.map((p: any) => (
              <li key={p.id} className="paper-card rounded-xl p-5 flex gap-4">
                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => vote.mutate({ post_id: p.id, value: 1 })} className="p-1 rounded hover:bg-muted">
                    <ThumbsUp className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-medium">{p.upvotes ?? 0}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5">{p.kind}</span>
                    <span>{formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</span>
                    {p.profiles?.full_name && <span>· {p.profiles.full_name}</span>}
                  </div>
                  <h3 className="font-display text-lg text-primary mt-1">{p.title}</h3>
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-3 whitespace-pre-wrap">{p.body}</p>
                  <div className="mt-3 text-xs text-muted-foreground flex items-center gap-4">
                    <span>{p.comment_count ?? 0} comments</span>
                    <button onClick={() => del.mutate(p.id)} className="inline-flex items-center gap-1 hover:text-destructive">
                      <Trash2 className="h-3 w-3" /> delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 text-xs text-muted-foreground">
          <Link to="/support" className="underline">Need help? Open a support request →</Link>
        </div>
      </Container>
      <SiteFooter />
    </div>
  );
}
