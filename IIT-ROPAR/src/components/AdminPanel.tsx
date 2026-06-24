import { fetchWithAuth } from "../utils/api.js";
import React, { useState, useEffect } from "react";
import { 
  BarChart2, Users, ShieldAlert, Layers, RefreshCw, FileText, CheckCircle2, XCircle, 
  Trash2, Mail, Award, ArrowUpRight, Check, AlertOctagon, Plus, Key, Clock
} from "lucide-react";
import { FAQItem } from "../types.js";
import { ModerationLog } from "../types.js";

interface AdminPanelProps {
  faqs: FAQItem[];
  onAddFAQ: (newFaq: FAQItem) => void;
  onDeleteFAQ: (id: string) => void;
  moderationLogs: ModerationLog[];
  setModerationLogs: React.Dispatch<React.SetStateAction<ModerationLog[]>>;
  currentUser: any;
}

export default function AdminPanel({ 
  faqs, 
  onAddFAQ, 
  onDeleteFAQ,
  moderationLogs,
  setModerationLogs,
  currentUser
}: AdminPanelProps) {
  
  // Local admin views & datasets from Server
  const [adminSubTab, setAdminSubTab] = useState<"tickets" | "answers" | "users" | "faqs" | "emails">("tickets");
  const [tickets, setTickets] = useState<any[]>([]);
  const [pendingAnswers, setPendingAnswers] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [mailLogs, setMailLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tickerSuccessMsg, setTickerSuccessMsg] = useState("");

  // FAQ Add Form States
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("MERN Course");
  const [newTagsString, setNewTagsString] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const adminCategories = [
    "MERN Course",
    "AI Fundamentals",
    "Internship",
    "Certificate",
    "Stipend",
    "Technical Issue",
    "Other"
  ];

  // Fetch administrator workspace statistics
  const fetchAdminWorkspaceData = async () => {
    setLoading(true);
    try {
      // 1. Fetch tickets
      const tRes = await fetchWithAuth("/api/tickets");
      if (tRes.ok) {
        const tObj = await tRes.json();
        setTickets(tObj.tickets || []);
      }

      // 2. Fetch community answers
      const cRes = await fetchWithAuth("/api/community-answers");
      if (cRes.ok) {
        const cObj = await cRes.json();
        setPendingAnswers(cObj.communityAnswers || []);
      }

      // 3. Fetch users list, logs and stats
      const aRes = await fetchWithAuth("/api/admin/logs");
      if (aRes.ok) {
        const aObj = await aRes.json();
        setUsersList(aObj.usersList || []);
        setMailLogs(aObj.mailLogs || []);
      }
    } catch (err) {
      console.error("Failed to fetch admin workspace dataset", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminWorkspaceData();
  }, [adminSubTab]);

  // Update ticket status
  const handleUpdateTicketStatus = async (ticketId: string, nextStatus: string) => {
    try {
      const response = await fetchWithAuth(`/api/tickets/${ticketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      if (response.ok) {
        setTickerSuccessMsg(`Ticket ${ticketId} successfully marked as '${nextStatus}'`);
        setTimeout(() => setTickerSuccessMsg(""), 3000);
        fetchAdminWorkspaceData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Moderated Proposed FAQ Answers
  const handleModerateAnswer = async (answerId: string, decision: "Approved" | "Rejected") => {
    try {
      const response = await fetchWithAuth(`/api/community-answers/${answerId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: decision })
      });
      if (response.ok) {
        setTickerSuccessMsg(`Community FAQ answer ${decision === "Approved" ? "APPROVED and XP granted!" : "REJECTED"}`);
        setTimeout(() => setTickerSuccessMsg(""), 3000);
        fetchAdminWorkspaceData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Add FAQ form submit handler
  const handleAddFaqSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !newAnswer.trim()) return;

    try {
      const response = await fetchWithAuth("/api/faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: selectedCategory,
          question: newQuestion,
          answer: newAnswer,
          tags: newTagsString.split(",").map(t => t.trim()).filter(t => t.length > 0)
        })
      });

      if (response.ok) {
        const data = await response.json();
        onAddFAQ(data.faq);
        setNewQuestion("");
        setNewAnswer("");
        setNewTagsString("");
        setShowAddForm(false);
        setTickerSuccessMsg("New system FAQ successfully published!");
        setTimeout(() => setTickerSuccessMsg(""), 3000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Metrics Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass p-4 rounded-xl flex items-center justify-between border border-white/5 shadow-md">
          <div>
            <span className="text-[9px] font-mono font-bold text-slate-500 block uppercase border-b border-white/5 pb-1 mb-1">TOTAL COHORT USERS</span>
            <span className="text-2xl font-bold font-sans text-white">{usersList.length || 2}</span>
          </div>
          <Users className="h-6 w-6 text-purple-400/40" />
        </div>

        <div className="glass p-4 rounded-xl flex items-center justify-between border border-white/5 shadow-md">
          <div>
            <span className="text-[9px] font-mono font-bold text-slate-500 block uppercase border-b border-white/5 pb-1 mb-1">OPEN TICKETS</span>
            <span className="text-2xl font-bold font-sans text-white">
              {tickets.filter(t => t.status === "Open" || t.status === "In Review").length}
            </span>
          </div>
          <FileText className="h-6 w-6 text-amber-400/40" />
        </div>

        <div className="glass p-4 rounded-xl flex items-center justify-between border border-white/5 shadow-md">
          <div>
            <span className="text-[9px] font-mono font-bold text-slate-500 block uppercase border-b border-white/5 pb-1 mb-1">PROPOSED QA REVIEW</span>
            <span className="text-2xl font-bold font-sans text-white">
              {pendingAnswers.filter(a => a.status === "Pending Review").length}
            </span>
          </div>
          <Award className="h-6 w-6 text-cyan-400/40" />
        </div>

        <div className="glass p-4 rounded-xl flex items-center justify-between border border-white/5 shadow-md">
          <div>
            <span className="text-[9px] font-mono font-bold text-slate-500 block uppercase border-b border-white/5 pb-1 mb-1">SYSTEM GROUNDINGS</span>
            <span className="text-2xl font-bold font-sans text-white">{faqs.length}</span>
          </div>
          <Layers className="h-6 w-6 text-purple-400/40" />
        </div>
      </div>

      {/* Admin Workspaces Hub Tabs */}
      <div className="flex overflow-x-auto gap-1 border-b border-white/5 pb-1">
        {[
          { id: "tickets", label: `Ticket Queue (${tickets.length})` },
          { id: "answers", label: `Filter Community QA (${pendingAnswers.filter(a => a.status === "Pending Review").length})` },
          { id: "users", label: `Registered Interns (${usersList.length})` },
          { id: "faqs", label: "Manage Grounding faqs" },
          { id: "emails", label: `Simulated Mail Logs (${mailLogs.length})` }
        ].map(tb => (
          <button
            key={tb.id}
            onClick={() => setAdminSubTab(tb.id as any)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer whitespace-nowrap ${
              adminSubTab === tb.id 
                ? "bg-purple-500/10 border-purple-500/30 text-purple-300" 
                : "bg-transparent border-transparent text-slate-400 hover:text-white"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Success alert */}
      {tickerSuccessMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-400 flex items-center space-x-2">
          <CheckCircle2 className="h-4 w-4" />
          <span>{tickerSuccessMsg}</span>
        </div>
      )}

      {/* Tab Contents */}
      <div className="glass rounded-2xl p-5 border border-white/5 min-h-[300px]">
        {loading && (
          <div className="flex items-center justify-center py-10 space-x-2 text-xs text-slate-400 font-mono">
            <RefreshCw className="h-4 w-4 animate-spin text-purple-400" />
            <span>Syncing Admin Ledger...</span>
          </div>
        )}

        {!loading && (
          <div>
            {/* =====================================
                TAB: TICKETS QUEUE
               ===================================== */}
            {adminSubTab === "tickets" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-1">
                  <div>
                    <h3 className="text-white text-sm font-bold font-sans">Active Support Incident Escalation Pool</h3>
                    <p className="text-xs text-slate-400">Moderators can routing priority tags, re-assign tickets and verify resolutions.</p>
                  </div>
                </div>

                {tickets.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-500">No student complaints are currently active in the directory.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {tickets.map(ticket => (
                      <div key={ticket.id} className="p-4 rounded-xl border border-white/5 bg-[#0A0A0F] space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-mono text-[9px] text-purple-400 font-bold block">{ticket.id}</span>
                            <span className="text-[10px] text-slate-400 font-bold font-sans mt-0.5 block">Student: {ticket.studentName} ({ticket.studentEmail})</span>
                          </div>
                          
                          <select
                            value={ticket.status}
                            onChange={(e) => handleUpdateTicketStatus(ticket.id, e.target.value)}
                            className="bg-black/40 border border-white/10 text-[10px] text-slate-300 font-mono px-2 py-1 rounded cursor-pointer"
                          >
                            <option value="Open">Open</option>
                            <option value="In Review">In Review</option>
                            <option value="Resolved">Resolved</option>
                            <option value="Closed">Closed</option>
                          </select>
                        </div>

                        <div>
                          <h4 className="text-white text-xs font-bold leading-normal">{ticket.title}</h4>
                          <p className="text-[11px] text-slate-400 leading-relaxed mt-1">{ticket.description}</p>
                        </div>

                        <div className="flex justify-between items-center text-[10px] font-mono border-t border-white/5 pt-2.5 mt-2 text-slate-500">
                          <span>Priority: <span className={`${ticket.priority === "High" ? "text-red-400" : "text-slate-400"}`}>{ticket.priority}</span></span>
                          <span>Category: <span className="text-purple-300">{ticket.category}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* =====================================
                TAB: NEW COMMUNITY ANSWER REVIEWS
               ===================================== */}
            {adminSubTab === "answers" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-white text-sm font-bold font-sans">Crowdsourced Q&A Verification Portal</h3>
                  <p className="text-xs text-slate-400">Review student proposed responses. Approved responses publish instantly, awarding 40 XP.</p>
                </div>

                {pendingAnswers.filter(a => a.status === "Pending Review").length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-500">No community answer submissions currently pending admin approval.</div>
                ) : (
                  <div className="space-y-3.5">
                    {pendingAnswers.filter(a => a.status === "Pending Review").map(ans => {
                      const relatedFaq = faqs.find(f => f.id === ans.faqId);
                      return (
                        <div key={ans.id} className="p-4 rounded-xl border border-white/10 bg-[#07070B] space-y-3">
                          <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <div>
                              <span className="text-[10px] font-mono text-cyan-400">FAQ: {ans.faqId}</span>
                              <p className="text-[10px] text-slate-400 font-bold">Proposed by: {ans.studentName} ({ans.studentEmail})</p>
                            </div>
                            
                            <div className="flex space-x-2.5">
                              <button
                                onClick={() => handleModerateAnswer(ans.id, "Rejected")}
                                className="px-2.5 py-1 text-[10px] rounded border border-red-500/25 text-red-400 hover:bg-red-500 hover:text-white transition cursor-pointer"
                              >
                                Reject
                              </button>
                              
                              <button
                                onClick={() => handleModerateAnswer(ans.id, "Approved")}
                                className="px-3 py-1 text-[10px] rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition cursor-pointer"
                              >
                                Approve & award 40 XP
                              </button>
                            </div>
                          </div>

                          {relatedFaq && (
                            <p className="text-xs text-slate-350 font-bold leading-normal">
                              Q: {relatedFaq.question}
                            </p>
                          )}

                          <blockquote className="text-xs italic bg-white/[0.01] p-3 border-l bg-black/30 text-slate-300 rounded leading-relaxed font-sans">
                            &ldquo;{ans.answer}&rdquo;
                          </blockquote>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* =====================================
                TAB: REGISTERED INTERNS SCHEDULER
               ===================================== */}
            {adminSubTab === "users" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-white text-sm font-bold font-sans">Summer Cohort Directory Ledger</h3>
                  <p className="text-xs text-slate-400">View performance metrics, compliance badges, and user system registers.</p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-left text-xs divide-y divide-white/5 leading-relaxed font-sans">
                    <thead>
                      <tr className="bg-[#05050C] text-slate-400 text-[10px] font-mono uppercase tracking-wider">
                        <th className="p-3">Intern Details</th>
                        <th className="p-3">ID Stamp</th>
                        <th className="p-3">University</th>
                        <th className="p-3">Status</th>
                        <th className="p-[#C084FC] p-3 text-right">XP score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 bg-[#0F0F12]/10">
                      {usersList.map((usr, i) => (
                        <tr key={i} className="hover:bg-white/[0.02] text-slate-300">
                          <td className="p-3">
                            <span className="font-bold block text-white">{usr.name}</span>
                            <span className="font-mono text-[10px] text-slate-500">{usr.email}</span>
                          </td>
                          <td className="p-3 font-mono">{usr.studentId}</td>
                          <td className="p-3">{usr.college}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold ${
                              usr.isVerified ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-500"
                            }`}>
                              {usr.isVerified ? "VERIFIED" : "UNVERIFIED"}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-purple-400">{usr.contributionScore} SP</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* =====================================
                TAB: FAQS MANAGER
               ===================================== */}
            {adminSubTab === "faqs" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                  <div>
                    <h3 className="text-white text-sm font-bold font-sans">Manage Static Groundings</h3>
                    <p className="text-xs text-slate-400">Directly override answers and insert tags to align automated chatbot responses.</p>
                  </div>
                  
                  <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white cursor-pointer"
                  >
                    {showAddForm ? "Fold Creator form" : "Create New FAQ Slot"}
                  </button>
                </div>

                {showAddForm && (
                  <form onSubmit={handleAddFaqSubmit} className="space-y-4 bg-purple-950/5 border border-purple-500/20 p-4 rounded-xl">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-slate-400 block font-bold">Category</label>
                        <select
                          value={selectedCategory}
                          onChange={(e) => setSelectedCategory(e.target.value)}
                          className="w-full bg-[#07070B] border border-white/15 text-xs text-slate-355 rounded p-2 focus:outline-none"
                        >
                          {adminCategories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-slate-400 block font-bold">Tags</label>
                        <input
                          type="text"
                          value={newTagsString}
                          onChange={(e) => setNewTagsString(e.target.value)}
                          placeholder="comma, separated, labels"
                          className="w-full bg-[#07070B] border border-white/15 text-xs text-white rounded p-2 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-slate-400 block font-bold">Expected Student Question</label>
                      <input
                        type="text"
                        value={newQuestion}
                        onChange={(e) => setNewQuestion(e.target.value)}
                        placeholder="e.g. When will stipends clear?"
                        className="w-full bg-[#07070B] border border-white/15 text-xs text-white rounded p-2"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-slate-400 block font-bold">Grounding Answer Body</label>
                      <textarea
                        value={newAnswer}
                        onChange={(e) => setNewAnswer(e.target.value)}
                        placeholder="Detailed response..."
                        rows={3}
                        className="w-full bg-[#07070B] border border-white/15 text-xs text-white rounded p-2"
                        required
                      />
                    </div>

                    <button type="submit" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white rounded cursor-pointer">
                      Publish Question
                    </button>
                  </form>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[350px] overflow-y-auto">
                  {faqs.map(faq => (
                    <div key={faq.id} className="p-3 rounded-xl border border-white/5 bg-black/45 flex justify-between items-start">
                      <div>
                        <div className="flex gap-2">
                          <span className="font-mono text-[9px] text-cyan-400 bg-cyan-950/20 px-1 border border-cyan-500/10 rounded">{faq.category}</span>
                          <span className="font-mono text-[9px] text-slate-500">{faq.id}</span>
                        </div>
                        <h4 className="text-white text-xs font-bold mt-1.5">{faq.question}</h4>
                        <p className="text-[11px] text-slate-400 mt-1 lines-clamp-2">{faq.answer}</p>
                      </div>
                      
                      <button 
                        onClick={() => onDeleteFAQ(faq.id)}
                        className="p-1 px-1.5 bg-red-950/20 text-red-400 hover:bg-red-500 hover:text-white rounded ml-2"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* =====================================
                TAB: SYSTEM EMAIL DISPATCH LOGS
               ===================================== */}
            {adminSubTab === "emails" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-white text-sm font-bold font-sans">Simulated Mail Dispatch Records</h3>
                  <p className="text-xs text-slate-400">Auditing historical email triggers (Nodemailer mock transporter outputs).</p>
                </div>

                <div className="space-y-3 max-h-[400px] overflow-y-auto font-mono text-[11px]">
                  {mailLogs.map(mail => (
                    <div key={mail.id} className="p-3.5 rounded-xl border border-white/5 bg-black/40 space-y-2">
                      <div className="flex justify-between text-slate-500 text-[10px]">
                        <span>To: <span className="text-slate-300">{mail.to}</span></span>
                        <span>{mail.timestamp}</span>
                      </div>
                      
                      <div className="text-slate-200">
                        <strong>Subject:</strong> {mail.subject}
                      </div>

                      <pre className="text-[10px] bg-black/30 p-2.5 rounded border border-white/5 text-slate-400 whitespace-pre-line leading-relaxed">
                        {mail.body}
                      </pre>

                      <div className="text-emerald-400 text-[9px] font-bold text-right uppercase tracking-wider block pt-1">
                        {mail.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
