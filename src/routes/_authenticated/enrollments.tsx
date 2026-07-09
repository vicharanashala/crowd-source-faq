import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { GraduationCap } from "lucide-react";

import { SiteHeader, SiteFooter, Container } from "@/components/site";
import { myEnrollments } from "@/lib/learning.functions";
import { DashboardNav } from "./courses";

export const Route = createFileRoute("/_authenticated/enrollments")({
  head: () => ({ meta: [{ title: "My Enrollments — Vidyā" }, { name: "robots", content: "noindex" }] }),
  component: EnrollmentsPage,
});

function EnrollmentsPage() {
  const listFn = useServerFn(myEnrollments);
  const q = useQuery({ queryKey: ["myEnrollments"], queryFn: () => listFn() });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Container className="py-12">
        <DashboardNav active="enrollments" />
        <div className="mt-8">
          <h1 className="font-display text-4xl text-primary flex items-center gap-3">
            <GraduationCap className="h-7 w-7" /> My Enrollments
          </h1>
        </div>

        {q.isLoading ? (
          <div className="mt-8 space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-32 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : !q.data?.length ? (
          <div className="mt-12 paper-card rounded-xl p-12 text-center">
            <p className="text-sm text-muted-foreground">
              You haven't enrolled in any course yet.
            </p>
            <Link
              to="/courses"
              className="inline-block mt-4 text-sm text-primary hover:underline"
            >
              Browse courses →
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {q.data.map((e) => {
              const c = e.courses;
              if (!c) return null;
              return (
                <Link
                  key={e.id}
                  to="/courses/$id"
                  params={{ id: c.id }}
                  className="paper-card rounded-xl p-5 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {e.status === "completed" ? (
                      <span className="rounded-full bg-emerald-500/10 text-emerald-700 px-2 py-0.5">
                        Completed
                      </span>
                    ) : (
                      <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5">
                        In progress
                      </span>
                    )}
                    <span className="ml-auto">
                      Enrolled {formatDistanceToNow(new Date(e.enrolled_at), { addSuffix: true })}
                    </span>
                  </div>
                  <h3 className="font-display text-lg text-primary mt-2">{c.title}</h3>
                  {c.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>
                  )}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Progress</span>
                      <span>{e.progress_pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${e.progress_pct}%` }}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Container>
      <SiteFooter />
    </div>
  );
}
