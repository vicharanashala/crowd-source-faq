import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { MessageSquare, AtSign, Check, ArrowUp, Bell, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { io } from "socket.io-client";
import { toast } from "sonner";

const iconMap = {
  answer: MessageSquare,
  mention: AtSign,
  accepted: Check,
  vote: ArrowUp,
  system: Bell,
};

export default function Notifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      const res = await api.get("/notifications");
      if (res.data.success) {
        setItems(res.data.data.notifications || []);
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
    } else {
      setLoading(false);
    }
  }, [user]);

  // Set up socket listener to append new notifications dynamically
  useEffect(() => {
    if (!user) return;

    // Connect to the socket server
    const socketUrl = process.env.REACT_APP_API_BASE_URL
      ? (process.env.REACT_APP_API_BASE_URL === "/api" ? "https://crowdfaq-api.onrender.com" : process.env.REACT_APP_API_BASE_URL.replace(/\/api\/v1\/?$/, ""))
      : "http://localhost:5000";
    const socket = io(socketUrl);

    // Join room for user's own updates if user exists
    socket.emit("join_question", user._id);

    // Listen to real-time events
    socket.on("new_answer", (data: any) => {
      toast.success("New answer posted!", {
        description: data.body ? (data.body.length > 50 ? data.body.slice(0, 50) + "..." : data.body) : "",
      });
      fetchNotifications();
    });

    socket.on("answer_accepted", () => {
      toast.success("An answer was accepted!");
      fetchNotifications();
    });

    socket.on("question_status_updated", (data: any) => {
      toast.info(`Question status updated to ${data.status}`);
      fetchNotifications();
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  const markAll = async () => {
    try {
      const res = await api.patch("/notifications/mark-all-read");
      if (res.data.success) {
        setItems(items.map((n) => ({ ...n, read: true })));
        toast.success("All notifications marked as read.");
      }
    } catch (err) {
      toast.error("Failed to mark notifications read.");
    }
  };

  const markOne = async (id: string) => {
    try {
      const res = await api.patch(`/notifications/${id}/read`);
      if (res.data.success) {
        setItems(items.map((n) => n._id === id ? { ...n, read: true } : n));
      }
    } catch (err) {
      toast.error("Failed to mark notification read.");
    }
  };

  const filtered = items.filter((n) => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.read;
    return n.type === filter;
  });
  const unread = items.filter((n) => !n.read).length;

  const filters = [
    { k: "all", label: "All" },
    { k: "unread", label: `Unread (${unread})` },
    { k: "answer", label: "Answers" },
    { k: "mention", label: "Mentions" },
    { k: "system", label: "System" },
  ];

  if (loading) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Loader2 className="animate-spin text-brand-blue" size={32} />
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-mute">Loading inbox...</p>
        </div>
      </PageShell>
    );
  }

  if (!user) {
    return (
      <PageShell>
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 className="font-serif text-4xl mb-4 text-brand-ink">Please Sign In</h1>
          <p className="text-brand-body mb-8">You must be logged in to view your notifications.</p>
          <Link to="/login" className="bg-brand-ink text-brand-paper px-6 py-3 text-sm">Sign in</Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="max-w-2xl mx-auto px-4 md:px-6 py-12 md:py-16" data-testid="notifications-page">
        <div className="flex items-center justify-between mb-2">
          <p className="label-eyebrow">Inbox</p>
          {unread > 0 && (
            <button onClick={markAll} className="text-xs uppercase tracking-widest text-brand-body hover:text-brand-ink flex items-center gap-1.5" data-testid="mark-all-btn">
              <Check size={11} /> Mark all read
            </button>
          )}
        </div>
        <h1 className="font-serif text-5xl md:text-6xl text-brand-ink leading-none tracking-tight mb-8">Notifications.</h1>

        <div className="flex gap-1 border-b border-brand-line mb-6 overflow-x-auto" data-testid="notification-filters">
          {filters.map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              className={`px-3 py-2.5 text-xs uppercase tracking-widest border-b-2 -mb-px whitespace-nowrap ${filter === f.k ? 'border-brand-ink text-brand-ink font-semibold' : 'border-transparent text-brand-body hover:text-brand-ink'}`}
              data-testid={`notif-filter-${f.k}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="border border-brand-line bg-white p-12 text-center" data-testid="notifications-empty">
            <Bell size={24} className="mx-auto mb-4 text-brand-mute" strokeWidth={1.5} />
            <p className="font-serif text-2xl text-brand-ink">All quiet.</p>
            <p className="text-sm text-brand-body mt-2">No notifications in this view.</p>
          </div>
        ) : (
          <ul className="border border-brand-line bg-white divide-y divide-brand-line">
            {filtered.map((n) => {
              const Icon = iconMap[n.type] || Bell;
              const actor = n.actor;
              const timeString = n.createdAt ? new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "";
              const targetUrl = n.target ? `/q/${n.target.slug || n.target._id || n.target}` : "#";

              return (
                <li key={n._id} className={`relative flex items-start gap-4 p-5 hover:bg-[#F9F9F8] transition-colors ${!n.read ? 'border-l-4 border-brand-blue' : 'border-l-4 border-transparent'}`} data-testid={`notification-${n._id}`}>
                  <div className="w-9 h-9 border border-brand-line bg-brand-paper flex items-center justify-center shrink-0">
                    <Icon size={15} strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {n.target ? (
                      <Link to={targetUrl} className="hover:underline">
                        <p className={`text-sm leading-relaxed ${!n.read ? 'text-brand-ink font-medium' : 'text-brand-body'}`}>{n.text}</p>
                      </Link>
                    ) : (
                      <p className={`text-sm leading-relaxed ${!n.read ? 'text-brand-ink font-medium' : 'text-brand-body'}`}>{n.text}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      {actor && actor.avatar && <img src={actor.avatar} alt="" className="w-5 h-5 object-cover rounded-full" />}
                      {actor && <span className="text-[10px] uppercase tracking-widest text-brand-ink font-medium">{actor.displayName}</span>}
                      <span className="text-[10px] uppercase tracking-widest text-brand-mute">{timeString}</span>
                    </div>
                  </div>
                  {!n.read && (
                    <button onClick={() => markOne(n._id)} className="text-[10px] uppercase tracking-widest text-brand-blue hover:text-brand-ink shrink-0" data-testid={`mark-read-${n._id}`}>
                      Mark read
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
