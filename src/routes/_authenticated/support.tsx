import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { LifeBuoy, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

import { SiteHeader, SiteFooter, Container } from "@/components/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  listSupportCategories, mySupportRequests, createSupportRequest, closeMySupportRequest,
} from "@/lib/community.functions";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({ meta: [{ title: "Support — Vidyā" }, { name: "robots", content: "noindex" }] }),
  component: SupportPage,
});

function SupportPage() {
  const catsFn = useServerFn(listSupportCategories);
  const listFn = useServerFn(mySupportRequests);
  const createFn = useServerFn(createSupportRequest);
  const closeFn = useServerFn(closeMySupportRequest);
  const qc = useQueryClient();

  const cats = useQuery({ queryKey: ["supportCats"], queryFn: () => catsFn() });
  const mine = useQuery({ queryKey: ["mySupport"], queryFn: () => listFn() });

  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [categoryId, setCategoryId] = useState<string>("");

  const create = useMutation({
    mutationFn: () => createFn({ data: { subject, body, priority, category_id: categoryId || null } }),
    onSuccess: () => {
      toast.success("Request sent");
      setOpen(false); setSubject(""); setBody("");
      qc.invalidateQueries({ queryKey: ["mySupport"] });
    },
  });
  const close = useMutation({
    mutationFn: (id: string) => closeFn({ data: { id } }),
    onSuccess: () => { toast.success("Closed"); qc.invalidateQueries({ queryKey: ["mySupport"] }); },
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Container className="py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-4xl text-primary flex items-center gap-3">
              <LifeBuoy className="h-7 w-7" /> Support
            </h1>
            <p className="text-sm text-muted-foreground mt-2">Contact admins about accounts, content, or bugs.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="ornate"><Plus className="h-4 w-4 mr-1" /> New request</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Open a support request</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-9 px-2 border rounded-md text-sm bg-background">
                    <option value="">— Category —</option>
                    {(cats.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-9 px-2 border rounded-md text-sm bg-background">
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <Textarea rows={6} placeholder="Describe the issue…" value={body} onChange={(e) => setBody(e.target.value)} />
                <Button variant="ornate" disabled={!subject.trim() || !body.trim() || create.isPending} onClick={() => create.mutate()}>
                  Submit
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {mine.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !mine.data?.length ? (
          <div className="paper-card rounded-xl p-12 text-center text-sm text-muted-foreground">
            You have not opened any requests.
          </div>
        ) : (
          <ul className="space-y-3">
            {mine.data.map((r: any) => (
              <li key={r.id} className="paper-card rounded-xl p-5">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5">{r.status}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5">{r.priority}</span>
                  {r.support_categories?.name && <span>· {r.support_categories.name}</span>}
                  <span>· {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                </div>
                <h3 className="font-display text-lg text-primary mt-1">{r.subject}</h3>
                <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{r.body}</p>
                {r.admin_response && (
                  <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-primary mb-1">Admin response</div>
                    <p className="text-sm whitespace-pre-wrap">{r.admin_response}</p>
                  </div>
                )}
                {r.status !== "closed" && (
                  <div className="mt-3">
                    <Button size="sm" variant="outline" onClick={() => close.mutate(r.id)}>Close request</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Container>
      <SiteFooter />
    </div>
  );
}
