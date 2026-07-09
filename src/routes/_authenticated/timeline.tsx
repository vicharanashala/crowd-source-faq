import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { Activity, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SiteHeader, SiteFooter, Container } from "@/components/site";
import { myTimeline, deleteTimelineEvent } from "@/lib/learning.functions";
import { DashboardNav } from "./courses";

export const Route = createFileRoute("/_authenticated/timeline")({
  head: () => ({ meta: [{ title: "Timeline — Vidyā" }, { name: "robots", content: "noindex" }] }),
  component: TimelinePage,
});

function TimelinePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(myTimeline);
  const delFn = useServerFn(deleteTimelineEvent);
  const q = useQuery({ queryKey: ["myTimeline"], queryFn: () => listFn() });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myTimeline"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Container className="py-12">
        <DashboardNav active="timeline" />
        <div className="mt-8">
          <h1 className="font-display text-4xl text-primary flex items-center gap-3">
            <Activity className="h-7 w-7" /> Activity Timeline
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Your enrollments, completions and other activity.
          </p>
        </div>

        {q.isLoading ? (
          <div className="mt-8 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : !q.data?.length ? (
          <div className="mt-12 paper-card rounded-xl p-12 text-center text-sm text-muted-foreground">
            Nothing here yet — start browsing courses or asking questions.
          </div>
        ) : (
          <ol className="mt-8 relative border-l border-border pl-6 space-y-4">
            {q.data.map((ev) => (
              <li key={ev.id} className="relative">
                <span className="absolute -left-[29px] top-2 h-3 w-3 rounded-full bg-primary" />
                <div className="paper-card rounded-xl p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5">
                        {ev.kind.replace(/_/g, " ")}
                      </span>
                      <span>{formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}</span>
                    </div>
                    <p className="text-sm font-medium text-foreground mt-1">{ev.title}</p>
                    {ev.body && (
                      <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{ev.body}</p>
                    )}
                    {ev.link && (
                      <a
                        href={ev.link}
                        className="text-xs text-primary hover:underline mt-1 inline-block"
                      >
                        View →
                      </a>
                    )}
                  </div>
                  <button
                    className="text-muted-foreground hover:text-rose-600"
                    onClick={() => del.mutate(ev.id)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Container>
      <SiteFooter />
    </div>
  );
}
