import { useEffect, useState } from "react";
import {
  getAllEscalations,
  assignEscalation,
  updateEscalationStatus,
  addInternalNote,
  getAnalytics,
} from "../services/escalationService";
import StatusStepper from "./StatusStepper";
import TicketAttachments from "./TicketAttachments";
import "../styles/escalation.css";

const formatTicketId = (id) => `ESC-${id.slice(-6).toUpperCase()}`;

const AdminDashboard = () => {
  const [tickets, setTickets] = useState([]);
  const [filters, setFilters] = useState({ status: "", priority: "", category: "", sort: "newest" });
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedNotes, setExpandedNotes] = useState({}); // { [ticketId]: boolean }
  const [noteDrafts, setNoteDrafts] = useState({}); // { [ticketId]: string }

  const loadTickets = async () => {
    setLoading(true);
    try {
      const cleanFilters = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v)
      );
      const data = await getAllEscalations(cleanFilters);
      setTickets(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const data = await getAnalytics();
      setAnalytics(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadTickets();
    loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const handleAssign = async (id, team) => {
    await assignEscalation(id, team);
    loadTickets();
  };

  const handleStatusChange = async (id, status) => {
    const notes = status === "Resolved" ? prompt("Add resolution notes (optional):") || "" : "";
    await updateEscalationStatus(id, status, notes);
    loadTickets();
    loadAnalytics();
  };

  const toggleNotes = (id) => {
    setExpandedNotes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddNote = async (id) => {
    const text = (noteDrafts[id] || "").trim();
    if (!text) return;
    await addInternalNote(id, text);
    setNoteDrafts((prev) => ({ ...prev, [id]: "" }));
    loadTickets();
  };

  return (
    <div className="escalation-card">
      <h2 className="escalation-heading">Escalation Admin Dashboard</h2>

      {/* Analytics summary */}
      {analytics && (
        <div className="analytics-grid">
          <div className="analytics-box">
            <span className="analytics-number">{analytics.totalEscalations}</span>
            <span className="analytics-label">Total Escalations</span>
          </div>
          <div className="analytics-box">
            <span className="analytics-number">{analytics.resolvedCount}</span>
            <span className="analytics-label">Resolved</span>
          </div>
          <div className="analytics-box">
            <span className="analytics-number">{analytics.averageResolutionTimeHours}h</span>
            <span className="analytics-label">Avg. Resolution Time</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="escalation-row filter-row">
        <select name="status" value={filters.status} onChange={handleFilterChange}>
          <option value="">All Statuses</option>
          <option>Pending</option>
          <option>In Progress</option>
          <option>Resolved</option>
          <option>Closed</option>
          <option>Reopened</option>
        </select>

        <select name="priority" value={filters.priority} onChange={handleFilterChange}>
          <option value="">All Priorities</option>
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
          <option>Critical</option>
        </select>

        <select name="category" value={filters.category} onChange={handleFilterChange}>
          <option value="">All Teams</option>
          <option>VIBE Team</option>
          <option>Samagama Team</option>
          <option>Offer Letter</option>
          <option>Zoom Meeting</option>
          <option>Attendance &amp; Polls</option>
          <option>Other</option>
        </select>

        <select name="sort" value={filters.sort} onChange={handleFilterChange}>
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
        </select>
      </div>

      {/* Ticket list */}
      {loading ? (
        <p className="escalation-subtext">Loading tickets...</p>
      ) : tickets.length === 0 ? (
        <p className="escalation-subtext">No escalations match these filters.</p>
      ) : (
        <div className="escalation-list">
          {tickets.map((ticket) => (
            <div key={ticket._id} className="escalation-ticket">
              <div className="ticket-top">
                <div>
                  <span className="ticket-id">{formatTicketId(ticket._id)}</span>
                  <span className="ticket-title">{ticket.title}</span>
                </div>
                <span className={`priority-tag ${ticket.priority}`}>{ticket.priority}</span>
              </div>

              <StatusStepper status={ticket.status} />

              <p className="ticket-desc">{ticket.description}</p>

              <TicketAttachments attachments={ticket.attachments} />

              <div className="ticket-meta">
                <span>Category: {ticket.category}</span>
                <span>Raised by: {ticket.raisedBy?.name || "Unknown"}</span>
                <span>
                  Assigned team: {ticket.assignedTeam || "Unassigned"}
                </span>
              </div>

              <div className="admin-actions">
                <select
                  defaultValue=""
                  onChange={(e) => e.target.value && handleAssign(ticket._id, e.target.value)}
                >
                  <option value="" disabled>
                    Assign to team
                  </option>
                  <option>VIBE Team</option>
                  <option>Samagama Team</option>
                  <option>Offer Letter</option>
                  <option>Zoom Meeting</option>
                  <option>Attendance &amp; Polls</option>
                </select>
                <select
                  defaultValue=""
                  onChange={(e) => e.target.value && handleStatusChange(ticket._id, e.target.value)}
                >
                  <option value="" disabled>
                    Update status
                  </option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>

              {/* Internal notes — admin-only, never visible to the candidate */}
              <div className="internal-notes">
                <button
                  type="button"
                  className="internal-notes-toggle"
                  onClick={() => toggleNotes(ticket._id)}
                >
                  🔒 Internal Notes {ticket.internalNotes?.length > 0 && `(${ticket.internalNotes.length})`}
                  <span className="internal-notes-caret">{expandedNotes[ticket._id] ? "▲" : "▼"}</span>
                </button>

                {expandedNotes[ticket._id] && (
                  <div className="internal-notes-panel">
                    {ticket.internalNotes?.length > 0 ? (
                      <div className="internal-notes-thread">
                        {ticket.internalNotes.map((note, i) => (
                          <div className="internal-note" key={i}>
                            <div className="internal-note-header">
                              <span className="internal-note-author">{note.addedByName || "Admin"}</span>
                              <span className="internal-note-time">
                                {new Date(note.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <p className="internal-note-text">{note.text}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="escalation-subtext" style={{ marginBottom: "8px" }}>
                        No internal notes yet.
                      </p>
                    )}

                    <div className="internal-note-composer">
                      <input
                        type="text"
                        placeholder="Add a note only other admins can see…"
                        value={noteDrafts[ticket._id] || ""}
                        onChange={(e) =>
                          setNoteDrafts((prev) => ({ ...prev, [ticket._id]: e.target.value }))
                        }
                        onKeyDown={(e) => e.key === "Enter" && handleAddNote(ticket._id)}
                      />
                      <button
                        type="button"
                        className="escalation-btn-secondary"
                        onClick={() => handleAddNote(ticket._id)}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
