import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useState } from "react";
import { Flame, ChevronRight } from "lucide-react";

import { SiteHeader, SiteFooter, Container } from "@/components/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listCategories, listFaqs } from "@/lib/faq.functions";

const searchSchema = z.object({
  cat: z.string().optional(),
  sort: z.enum(["priority", "recent", "top"]).optional(),
});

const catsOpts = queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() });
const faqsOpts = (cat?: string, sort: "priority" | "recent" | "top" = "priority") =>
  queryOptions({
    queryKey: ["faqs", cat ?? "all", sort],
    queryFn: () => listFaqs({ data: { categorySlug: cat, sort } }),
  });

export const Route = createFileRoute("/browse")({
  head: () => ({
    meta: [
      { title: "Browse FAQs — Vidyā" },
      { name: "description", content: "Browse the full Vicharanashala Internship knowledge base by topic and priority." },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(catsOpts),
      context.queryClient.ensureQueryData(faqsOpts(deps.cat, deps.sort)),
    ]),
  component: Browse,
});

function priorityBand(score: number): { color: string; label: string } {
  if (score >= 3) return { color: "bg-red-500", label: "Critical" };
  if (score >= 1.5) return { color: "bg-orange-500", label: "High" };
  if (score >= 0.5) return { color: "bg-amber-400", label: "Medium" };
  return { color: "bg-emerald-500", label: "Low" };
}

function Browse() {
  const { cat, sort = "priority" } = Route.useSearch();
  const nav = Route.useNavigate();
  const { data: cats } = useSuspenseQuery(catsOpts);
  const { data: faqs } = useSuspenseQuery(faqsOpts(cat, sort));
  const [filter, setFilter] = useState("");

  const filtered = filter
    ? faqs.filter((f) => f.question.toLowerCase().includes(filter.toLowerCase()))
    : faqs;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Container className="py-12">
        <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Knowledge base</div>
        <h1 className="font-display text-4xl md:text-5xl text-primary mt-2">Browse the FAQs</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Filter by chapter, sort by priority, or search titles. Priority is calculated from views,
          searches, and community feedback — the most needed answers rise to the top.
        </p>

        <div className="mt-6 flex flex-col md:flex-row gap-3">
          <Input
            placeholder="Filter questions…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="md:max-w-sm"
          />
          <div className="flex gap-2 flex-wrap">
            {(["priority", "recent", "top"] as const).map((s) => (
              <Button
                key={s}
                variant={sort === s ? "ornate" : "outline"}
                size="sm"
                onClick={() => nav({ search: { cat, sort: s } })}
              >
                {s === "priority" ? "Priority" : s === "recent" ? "Recent" : "Top voted"}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-8 grid lg:grid-cols-[240px_1fr] gap-8">
          {/* sidebar */}
          <aside className="space-y-1">
            <button
              onClick={() => nav({ search: { cat: undefined, sort } })}
              className={`w-full text-left rounded-md px-3 py-2 text-sm ${
                !cat ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              All chapters
            </button>
            {cats.map((c) => (
              <button
                key={c.id}
                onClick={() => nav({ search: { cat: c.slug, sort } })}
                className={`w-full text-left rounded-md px-3 py-2 text-sm truncate ${
                  cat === c.slug ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {c.name}
              </button>
            ))}
          </aside>

          {/* list */}
          <div className="space-y-3">
            {filtered.length === 0 && (
              <div className="paper-card rounded-xl p-6 text-sm text-muted-foreground">
                Nothing matches this filter.
              </div>
            )}
            {filtered.map((f) => {
              const p = priorityBand(f.priority_score ?? 0);
              return (
                <Link
                  key={f.id}
                  to="/faq/$id"
                  params={{ id: f.id }}
                  className="paper-card group relative flex items-start justify-between gap-4 rounded-xl p-5 pl-6 hover:border-gold transition-colors"
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${p.color} rounded-l-xl`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>{f.categories?.name}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                        <Flame className="h-2.5 w-2.5" /> {p.label}
                      </span>
                    </div>
                    <div className="mt-2 font-display text-lg text-primary group-hover:text-plum transition-colors">
                      {f.question}
                    </div>
                    <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                      <span>{f.view_count} views</span>
                      <span>▲ {f.upvotes}</span>
                      <span>▼ {f.downvotes}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2" />
                </Link>
              );
            })}
          </div>
        </div>
      </Container>
      <SiteFooter />
    </div>
  );
}
