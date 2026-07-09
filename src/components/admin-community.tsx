import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { EyeOff, Eye, Trash2, Reply } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  listCommunityPosts, deleteCommunityPost, adminHidePost,
  adminListSupportRequests, adminRespondSupport,
} from "@/lib/community.functions";

export function AdminCommunityTab() {
  const listFn = useServerFn(listCommunityPosts);
  const delFn = useServerFn(deleteCommunityPost);
  const hideFn = useServerFn(adminHidePost);
  const qc = useQueryClient();

  const posts = useQuery({ queryKey: ["adminCommunityPosts"], queryFn: () => listFn() });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["adminCommunityPosts"] }); },
  });
  const hide = useMutation({
    mutationFn: (v: { id: string; hidden: boolean }) => hideFn({ data: v }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["adminCommunityPosts"] }); },
  });

  if (posts.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!posts.data?.length) return <div className="paper-card rounded-xl p-8 text-center text-sm text-muted-foreground">No community posts yet.</div>;

  return (
    <div className="space-y-3">
      {posts.data.map((p: any) => (
        <div key={p.id} className="paper-card rounded-xl p-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5">{p.kind}</span>
              <span>{formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</span>
              {p.profiles?.full_name && <span>· {p.profiles.full_name}</span>}
              <span>· {p.upvotes ?? 0} upvotes · {p.comment_count ?? 0} comments</span>
            </div>
            <div className="font-display text-primary mt-1">{p.title}</div>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{p.body}</p>
          </div>
          <div className="flex flex-col gap-1">
            <Button size="sm" variant="outline" onClick={() => hide.mutate({ id: p.id, hidden: true })}>
              <EyeOff className="h-3 w-3 mr-1" /> Hide
            </Button>
            <Button size="sm" variant="outline" onClick={() => hide.mutate({ id: p.id, hidden: false })}>
              <Eye className="h-3 w-3 mr-1" /> Show
            </Button>
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => del.mutate(p.id)}>
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminSupportTab() {
  const listFn = useServerFn(adminListSupportRequests);
  const respFn = useServerFn(adminRespondSupport);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["adminSupport"], queryFn: () => listFn() });
  const [filter, setFilter] = useState<string>("open");

  if (list.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const rows = (list.data ?? []).filter((r: any) => filter === "all" || r.status === filter);

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {["open", "resolved", "closed", "all"].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1 text-xs rounded-full ${filter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {s}
          </button>
        ))}
      </div>
      {!rows.length ? (
        <div className="paper-card rounded-xl p-8 text-center text-sm text-muted-foreground">No requests match.</div>
      ) : rows.map((r: any) => (
        <SupportRow key={r.id} r={r} respond={(response, status) => respFn({ data: { id: r.id, response, status } }).then(() => {
          toast.success("Response sent"); qc.invalidateQueries({ queryKey: ["adminSupport"] });
        })} />
      ))}
    </div>
  );
}

function SupportRow({ r, respond }: { r: any; respond: (response: string, status?: string) => Promise<any> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(r.admin_response ?? "");
  const [status, setStatus] = useState<string>("resolved");
  return (
    <div className="paper-card rounded-xl p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5">{r.status}</span>
        <span className="rounded-full bg-muted px-2 py-0.5">{r.priority}</span>
        {r.support_categories?.name && <span>· {r.support_categories.name}</span>}
        <span>· {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
        {r.profiles?.full_name && <span>· by {r.profiles.full_name}</span>}
      </div>
      <div className="font-display text-primary mt-1">{r.subject}</div>
      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{r.body}</p>
      {r.admin_response && (
        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm whitespace-pre-wrap">
          <div className="text-[10px] uppercase tracking-wider text-primary mb-1">Current response</div>
          {r.admin_response}
        </div>
      )}
      <div className="mt-3">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="ornate"><Reply className="h-3 w-3 mr-1" /> Respond</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Respond to request</DialogTitle></DialogHeader>
            <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your response…" />
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 px-2 border rounded-md text-sm bg-background">
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <Button variant="ornate" disabled={!text.trim()} onClick={async () => { await respond(text, status); setOpen(false); }}>
              Send response
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
