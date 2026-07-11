import { useEffect, useState } from "react";
import { getMyEscalations, reopenEscalation } from "../services/escalationService";
import StatusStepper from "./StatusStepper";
import TicketAttachments from "./TicketAttachments";
import "../styles/escalation.css";

// Formats a Mongo ObjectId into a short, human-friendly ticket number
const formatTicketId = (id) => `ESC-${id.slice(-6).toUpperCase()}`;

const EscalationTracker = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

const loadTickets = async () => {
  try {
    const response = await getMyEscalations();
    setTickets(response.data);
  } catch (err) {
    console.error(err);
    setTickets([]);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    loadTickets();
  }, []);

  const handleReopen = async (id) => {
    try {
      await reopenEscalation(id);
      loadTickets(); // refresh list after reopening
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <p className="escalation-subtext">Loading your queries...</p>;

  if (tickets.length === 0) {
    return <p className="escalation-subtext">You haven't raised any escalations yet.</p>;
  }

  return (
    <div className="escalation-card">
      <h2 className="escalation-heading">Your Escalations</h2>

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
              <span>Raised: {new Date(ticket.createdAt).toLocaleDateString()}</span>
            </div>

            {ticket.resolutionNotes && (
              <p className="ticket-resolution">
                <strong>Resolution:</strong> {ticket.resolutionNotes}
              </p>
            )}

            {["Resolved", "Closed"].includes(ticket.status) && (
              <button className="escalation-btn-secondary" onClick={() => handleReopen(ticket._id)}>
                Reopen this ticket
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default EscalationTracker;
