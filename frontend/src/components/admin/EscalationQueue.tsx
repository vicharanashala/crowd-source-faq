import { useEffect, useState, useRef, useCallback } from "react";
import { escalationApi } from "../../api/escalationApi";
import type { Escalation, EscalationAnalytics } from "../../types";

const POLL_INTERVAL = 15_000; // 15 s — keeps both stats and queue live

const PRIORITY_STYLES: Record<string, string> = {
  Low: "bg-green-100 text-green-700",
  Medium: "bg-yellow-100 text-yellow-700",
  High: "bg-red-100 text-red-700",
};

const STATUS_BADGE: Record<string, string> = {
  Pending: "bg-yellow-100 text-yellow-700",
  "In Progress": "bg-blue-100 text-blue-700",
  Resolved: "bg-green-100 text-green-700",
  Closed: "bg-gray-100 text-gray-500",
};

const STATUS_OPTIONS = ["Pending", "In Progress", "Resolved", "Closed"];

const TEAMS = [
  "VIBE Team",
  "Samagama Team",
  "Offer Letter",
  "Zoom Meeting",
  "Attendance & Polls",
  "Other",
];

export default function EscalationQueue() {
  const [tickets, setTickets] = useState<Escalation[]>([]);
  const [stats, setStats] = useState<EscalationAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [teamDraft, setTeamDraft] = useState("");
  const [resolutionDraft, setResolutionDraft] = useState("");
  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Loads both ticket list and stats atomically so they stay in sync. */
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [data, analytics] = await Promise.all([
        escalationApi.getAll(),
        escalationApi.getAnalytics(),
      ]);
      setTickets(data);
      setStats(analytics);
      // Keep selection if still valid, else pick first
      setSelectedId((prev) =>
        data.some((t) => t._id === prev) ? prev : data[0]?._id ?? null
      );
    } catch (err: any) {
      if (!silent) setError(err.message || "Failed to load escalations.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    pollerRef.current = setInterval(() => load(true), POLL_INTERVAL);
    return () => {
      if (pollerRef.current) clearInterval(pollerRef.current);
    };
  }, [load]);

  const selected = tickets.find((t) => t._id === selectedId) || null;

  useEffect(() => {
    setTeamDraft(selected?.assignedTo || "");
    setResolutionDraft(selected?.resolutionNotes || "");
    setNoteDraft("");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAssign = async () => {
    if (!selected || !teamDraft.trim()) return;
    try {
      await escalationApi.assign(selected._id, teamDraft.trim());
      await load(true);
    } catch (err: any) {
      alert(err.message || "Failed to assign.");
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!selected) return;
    try {
      await escalationApi.updateStatus(selected._id, status, resolutionDraft);
      await load(true);
    } catch (err: any) {
      alert(err.message || "Failed to update status.");
    }
  };

  const handleReopen = async () => {
    if (!selected) return;
    try {
      await escalationApi.reopen(selected._id);
      await load(true);
    } catch (err: any) {
      alert(err.message || "Failed to reopen.");
    }
  };

  const handleAddNote = async () => {
    if (!selected || !noteDraft.trim()) return;
    try {
      await escalationApi.addNote(selected._id, noteDraft.trim());
      setNoteDraft("");
      await load(true);
    } catch (err: any) {
      alert(err.message || "Failed to add note.");
    }
  };

  if (loading) {
    return <p className="text-ink/70">Loading escalations…</p>;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
        <p className="text-clay">{error}</p>
        <button
          onClick={() => load()}
          className="mt-3 rounded-lg border border-line px-4 py-1.5 text-sm hover:bg-mossLight"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      {/* ── Stats bar (live, no manual refresh needed) ── */}
      {stats && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total", value: stats.total, color: "text-ink" },
            { label: "Pending", value: stats.pending, color: "text-yellow-600" },
            { label: "In Progress", value: stats.inProgress, color: "text-blue-600" },
            { label: "Resolved / Closed", value: stats.resolved + stats.closed, color: "text-moss" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-line bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
            >
              <p className="text-sm font-medium uppercase tracking-wide text-ink/60">{s.label}</p>
              <h3 className={`mt-2 text-4xl font-bold ${s.color}`}>{s.value}</h3>
            </div>
          ))}
        </div>
      )}

      {/* ── Selected ticket detail ── */}
      <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
        {!selected ? (
          <p className="text-ink/70">
            No escalations yet — this section will populate once users submit queries.
          </p>
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl font-semibold">{selected.title}</h2>
                <p className="text-sm text-ink/70">
                  Raised by {selected.submittedBy} ·{" "}
                  {new Date(selected.createdAt).toLocaleString()}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  PRIORITY_STYLES[selected.priority] || "bg-mossLight text-moss"
                }`}
              >
                {selected.priority}
              </span>
            </div>

            <div className="space-y-5">
              <div>
                <p className="text-sm font-semibold uppercase text-ink/60">Description</p>
                <div className="mt-2 rounded-xl border border-line bg-parchment p-4 text-ink/90">
                  {selected.description}
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="text-sm font-semibold uppercase text-ink/60">Category</p>
                  <p className="mt-1">{selected.category}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase text-ink/60">Status</p>
                  <span
                    className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                      STATUS_BADGE[selected.status] || "bg-mossLight text-moss"
                    }`}
                  >
                    {selected.status}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase text-ink/60">Assigned To</p>
                  <p className="mt-1">{selected.assignedTo || "Unassigned"}</p>
                </div>
              </div>

              {/* Assign team */}
              <div>
                <p className="text-sm font-semibold uppercase text-ink/60">Assign To Team</p>
                <div className="mt-2 flex gap-2">
                  <select
                    value={teamDraft}
                    onChange={(e) => setTeamDraft(e.target.value)}
                    className="w-full max-w-xs rounded-xl border border-line bg-parchment p-2.5 outline-none focus:border-moss"
                  >
                    <option value="">— select team —</option>
                    {TEAMS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAssign}
                    className="rounded-lg border border-line px-4 py-1.5 font-medium hover:bg-mossLight"
                  >
                    Assign
                  </button>
                </div>
              </div>

              {/* Resolution notes */}
              <div>
                <p className="text-sm font-semibold uppercase text-ink/60">Resolution Notes</p>
                <textarea
                  rows={3}
                  value={resolutionDraft}
                  onChange={(e) => setResolutionDraft(e.target.value)}
                  placeholder="Notes shown when marking Resolved / Closed…"
                  className="mt-2 w-full rounded-xl border border-line bg-parchment p-4 outline-none transition focus:border-moss"
                />
              </div>

              {/* Status action buttons — only show statuses that differ from current */}
              <div className="flex flex-wrap gap-3">
                {STATUS_OPTIONS.filter((s) => s !== selected.status).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className="rounded-lg bg-moss px-5 py-2 font-medium text-parchment transition hover:opacity-90"
                  >
                    Mark {s}
                  </button>
                ))}
                {["Resolved", "Closed"].includes(selected.status) && (
                  <button
                    onClick={handleReopen}
                    className="rounded-lg border border-line px-5 py-2 font-medium hover:bg-mossLight"
                  >
                    Reopen
                  </button>
                )}
              </div>

              {/* Internal notes — uses `notes` field (matches backend schema) */}
              <div>
                <p className="text-sm font-semibold uppercase text-ink/60">
                  Internal Notes ({selected.notes.length})
                </p>
                <div className="mt-2 space-y-2">
                  {selected.notes.length === 0 ? (
                    <p className="text-sm text-ink/60">No notes yet.</p>
                  ) : (
                    selected.notes.map((note, i) => (
                      <div key={i} className="rounded-xl border border-line bg-parchment p-3">
                        <p className="text-sm text-ink/90">{note.text}</p>
                        <p className="mt-1 text-xs text-ink/50">
                          {new Date(note.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                    placeholder="Add an internal note (admin-only)…"
                    className="w-full rounded-xl border border-line bg-parchment p-2.5 outline-none focus:border-moss"
                  />
                  <button
                    onClick={handleAddNote}
                    className="rounded-lg border border-line px-4 py-1.5 font-medium hover:bg-mossLight"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ── Ticket queue table ── */}
      <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="font-display text-2xl font-semibold">Escalation Queue</h2>
          <p className="text-sm text-ink/70">
            {tickets.length} quer{tickets.length === 1 ? "y" : "ies"} total · auto-refreshes every 15 s
          </p>
        </div>

        {tickets.length === 0 ? (
          <p className="text-ink/70">No escalations submitted yet.</p>
        ) : (
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-line">
                <th className="py-3 text-left">Query</th>
                <th className="py-3 text-left">Category</th>
                <th className="py-3 text-left">Priority</th>
                <th className="py-3 text-left">Status</th>
                <th className="py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const isSelected = t._id === selectedId;
                return (
                  <tr
                    key={t._id}
                    className={`border-b border-line transition-colors ${
                      isSelected ? "bg-mossLight" : "hover:bg-parchment"
                    }`}
                  >
                    <td className="py-4 pr-4 font-medium">{t.title}</td>
                    <td className="pr-4 text-sm text-ink/70">{t.category}</td>
                    <td className="pr-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          PRIORITY_STYLES[t.priority] || "bg-mossLight text-moss"
                        }`}
                      >
                        {t.priority}
                      </span>
                    </td>
                    <td className="pr-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          STATUS_BADGE[t.status] || "bg-mossLight text-moss"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="text-center">
                      <button
                        onClick={() => setSelectedId(t._id)}
                        className={`rounded-lg border px-3 py-1 text-sm transition ${
                          isSelected
                            ? "border-moss bg-moss text-parchment"
                            : "border-line hover:bg-mossLight"
                        }`}
                      >
                        {isSelected ? "Viewing" : "View"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
