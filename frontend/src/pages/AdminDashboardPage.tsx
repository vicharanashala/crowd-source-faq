import EscalationQueue from "../components/admin/EscalationQueue";

export default function AdminDashboardPage() {
  return (
    <div className="min-h-screen bg-parchment text-ink">
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
        {/* Header */}
        <section>
          <span className="inline-flex rounded-full bg-mossLight px-3 py-1 text-xs font-semibold uppercase tracking-wider text-moss">
            Administration
          </span>

          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">
            Admin Dashboard
          </h1>

          <p className="mt-2 max-w-3xl text-ink/70">
            Review escalated queries, assign them to teams, update their status,
            and leave internal notes. Stats and queue auto-refresh every 15 seconds.
          </p>
        </section>

        {/* Stats + queue in one component — share same polling loop */}
        <EscalationQueue />
      </main>
    </div>
  );
}
