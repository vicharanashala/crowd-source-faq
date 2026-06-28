import { PageShell } from "@/components/layout/PageShell";
import { activityChart, topicSearches, questions, users } from "@/lib/mockData";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, Legend } from "recharts";
import { Eye, TrendingUp, Search, Users as UsersIcon } from "lucide-react";

const engagement = [
  { name: 'Engineering', value: 38 },
  { name: 'Product', value: 18 },
  { name: 'Data', value: 14 },
  { name: 'Design', value: 12 },
  { name: 'Security', value: 10 },
  { name: 'Other', value: 8 },
];
const colors = ['#111110', '#004B87', '#D9381E', '#1B4D3E', '#E5A910', '#8A8A85'];

export default function Analytics() {
  const mostViewed = [...questions].sort((a, b) => b.views - a.views).slice(0, 6);
  const topContributors = [...users].sort((a, b) => b.reputation - a.reputation);

  return (
    <PageShell>
      <section className="border-b border-brand-line">
        <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-12 md:py-16">
          <p className="label-eyebrow mb-3">Analytics — Vol. 01 / Feb 2026</p>
          <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl text-brand-ink leading-none tracking-tight">The library, by the numbers.</h1>
          <p className="text-brand-body text-base md:text-lg mt-5 max-w-2xl">A snapshot of what the community asked, answered, read, and shared this month.</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-brand-line border border-brand-line mb-px" data-testid="analytics-stats">
          {[
            { k: "Total views", v: "184,902", icon: Eye },
            { k: "Searches", v: "21,440", icon: Search },
            { k: "Active members", v: "1,604", icon: UsersIcon },
            { k: "Engagement", v: "+4.2%", icon: TrendingUp },
          ].map((s) => (
            <div key={s.k} className="bg-white p-6">
              <s.icon size={16} className="text-brand-mute mb-3" strokeWidth={1.5} />
              <p className="font-sans font-semibold text-4xl text-brand-ink leading-none">{s.v}</p>
              <p className="label-eyebrow mt-3">{s.k}</p>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-px bg-brand-line border border-brand-line">
          <div className="bg-white p-6 lg:col-span-2">
            <p className="label-eyebrow mb-1">Engagement</p>
            <h3 className="font-serif text-2xl text-brand-ink mb-6">Views over time</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={activityChart} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="viewArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#004B87" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#004B87" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#EAEAE5" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#8A8A85' }} axisLine={{ stroke: '#E6E6E1' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#8A8A85' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 0, border: '1px solid #111110', background: '#fff', fontSize: 12 }} />
                <Area type="monotone" dataKey="views" stroke="#004B87" strokeWidth={2} fill="url(#viewArea)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-6">
            <p className="label-eyebrow mb-1">Distribution</p>
            <h3 className="font-serif text-2xl text-brand-ink mb-6">By category</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={engagement} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} stroke="#fff" strokeWidth={2}>
                  {engagement.map((_, i) => <Cell key={i} fill={colors[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 0, border: '1px solid #111110', background: '#fff', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3 text-xs">
              {engagement.map((e, i) => (
                <li key={e.name} className="flex items-center gap-2 text-brand-body">
                  <span className="w-2.5 h-2.5" style={{ background: colors[i] }} /> {e.name}
                  <span className="ml-auto text-brand-mute">{e.value}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-px bg-brand-line border-x border-b border-brand-line">
          <div className="bg-white p-6">
            <p className="label-eyebrow mb-1">Most searched</p>
            <h3 className="font-serif text-2xl text-brand-ink mb-6">Topics this month</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topicSearches} layout="vertical" margin={{ top: 5, right: 10, left: 40, bottom: 0 }}>
                <CartesianGrid stroke="#EAEAE5" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#8A8A85' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="topic" tick={{ fontSize: 11, fill: '#111110' }} axisLine={false} tickLine={false} width={90} />
                <Tooltip contentStyle={{ borderRadius: 0, border: '1px solid #111110', background: '#fff', fontSize: 12 }} />
                <Bar dataKey="searches" fill="#111110" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-6">
            <p className="label-eyebrow mb-1">Most viewed</p>
            <h3 className="font-serif text-2xl text-brand-ink mb-6">Questions, all time</h3>
            <ol className="space-y-3">
              {mostViewed.map((q, i) => (
                <li key={q.id} className="flex items-start gap-4 border-b border-brand-line pb-3 last:border-b-0">
                  <span className="font-sans font-semibold text-2xl text-brand-mute w-8">{String(i + 1).padStart(2, '0')}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-serif text-base text-brand-ink leading-snug line-clamp-2">{q.title}</p>
                    <p className="text-[10px] uppercase tracking-widest text-brand-mute mt-1">{q.views.toLocaleString()} views · {q.answers} answers</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="border border-brand-line bg-white mt-10" data-testid="top-contributors-block">
          <div className="flex items-center justify-between border-b border-brand-line px-6 py-4">
            <div>
              <p className="label-eyebrow">Top contributors</p>
              <h3 className="font-serif text-2xl text-brand-ink mt-1">By reputation, this volume</h3>
            </div>
            <span className="text-xs uppercase tracking-widest text-brand-mute">Snapshot · Feb 2026</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-brand-mute text-xs uppercase tracking-widest border-b border-brand-line">
                  <th className="px-6 py-3 font-medium">#</th>
                  <th className="px-6 py-3 font-medium">Contributor</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                  <th className="px-6 py-3 font-medium text-right">Reputation</th>
                  <th className="px-6 py-3 font-medium text-right">Trend</th>
                </tr>
              </thead>
              <tbody>
                {topContributors.map((u, i) => (
                  <tr key={u.id} className="border-b border-brand-line last:border-b-0 hover:bg-[#F9F9F8]">
                    <td className="px-6 py-4 font-sans font-medium text-base text-brand-mute">{String(i + 1).padStart(2, '0')}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img src={u.avatar} alt="" className="w-8 h-8 object-cover" />
                        <div>
                          <p className="text-brand-ink">{u.name}</p>
                          <p className="text-[10px] text-brand-mute uppercase tracking-widest">{u.handle}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-brand-body">{u.title}</td>
                    <td className="px-6 py-4 text-right font-sans font-semibold text-base tabular-nums">{u.reputation.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-brand-forest text-xs">+{(Math.random() * 4 + 1).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
