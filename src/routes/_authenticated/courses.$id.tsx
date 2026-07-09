import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";

import { SiteHeader, SiteFooter, Container } from "@/components/site";
import { Button } from "@/components/ui/button";
import {
  getCourseDetail,
  enrollInCourse,
  unenrollFromCourse,
  toggleModuleComplete,
} from "@/lib/learning.functions";

export const Route = createFileRoute("/_authenticated/courses/$id")({
  head: () => ({ meta: [{ title: "Course — Vidyā" }, { name: "robots", content: "noindex" }] }),
  component: CourseDetail,
});

function CourseDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const detailFn = useServerFn(getCourseDetail);
  const enrollFn = useServerFn(enrollInCourse);
  const unenrollFn = useServerFn(unenrollFromCourse);
  const toggleFn = useServerFn(toggleModuleComplete);

  const detail = useQuery({
    queryKey: ["courseDetail", id],
    queryFn: () => detailFn({ data: { id } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["courseDetail", id] });
    qc.invalidateQueries({ queryKey: ["myEnrollments"] });
    qc.invalidateQueries({ queryKey: ["myTimeline"] });
  };

  const enroll = useMutation({
    mutationFn: () => enrollFn({ data: { courseId: id } }),
    onSuccess: () => {
      toast.success("Enrolled!");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const unenroll = useMutation({
    mutationFn: () => unenrollFn({ data: { courseId: id } }),
    onSuccess: () => {
      toast.success("Unenrolled");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (v: { moduleId: string; completed: boolean }) =>
      toggleFn({ data: v }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  if (detail.isLoading) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <Container className="py-12">
          <div className="h-48 rounded-xl bg-muted/40 animate-pulse" />
        </Container>
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <Container className="py-12">
          <div className="paper-card rounded-xl p-12 text-center">
            <p className="text-sm text-muted-foreground">Course not found.</p>
            <Button className="mt-4" onClick={() => navigate({ to: "/courses" })}>
              Back to courses
            </Button>
          </div>
        </Container>
      </div>
    );
  }

  const { course, modules, enrollment, completedModuleIds } = detail.data;
  const completedSet = new Set(completedModuleIds);
  const isEnrolled = !!enrollment;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Container className="py-10">
        <Link to="/courses" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> All courses
        </Link>

        <div className="mt-6 paper-card rounded-2xl overflow-hidden">
          {course.cover_url && (
            <img src={course.cover_url} alt={course.title} className="w-full h-56 object-cover" />
          )}
          <div className="p-6 md:p-8">
            <h1 className="font-display text-4xl text-primary">{course.title}</h1>
            {course.description && (
              <p className="text-sm text-foreground/80 mt-3 whitespace-pre-wrap">{course.description}</p>
            )}
            <div className="mt-6 flex items-center gap-3 flex-wrap">
              {!isEnrolled ? (
                <Button onClick={() => enroll.mutate()} disabled={enroll.isPending}>
                  {enroll.isPending ? "Enrolling…" : "Enroll"}
                </Button>
              ) : (
                <>
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Progress</span>
                      <span>{enrollment.progress_pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${enrollment.progress_pct}%` }}
                      />
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => unenroll.mutate()} disabled={unenroll.isPending}>
                    Unenroll
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="font-display text-2xl text-primary mb-4">Modules</h2>
          {!modules.length ? (
            <div className="paper-card rounded-xl p-8 text-center text-sm text-muted-foreground">
              No modules yet.
            </div>
          ) : (
            <div className="space-y-3">
              {modules.map((m, i) => {
                const done = completedSet.has(m.id);
                return (
                  <div key={m.id} className="paper-card rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <button
                        disabled={!isEnrolled || toggle.isPending}
                        onClick={() =>
                          toggle.mutate({ moduleId: m.id, completed: !done })
                        }
                        className="mt-0.5 shrink-0"
                        aria-label={done ? "Mark incomplete" : "Mark complete"}
                      >
                        {done ? (
                          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                        ) : (
                          <Circle className="h-6 w-6 text-muted-foreground" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Module {i + 1}
                        </div>
                        <h3 className="font-display text-lg text-primary leading-snug">
                          {m.title}
                        </h3>
                        {m.content && (
                          <p className="text-sm text-foreground/80 mt-2 whitespace-pre-wrap">{m.content}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!isEnrolled && (
            <p className="mt-4 text-xs text-center text-muted-foreground">
              Enroll to track your progress through the modules.
            </p>
          )}
        </div>
      </Container>
      <SiteFooter />
    </div>
  );
}
