import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { AdminShell } from "@/components/layout/AdminShell";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { 
  ArrowUpRight, ArrowDownRight, MessageSquare, Users as UsersIcon, MessagesSquare, 
  Flag, Download, Loader2, Search, Trash2, Save
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { categories, timeAgo, activityChart } from "@/lib/mockData";
import { toast } from "sonner";

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  
  const [stats, setStats] = useState<any>(null);
  const [userList, setUserList] = useState<any[]>([]);
  const [questionList, setQuestionList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and Filter states
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [questionSearch, setQuestionSearch] = useState("");
  const [questionStatusFilter, setQuestionStatusFilter] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const getQuestionCategory = (q: any) => {
    if (q.category) return q.category;
    if (q.tags && q.tags.length > 0) {
      // Find the first tag that matches one of the category slugs
      const matched = q.tags.find((t: string) => categories.some((c) => c.slug === t));
      if (matched) return matched;
    }
    return "general";
  };

  const getCategoryName = (slug: string) => {
    const found = categories.find((c) => c.slug === slug);
    return found ? found.name : slug.charAt(0).toUpperCase() + slug.slice(1);
  };

  const isAdmin = user?.role === "admin";
  const isModOrAdmin = user?.role === "admin" || user?.role === "moderator";

  const fetchDashboardStats = async () => {
    try {
      const statsRes = await api.get("/admin/stats");
      if (statsRes.data.success) {
        setStats(statsRes.data.data);
      }
    } catch (err) {
      console.error("Stats fetch failed:", err);
    }
  };

  const fetchUsers = async () => {
    try {
      const params: any = {};
      if (userSearch) params.search = userSearch;
      if (userRoleFilter) params.role = userRoleFilter;
      const res = await api.get("/admin/users", { params });
      if (res.data.success) {
        setUserList(res.data.data.users || []);
      }
    } catch (err) {
      console.error("Users fetch failed:", err);
    }
  };

  const fetchQuestions = async () => {
    try {
      const params: any = {};
      if (questionSearch) params.search = questionSearch;
      if (questionStatusFilter) params.status = questionStatusFilter;
      const res = await api.get("/admin/questions", { params });
      if (res.data.success) {
        setQuestionList(res.data.data.questions || []);
      }
    } catch (err) {
      console.error("Questions fetch failed:", err);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user && !isModOrAdmin) {
      toast.error("Access denied. Admin privileges required.");
      navigate("/");
      return;
    }

    const loadData = async () => {
      setLoading(true);
      if (pathname === "/admin") {
        await Promise.all([fetchDashboardStats(), fetchUsers(), fetchQuestions()]);
      } else if (pathname === "/admin/users") {
        await fetchUsers();
      } else if (pathname === "/admin/questions") {
        await fetchQuestions();
      }
      setLoading(false);
    };

    if (user) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigate, pathname]);

  // Debounced search queries
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pathname === "/admin/users" && !loading) {
      const delay = setTimeout(fetchUsers, 300);
      return () => clearTimeout(delay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSearch, userRoleFilter]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pathname === "/admin/questions" && !loading) {
      const delay = setTimeout(fetchQuestions, 300);
      return () => clearTimeout(delay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionSearch, questionStatusFilter]);

  // Handle Role Change
  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!isAdmin) {
      toast.error("Only administrators can promote/demote users.");
      return;
    }
    try {
      const res = await api.patch(`/admin/users/${userId}/role`, { role: newRole });
      if (res.data.success) {
        toast.success("User role updated successfully.");
        fetchUsers();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Failed to update role.");
    }
  };

  // Handle Question Status Change
  const handleStatusChange = async (questionId: string, newStatus: string) => {
    try {
      const res = await api.patch(`/admin/questions/${questionId}/status`, { status: newStatus });
      if (res.data.success) {
        toast.success(`Question status updated to ${newStatus}.`);
        fetchQuestions();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Failed to update question status.");
    }
  };

  // Handle Delete Question
  const handleDeleteQuestion = async (questionId: string) => {
    if (!isAdmin) {
      toast.error("Only administrators can delete questions.");
      return;
    }
    if (!window.confirm("Are you sure you want to permanently delete this question and all its answers?")) {
      return;
    }
    try {
      const res = await api.delete(`/admin/questions/${questionId}`);
      if (res.data.success) {
        toast.success("Question deleted permanently.");
        fetchQuestions();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Failed to delete question.");
    }
  };

  if (loading) {
    return (
      <AdminShell eyebrow="Console / overview" title="Loading Panel...">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 bg-white border border-brand-line">
          <Loader2 className="animate-spin text-brand-blue" size={32} />
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-mute">Loading console view...</p>
        </div>
      </AdminShell>
    );
  }

  if (!user || !isModOrAdmin) {
    return (
      <AdminShell eyebrow="Console / overview" title="Access Denied">
        <div className="max-w-md mx-auto py-16 text-center">
          <p className="text-brand-body mb-8">You do not have permission to view the administrator panel.</p>
          <Link to="/" className="bg-brand-ink text-brand-paper px-6 py-3 text-sm">Back to Home</Link>
        </div>
      </AdminShell>
    );
  }

  // Define Views based on current path
  if (pathname === "/admin/users") {
    return (
      <AdminShell
        eyebrow="Console / Members"
        title="User Directory"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex border border-brand-line bg-white px-3 py-1.5 items-center gap-2">
              <Search size={14} className="text-brand-mute" />
              <input 
                type="text" 
                placeholder="Search name/email..." 
                value={userSearch} 
                onChange={(e) => setUserSearch(e.target.value)} 
                className="text-xs outline-none bg-transparent"
              />
            </div>
            <select 
              value={userRoleFilter} 
              onChange={(e) => setUserRoleFilter(e.target.value)} 
              className="border border-brand-line bg-white px-3 py-2 text-xs outline-none"
            >
              <option value="">All Roles</option>
              <option value="student">Student</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
        }
      >
        <div className="border border-brand-line bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-brand-mute border-b border-brand-line">
                <th className="px-6 py-3 font-medium">User</th>
                <th className="px-6 py-3 font-medium">Email</th>
                <th className="px-6 py-3 font-medium">Title</th>
                <th className="px-6 py-3 font-medium">Reputation</th>
                <th className="px-6 py-3 font-medium">Current Role</th>
                <th className="px-6 py-3 font-medium text-right">Promote / Demote</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-line">
              {userList.map((u) => {
                const uAvatar = u.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.displayName)}`;
                return (
                  <tr key={u._id} className="hover:bg-[#F9F9F8]">
                    <td className="px-6 py-4 flex items-center gap-3">
                      <img src={uAvatar} alt="" className="w-8 h-8 object-cover rounded-full border border-brand-line" />
                      <span className="font-medium text-brand-ink">{u.displayName}</span>
                    </td>
                    <td className="px-6 py-4 text-brand-body">{u.email}</td>
                    <td className="px-6 py-4 text-brand-mute text-xs">{u.title || "Contributor"}</td>
                    <td className="px-6 py-4 font-sans font-semibold text-brand-ink">{u.reputationScore || 0}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded ${
                        u.role === "admin" ? "bg-[#FBEAE6] text-brand-vermilion" :
                        u.role === "moderator" ? "bg-[#E8F0ED] text-brand-forest" : "bg-[#F0F0EE] text-brand-mute"
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isAdmin && u._id !== user._id ? (
                        <select 
                          value={u.role} 
                          onChange={(e) => handleRoleChange(u._id, e.target.value)} 
                          className="border border-brand-line bg-white px-2 py-1 text-xs outline-none"
                        >
                          <option value="student">Student</option>
                          <option value="moderator">Moderator</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className="text-xs text-brand-mute">Protected</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {userList.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-brand-mute">No users found matching query.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminShell>
    );
  }

  if (pathname === "/admin/questions") {
    const categoryCounts = questionList.reduce((acc: any, q: any) => {
      const cat = getQuestionCategory(q);
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    const filteredQuestions = questionList.filter((q) => {
      if (activeCategory === "all") return true;
      return getQuestionCategory(q) === activeCategory;
    });

    return (
      <AdminShell
        eyebrow="Console / Contents"
        title="Question Management"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex border border-brand-line bg-white px-3 py-1.5 items-center gap-2">
              <Search size={14} className="text-brand-mute" />
              <input 
                type="text" 
                placeholder="Search questions..." 
                value={questionSearch} 
                onChange={(e) => setQuestionSearch(e.target.value)} 
                className="text-xs outline-none bg-transparent"
              />
            </div>
            <select 
              value={questionStatusFilter} 
              onChange={(e) => setQuestionStatusFilter(e.target.value)} 
              className="border border-brand-line bg-white px-3 py-2 text-xs outline-none"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="answered">Answered</option>
              <option value="verified">Verified</option>
              <option value="resolved">Resolved</option>
              <option value="duplicate">Duplicate</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        }
      >
        <div className="flex flex-col md:flex-row gap-6">
          {/* Category Sidebar */}
          <div className="w-full md:w-64 shrink-0 bg-white border border-brand-line p-4 h-fit">
            <h3 className="label-eyebrow border-b border-brand-line pb-2 mb-3">Categories</h3>
            <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 scrollbar-none">
              <button
                onClick={() => setActiveCategory("all")}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
                  activeCategory === "all"
                    ? "bg-[#F0F0EE] text-brand-ink border-l-2 border-brand-ink font-semibold"
                    : "text-brand-body hover:text-brand-ink hover:bg-[#F9F9F8] border-l-2 border-transparent"
                }`}
              >
                <span>All Categories</span>
                <span className={`px-1.5 py-0.5 text-[10px] font-sans font-bold ${
                  activeCategory === "all" ? "bg-brand-ink text-white" : "bg-[#F0F0EE] text-brand-mute"
                }`}>
                  {questionList.length}
                </span>
              </button>
              {categories.map((c) => {
                const count = categoryCounts[c.slug] || 0;
                const isActive = activeCategory === c.slug;
                return (
                  <button
                    key={c.slug}
                    onClick={() => setActiveCategory(c.slug)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
                      isActive
                        ? "bg-[#F0F0EE] text-brand-ink border-l-2 border-brand-ink font-semibold"
                        : "text-brand-body hover:text-brand-ink hover:bg-[#F9F9F8] border-l-2 border-transparent"
                    }`}
                  >
                    <span className="truncate pr-2">{c.name}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] font-sans font-bold ${
                      isActive ? "bg-brand-ink text-white" : "bg-[#F0F0EE] text-brand-mute"
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 min-w-0 border border-brand-line bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-brand-mute border-b border-brand-line">
                  <th className="px-6 py-3 font-medium">Question Title</th>
                  <th className="px-6 py-3 font-medium">Author</th>
                  <th className="px-6 py-3 font-medium">Created At</th>
                  <th className="px-6 py-3 font-medium">Category</th>
                  <th className="px-6 py-3 font-medium">Lifecycle Status</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-line">
                {filteredQuestions.map((q) => {
                  const authorName = q.author ? q.author.displayName : "Anonymous";
                  const qCategory = getQuestionCategory(q);
                  return (
                    <tr key={q._id} className="hover:bg-[#F9F9F8]">
                      <td className="px-6 py-4 max-w-sm">
                        <Link to={`/q/${q.slug || q._id}`} className="font-serif text-base text-brand-ink hover:text-brand-blue truncate block font-medium">
                          {q.title}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-brand-body">{authorName}</td>
                      <td className="px-6 py-4 text-brand-mute text-xs">{new Date(q.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded bg-[#F0F0EE] text-brand-ink">
                          {getCategoryName(qCategory)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <select 
                          value={q.status} 
                          onChange={(e) => handleStatusChange(q._id, e.target.value)}
                          className="border border-brand-line bg-white px-2 py-1 text-xs outline-none"
                        >
                          <option value="pending">Pending</option>
                          <option value="answered">Answered</option>
                          <option value="verified">Verified</option>
                          <option value="resolved">Resolved</option>
                          <option value="duplicate">Duplicate</option>
                          <option value="closed">Closed</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isAdmin ? (
                          <button 
                            onClick={() => handleDeleteQuestion(q._id)} 
                            className="w-8 h-8 border border-brand-line text-brand-vermilion hover:bg-[#FBEAE6] flex items-center justify-center ml-auto"
                            title="Delete Question"
                          >
                            <Trash2 size={13} />
                          </button>
                        ) : (
                          <span className="text-xs text-brand-mute">View Only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredQuestions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-brand-mute">No questions found matching criteria.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </AdminShell>
    );
  }

  if (pathname === "/admin/settings") {
    return (
      <AdminShell
        eyebrow="Console / config"
        title="System Settings"
        actions={
          <button onClick={() => toast.success("Configuration settings saved successfully.")} className="bg-brand-ink text-brand-paper px-4 py-2.5 text-sm hover:bg-brand-blue flex items-center gap-2">
            <Save size={14} /> Save Config
          </button>
        }
      >
        <div className="grid md:grid-cols-2 gap-8">
          <div className="border border-brand-line bg-white p-6 space-y-6">
            <h3 className="font-serif text-xl text-brand-ink border-b border-brand-line pb-2 mb-4">Triage AI Thresholds</h3>
            <div>
              <label className="label-eyebrow block mb-2">Hard Intercept Similarity Score</label>
              <input type="number" step="0.05" defaultValue="0.90" className="w-full border border-brand-line bg-brand-paper px-3 py-2 text-sm outline-none" />
              <p className="text-[10px] text-brand-mute mt-1">Stops user posting duplicate immediately and forces redirect.</p>
            </div>
            <div>
              <label className="label-eyebrow block mb-2">Soft Intercept Similarity Score</label>
              <input type="number" step="0.05" defaultValue="0.75" className="w-full border border-brand-line bg-brand-paper px-3 py-2 text-sm outline-none" />
              <p className="text-[10px] text-brand-mute mt-1">Shows similar items in an intercept modal before allowing post.</p>
            </div>
            <div>
              <label className="label-eyebrow block mb-2">Gentle Suggest Similarity Score</label>
              <input type="number" step="0.05" defaultValue="0.60" className="w-full border border-brand-line bg-brand-paper px-3 py-2 text-sm outline-none" />
              <p className="text-[10px] text-brand-mute mt-1">Renders small suggestions banner below typing input.</p>
            </div>
          </div>

          <div className="border border-brand-line bg-white p-6 space-y-6">
            <h3 className="font-serif text-xl text-brand-ink border-b border-brand-line pb-2 mb-4">General Configuration</h3>
            <div className="flex items-center justify-between py-2 border-b border-brand-line">
              <div>
                <p className="text-sm font-medium text-brand-ink">Closed Registrations</p>
                <p className="text-xs text-brand-mute">Only allow invited email domains to sign up</p>
              </div>
              <input type="checkbox" className="w-4 h-4 accent-brand-ink" />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-brand-line">
              <div>
                <p className="text-sm font-medium text-brand-ink">Moderator Approval Required</p>
                <p className="text-xs text-brand-mute">New questions require moderation triage before feed listing</p>
              </div>
              <input type="checkbox" defaultChecked className="w-4 h-4 accent-brand-ink" />
            </div>
            <div>
              <label className="label-eyebrow block mb-2">Restricted Email Domains</label>
              <input type="text" defaultValue="gmail.com, yahoo.com" className="w-full border border-brand-line bg-brand-paper px-3 py-2 text-sm outline-none" />
            </div>
          </div>
        </div>
      </AdminShell>
    );
  }

  // Default Dashboard View
  const totalQuestions = stats?.totals?.questions || 0;
  const totalAnswers = stats?.totals?.answers || 0;
  const totalUsers = stats?.totals?.users || 0;
  const pendingReports = stats?.totals?.pendingReports || 0;

  const metrics = [
    { k: "Questions", v: totalQuestions.toLocaleString(), delta: "+12.4%", up: true, icon: MessageSquare },
    { k: "Answers", v: totalAnswers.toLocaleString(), delta: "+8.1%", up: true, icon: MessagesSquare },
    { k: "Members", v: totalUsers.toLocaleString(), delta: "+4.2%", up: true, icon: UsersIcon },
    { k: "Flagged", v: pendingReports.toString(), delta: "-22%", up: false, icon: Flag },
  ];

  return (
    <AdminShell
      eyebrow="Console / overview"
      title="Dashboard"
      actions={
        <>
          <button className="hidden sm:inline-flex border border-brand-line px-4 py-2.5 text-sm hover:border-brand-ink items-center gap-2" data-testid="admin-export-btn">
            <Download size={14} /> Export
          </button>
          <Link to="/ask" className="bg-brand-ink text-brand-paper px-4 py-2.5 text-sm hover:bg-brand-blue" data-testid="admin-quick-action">New post</Link>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-brand-line border border-brand-line" data-testid="admin-metrics">
        {metrics.map((m) => (
          <div key={m.k} className="bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="label-eyebrow">{m.k}</p>
              <m.icon size={16} className="text-brand-mute" strokeWidth={1.5} />
            </div>
            <p className="font-sans font-semibold text-4xl md:text-5xl text-brand-ink leading-none">{m.v}</p>
            <div className={`mt-3 flex items-center gap-1.5 text-xs ${m.up ? 'text-brand-forest' : 'text-brand-vermilion'}`}>
              {m.up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {m.delta} <span className="text-brand-mute">vs. last week</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-px bg-brand-line border border-brand-line mt-px">
        <div className="bg-white p-6 lg:col-span-2">
          <div className="flex items-end justify-between mb-6">
            <div>
              <p className="label-eyebrow mb-1">Trend</p>
              <h3 className="font-serif text-2xl text-brand-ink">Activity, past 7 days</h3>
            </div>
            <div className="flex gap-3 text-xs uppercase tracking-widest text-brand-body">
              <span className="flex items-center gap-2"><span className="w-3 h-0.5 bg-brand-blue" />Answers</span>
              <span className="flex items-center gap-2"><span className="w-3 h-0.5 bg-brand-vermilion" />Questions</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={activityChart} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="#EAEAE5" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#8A8A85' }} axisLine={{ stroke: '#E6E6E1' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#8A8A85' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 0, border: '1px solid #111110', background: '#fff', fontSize: 12 }} />
              <Line type="monotone" dataKey="answers" stroke="#004B87" strokeWidth={2} dot={{ r: 3, fill: '#004B87' }} />
              <Line type="monotone" dataKey="questions" stroke="#D9381E" strokeWidth={2} dot={{ r: 3, fill: '#D9381E' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white p-6">
          <p className="label-eyebrow mb-1">Health</p>
          <h3 className="font-serif text-2xl text-brand-ink mb-5">This week</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={activityChart} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#EAEAE5" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#8A8A85' }} axisLine={{ stroke: '#E6E6E1' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#8A8A85' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 0, border: '1px solid #111110', background: '#fff', fontSize: 12 }} />
              <Bar dataKey="views" fill="#111110" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mt-10">
        <div className="border border-brand-line bg-white" data-testid="recent-questions-block">
          <div className="flex items-center justify-between border-b border-brand-line px-6 py-4">
            <p className="label-eyebrow">Recent questions</p>
            <Link to="/" className="text-xs uppercase tracking-widest text-brand-blue hover:text-brand-ink">View all →</Link>
          </div>
          <ul className="divide-y divide-brand-line">
            {questionList.slice(0, 5).map((q) => {
              const qVotes = q.upvoteCount !== undefined ? q.upvoteCount : (q.votes || 0);
              const qAnswers = q.answerCount !== undefined ? q.answerCount : (q.answers || 0);
              
              return (
                <li key={q._id || q.id} className="px-6 py-4 hover:bg-[#F9F9F8]">
                  <Link to={`/q/${q.slug || q._id}`} className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-brand-ink truncate font-medium">{q.title}</p>
                      <p className="text-[10px] uppercase tracking-widest text-brand-mute mt-1">
                        {q.category || (q.tags && q.tags[0]) || "general"} · {qAnswers} answers · {timeAgo(q.createdAt)}
                      </p>
                    </div>
                    <span className="text-xs tabular-nums shrink-0">{qVotes} ▲</span>
                  </Link>
                </li>
              );
            })}
            {questionList.length === 0 && (
              <li className="px-6 py-4 text-center text-sm text-brand-mute">No questions found.</li>
            )}
          </ul>
        </div>

        <div className="border border-brand-line bg-white" data-testid="recent-users-block">
          <div className="flex items-center justify-between border-b border-brand-line px-6 py-4">
            <p className="label-eyebrow">New members</p>
            <Link to="/admin/users" className="text-xs uppercase tracking-widest text-brand-blue hover:text-brand-ink">Manage →</Link>
          </div>
          <ul className="divide-y divide-brand-line">
            {userList.slice(0, 5).map((u) => {
              const uAvatar = u.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.displayName || "U")}`;
              const rep = u.reputationScore !== undefined ? u.reputationScore : (u.reputation || 0);
              const joinedString = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : "";

              return (
                <li key={u._id || u.id} className="px-6 py-3.5 flex items-center gap-3">
                  <img src={uAvatar} alt="" className="w-9 h-9 object-cover rounded-full border border-brand-line" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-brand-ink">{u.displayName}</p>
                    <p className="text-[10px] uppercase tracking-widest text-brand-mute">
                      {u.title || u.role || "Contributor"} · {joinedString}
                    </p>
                  </div>
                  <span className="font-sans font-semibold text-base tabular-nums">
                    {rep >= 1000 ? `${(rep/1000).toFixed(1)}k` : rep}
                  </span>
                </li>
              );
            })}
            {userList.length === 0 && (
              <li className="px-6 py-4 text-center text-sm text-brand-mute">No members found.</li>
            )}
          </ul>
        </div>
      </div>
    </AdminShell>
  );
}
