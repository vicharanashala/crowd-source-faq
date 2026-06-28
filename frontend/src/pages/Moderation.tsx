import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AdminShell } from "@/components/layout/AdminShell";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Check, X, Trash2, Filter, Eye, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { timeAgo } from "@/lib/mockData";

export default function Moderation() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [tab, setTab] = useState("pending");
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    try {
      const res = await api.get("/admin/reports");
      if (res.data.success) {
        setItems(res.data.data.reports || []);
      }
    } catch (err: any) {
      console.error("Failed to load reports:", err);
      toast.error(err.response?.data?.error?.message || "Failed to load moderation queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "moderator") {
      toast.error("Access denied. Admin privileges required.");
      navigate("/");
      return;
    }

    if (user) {
      fetchReports();
    }
  }, [user, navigate]);

  const act = async (id: string, action: string, type?: string, targetId?: string) => {
    try {
      if (action === "approve") {
        await api.patch(`/admin/reports/${id}`, { status: "approved" });
        toast.success("Report approved.");
      } else if (action === "reject") {
        await api.patch(`/admin/reports/${id}`, { status: "rejected" });
        toast.success("Report rejected.");
      } else if (action === "delete") {
        if (type === "question") {
          await api.delete(`/admin/questions/${targetId}`);
        } else if (type === "answer") {
          await api.delete(`/admin/answers/${targetId}`);
        }
        await api.patch(`/admin/reports/${id}`, { status: "resolved" });
        toast.success("Item deleted and report resolved.");
      }
      fetchReports();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || `Failed to perform ${action} action.`);
    }
  };

  if (loading) {
    return (
      <AdminShell eyebrow="Trust & safety" title="Reports & Moderation">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 bg-white border border-brand-line">
          <Loader2 className="animate-spin text-brand-blue" size={32} />
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-mute">Loading moderation queue...</p>
        </div>
      </AdminShell>
    );
  }

  if (!user || (user.role !== "admin" && user.role !== "moderator")) {
    return (
      <AdminShell eyebrow="Trust & safety" title="Access Denied">
        <div className="max-w-md mx-auto py-16 text-center">
          <p className="text-brand-body mb-8">You do not have permission to view the moderation panel.</p>
          <Link to="/" className="bg-brand-ink text-brand-paper px-6 py-3 text-sm">Back to Home</Link>
        </div>
      </AdminShell>
    );
  }

  const filtered = items.filter((r) => r.status === tab);

  const counts = {
    pending: items.filter((r) => r.status === 'pending').length,
    approved: items.filter((r) => r.status === 'approved').length,
    rejected: items.filter((r) => r.status === 'rejected').length,
    resolved: items.filter((r) => r.status === 'resolved').length,
  };

  return (
    <AdminShell
      eyebrow="Trust & safety"
      title="Reports & Moderation"
      actions={
        <button className="border border-brand-line px-4 py-2.5 text-sm hover:border-brand-ink flex items-center gap-2" data-testid="mod-filter-btn">
          <Filter size={14} /> Filter
        </button>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-brand-line border border-brand-line mb-px">
        {[
          { k: "pending", label: "Pending", v: counts.pending, color: "text-brand-vermilion" },
          { k: "approved", label: "Approved", v: counts.approved, color: "text-brand-forest" },
          { k: "rejected", label: "Rejected", v: counts.rejected, color: "text-brand-mute" },
          { k: "resolved", label: "Resolved", v: counts.resolved, color: "text-brand-blue" },
        ].map((s) => (
          <button key={s.k} onClick={() => setTab(s.k)} className={`bg-white p-5 text-left transition-colors hover:bg-[#F9F9F8] ${tab === s.k ? 'ring-1 ring-brand-ink ring-inset' : ''}`} data-testid={`mod-tab-${s.k}`}>
            <p className="label-eyebrow">{s.label}</p>
            <p className={`font-sans font-semibold text-4xl mt-2 ${s.color}`}>{s.v}</p>
          </button>
        ))}
      </div>

      <div className="border border-brand-line bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-brand-mute border-b border-brand-line">
              <th className="px-6 py-3 font-medium">Flagged item</th>
              <th className="px-6 py-3 font-medium">Type</th>
              <th className="px-6 py-3 font-medium">Reason</th>
              <th className="px-6 py-3 font-medium">Reporter</th>
              <th className="px-6 py-3 font-medium">When</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-16 text-center" data-testid="mod-empty">
                <Check size={24} className="mx-auto text-brand-forest mb-3" />
                <p className="font-serif text-2xl text-brand-ink">Inbox zero.</p>
                <p className="text-sm text-brand-body mt-1">No items in this queue.</p>
              </td></tr>
            )}
            {filtered.map((r) => {
              const reporter = r.reporter || { displayName: "Unknown User", avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${r._id}` };
              const reporterAvatar = reporter.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(reporter.displayName)}`;
              const targetDetail = r.targetDetail;
              
              // Get item title/text
              let displayTitle = "Answer content";
              let linkUrl = "#";

              if (r.type === "question" && targetDetail) {
                displayTitle = targetDetail.title;
                linkUrl = `/q/${targetDetail.slug || targetDetail._id}`;
              } else if (r.type === "answer" && targetDetail) {
                displayTitle = targetDetail.body ? (targetDetail.body.length > 50 ? targetDetail.body.slice(0, 50) + "..." : targetDetail.body) : "Answer content";
                if (targetDetail.question) {
                  linkUrl = `/q/${targetDetail.question.slug || targetDetail.question._id || targetDetail.question}`;
                }
              }

              return (
                <tr key={r._id} className="border-b border-brand-line last:border-b-0 hover:bg-[#F9F9F8]" data-testid={`report-${r._id}`}>
                  <td className="px-6 py-4 max-w-xs">
                    <p className="text-brand-ink truncate">{displayTitle}</p>
                    <p className="text-[10px] uppercase tracking-widest text-brand-mute mt-0.5">#{r.target}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="border border-brand-line px-2 py-0.5 text-[10px] uppercase tracking-widest">{r.type}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-1.5 text-brand-vermilion">
                      <AlertTriangle size={12} /> {r.reason}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <img src={reporterAvatar} alt="" className="w-7 h-7 object-cover rounded-full" />
                      <span className="text-brand-body">{reporter.displayName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-brand-mute text-xs">{timeAgo(r.createdAt)}</td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-1">
                      {linkUrl !== "#" ? (
                        <Link to={linkUrl} className="w-8 h-8 border border-brand-line hover:border-brand-ink flex items-center justify-center" title="View" data-testid={`view-${r._id}`}><Eye size={13} /></Link>
                      ) : (
                        <button className="w-8 h-8 border border-brand-line hover:border-brand-ink flex items-center justify-center" title="View" data-testid={`view-${r._id}`}><Eye size={13} /></button>
                      )}
                      {r.status === 'pending' && (
                        <>
                          <button onClick={() => act(r._id, 'approve')} className="w-8 h-8 border border-brand-line text-brand-forest hover:bg-[#E8F0ED]" title="Approve" data-testid={`approve-${r._id}`}><Check size={13} /></button>
                          <button onClick={() => act(r._id, 'reject')} className="w-8 h-8 border border-brand-line text-brand-mute hover:bg-[#F0F0EE]" title="Reject" data-testid={`reject-${r._id}`}><X size={13} /></button>
                          {user.role === "admin" && (
                            <button onClick={() => act(r._id, 'delete', r.type, r.target)} className="w-8 h-8 border border-brand-line text-brand-vermilion hover:bg-[#FBEAE6]" title="Delete Content" data-testid={`delete-${r._id}`}><Trash2 size={13} /></button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
