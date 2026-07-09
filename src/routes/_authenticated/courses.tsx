import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen } from "lucide-react";

import { SiteHeader, SiteFooter, Container } from "@/components/site";
import { listPublishedCourses, myEnrollments } from "@/lib/learning.functions";

export const Route = createFileRoute("/_authenticated/courses")({
  head: () => ({ meta: [{ title: "Courses — Vidyā" }, { name: "robots", content: "noindex" }] }),
  component: CoursesPage,
});

function CoursesPage() {
  const listFn = useServerFn(listPublishedCourses);
  const enrolFn = useServerFn(myEnrollments);
  const courses = useQuery({ queryKey: ["publishedCourses"], queryFn: () => listFn() });
  const enrolled = useQuery({ queryKey: ["myEnrollments"], queryFn: () => enrolFn() });
  const enrolledIds = new Set((enrolled.data ?? []).map((e) => e.courses?.id).filter(Boolean));

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Container className="py-12">
        <DashboardNav active="courses" />
        <div className="mt-8">
          <h1 className="font-display text-4xl text-primary flex items-center gap-3">
            <BookOpen className="h-7 w-7" /> Courses
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Enroll in a course to build a structured learning path.
          </p>
        </div>

        {courses.isLoading ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-40 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : !courses.data?.length ? (
          <div className="mt-12 paper-card rounded-xl p-12 text-center text-sm text-muted-foreground">
            No courses have been published yet. Check back soon.
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.data.map((c) => (
              <Link
                key={c.id}
                to="/courses/$id"
                params={{ id: c.id }}
                className="paper-card rounded-xl overflow-hidden hover:border-primary/40 transition-colors group"
              >
                {c.cover_url ? (
                  <img
                    src={c.cover_url}
                    alt={c.title}
                    className="h-32 w-full object-cover group-hover:scale-[1.02] transition-transform"
                  />
                ) : (
                  <div className="h-32 bg-gradient-to-br from-primary/20 to-amber-500/10" />
                )}
                <div className="p-5">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {enrolledIds.has(c.id) && (
                      <span className="rounded-full bg-emerald-500/10 text-emerald-700 px-2 py-0.5">
                        Enrolled
                      </span>
                    )}
                  </div>
                  <h3 className="font-display text-lg text-primary mt-1 leading-snug">{c.title}</h3>
                  {c.description && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{c.description}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Container>
      <SiteFooter />
    </div>
  );
}

export function DashboardNav({ active }: { active: "dashboard" | "courses" | "enrollments" | "timeline" }) {
  const items: { key: typeof active; label: string; to: string }[] = [
    { key: "dashboard", label: "Overview", to: "/dashboard" },
    { key: "courses", label: "Courses", to: "/courses" },
    { key: "enrollments", label: "My Enrollments", to: "/enrollments" },
    { key: "timeline", label: "Timeline", to: "/timeline" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <Link
          key={it.key}
          to={it.to}
          className={`text-xs uppercase tracking-wider px-3 py-1.5 rounded-full border transition-colors ${
            active === it.key
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:border-primary/40"
          }`}
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}
