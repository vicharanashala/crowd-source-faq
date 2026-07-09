import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowRight, Search, BookOpen, MessageCircleQuestion, ShieldCheck, ArrowUpRight } from "lucide-react";

import { SiteHeader, SiteFooter, Container } from "@/components/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTrending, listCategories } from "@/lib/faq.functions";

const trendingOpts = queryOptions({ queryKey: ["trending"], queryFn: () => getTrending() });
const catsOpts = queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() });

export const Route = createFileRoute("/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(trendingOpts),
      context.queryClient.ensureQueryData(catsOpts),
    ]),
  component: Home,
});

function Home() {
  const { data: trending } = useSuspenseQuery(trendingOpts);
  const { data: cats } = useSuspenseQuery(catsOpts);
  const [q, setQ] = useState("");
  const nav = useNavigate();

  function goSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    nav({ to: "/ask", search: { q: q.trim() } as never });
  }

  const topTrending = trending.slice(0, 2);
  const trendingTags = [
    "When will NOC be issued?",
    "What is Rosetta?",
    "How do Spurti points work?",
  ];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <Container className="pt-16 pb-10 md:pt-24 md:pb-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mx-auto text-center space-y-6"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            AI-Powered Intern Assistant
          </div>

          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl tracking-tight text-foreground">
            Ask <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Vidyā</span> anything.
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Your intelligent gateway to the Vicharanashala Internship knowledge base — semantic search,
            AI-grounded answers, and community queries.
          </p>

          <form onSubmit={goSearch} className="max-w-2xl mx-auto relative group mt-2">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-2xl blur opacity-20 group-hover:opacity-30 transition duration-1000 group-hover:duration-200" />
            <div className="relative flex items-center bg-card border border-input rounded-xl shadow-sm overflow-hidden p-2">
              <div className="pl-4 text-muted-foreground">
                <Search className="h-5 w-5" />
              </div>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search FAQs, technical docs, or program dates..."
                className="flex-1 border-0 shadow-none focus-visible:ring-0 px-4 py-3 text-foreground placeholder:text-muted-foreground font-medium bg-transparent"
              />
              <Button type="submit" className="bg-foreground text-background hover:bg-foreground/90 rounded-lg px-6 py-2.5 h-auto font-semibold">
                Ask <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </form>

          <div className="flex flex-wrap justify-center gap-3 text-sm pt-2">
            <span className="text-muted-foreground">Trending:</span>
            {trendingTags.map((s) => (
              <button
                key={s}
                onClick={() => setQ(s)}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                #{s.replace(/\s+/g, "")}
              </button>
            ))}
          </div>
        </motion.div>
      </Container>

      <Container className="py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35 }}
          >
            <Link to="/browse" className="group bento-tile bento-tile-hover block p-6 h-full">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <BookOpen className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Knowledge Base</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Browse {trending.length} indexed FAQs across {cats.length} chapters.
              </p>
              <div className="flex items-center text-primary text-sm font-semibold">
                Explore articles <ArrowUpRight className="h-4 w-4 ml-1 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: 0.05 }}
          >
            <Link to="/queries" className="group bento-tile bento-tile-hover block p-6 h-full">
              <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mb-4 text-accent group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                <MessageCircleQuestion className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Community QA</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Ask questions and see what fellow interns are discussing right now.
              </p>
              <div className="flex items-center text-accent text-sm font-semibold">
                Join the talk <ArrowUpRight className="h-4 w-4 ml-1 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: 0.1 }}
          >
            <Link to="/admin" className="group bento-tile bento-tile-hover block p-6 h-full">
              <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center mb-4 text-foreground group-hover:bg-foreground group-hover:text-background transition-colors">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Admin Support</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Review queries, edit FAQs, and manage the knowledge base.
              </p>
              <div className="flex items-center text-foreground text-sm font-semibold">
                Open admin <ArrowUpRight className="h-4 w-4 ml-1 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
            </Link>
          </motion.div>
        </div>
      </Container>

      {topTrending.length > 0 && (
        <Container className="py-10">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-primary">/ trending</div>
              <h2 className="font-display text-2xl md:text-3xl mt-1">Most viewed this week</h2>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/browse">All FAQs <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {topTrending.map((faq, i) => (
              <motion.div
                key={faq.id}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <Link
                  to="/faq/$id"
                  params={{ id: faq.id }}
                  className="bento-tile bento-tile-hover block p-6 group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono uppercase tracking-widest text-primary">
                      #{i + 1} Trending
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">{faq.view_count} views</span>
                  </div>
                  <h3 className="font-display text-xl text-foreground group-hover:text-primary transition-colors">
                    {faq.question}
                  </h3>
                  <div className="mt-2 text-xs font-mono text-muted-foreground">{faq.categories?.name}</div>
                </Link>
              </motion.div>
            ))}
          </div>
        </Container>
      )}

      <Container className="py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-primary">/ chapters</div>
            <h2 className="font-display text-3xl md:text-4xl mt-1">Browse by topic</h2>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/browse">All topics <ArrowRight className="h-3 w-3" /></Link>
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cats.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.02 }}
            >
              <Link
                to="/browse"
                search={{ cat: c.slug } as never}
                className="bento-tile bento-tile-hover group flex items-center justify-between p-5 h-full"
              >
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
                    ch.{String(c.sort_order + 1).padStart(2, "0")}
                  </div>
                  <div className="font-display text-base text-foreground group-hover:text-primary transition-colors">
                    {c.name}
                  </div>
                </div>
                <BookOpen className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            </motion.div>
          ))}
        </div>
      </Container>

      <SiteFooter />
    </div>
  );
}
