import { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
} from 'recharts';

const SKILL_OPTIONS = [
  'React', 'Node.js', 'Python', 'MongoDB', 'Express', 'JavaScript', 'TypeScript',
  'AI/LLM', 'Machine Learning', 'Vite', 'Firebase', 'Tailwind CSS', 'Vector Search',
  'Docker', 'AWS', 'REST APIs', 'GraphQL', 'SQL', 'Data Analysis', 'ETL Pipelines',
  'Socket.IO', 'Three.js', 'Game Logic', 'OCR', 'PDF Generation', 'Cron Jobs',
  'JWT Auth', 'Google Cloud', 'HTML', 'CSS', 'UI/UX', 'NLP', 'TensorFlow',
];

const DOMAIN_OPTIONS = [
  { name: 'EdTech', desc: 'Adaptive learning and interactive platforms.' },
  { name: 'Data Analytics', desc: 'Pipelines, dashboards, and insights.' },
  { name: 'Community Platform', desc: 'Forums, Q&A, and user reputation systems.' },
  { name: 'AgriTech', desc: 'AI-driven solutions for agriculture.' },
  { name: 'AI Assessment', desc: 'AI proctoring and adaptive testing.' },
  { name: 'Full-Stack', desc: 'Complete web application development.' },
];

const CHART_COLORS = [
  'rgb(var(--accent-rgb))',
  '#6b7280',
  '#9ca3af',
  '#374151',
  '#d1d5db',
  '#111827',
];

type Role = { title: string; skillsRequired: string[] };
type SkillScope = { skill: string; value: number };
type MatchResult = {
  id: string;
  title: string;
  description: string;
  domain: string;
  repoLink: string;
  roles: Role[];
  matchPercentage: number;
  matchedSkillsCount: number;
  skillScope: SkillScope[];
};
type DomainSlice = { name: string; count: number };

export const FindMatch = () => {
  const [step, setStep] = useState(1);
  const [skills, setSkills] = useState<string[]>([]);
  const [domain, setDomain] = useState('');
  const [results, setResults] = useState<MatchResult[]>([]);
  const [allProjects, setAllProjects] = useState<{ domain?: string }[]>([]);
  const [domainDistribution, setDomainDistribution] = useState<DomainSlice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await api.get('/projects');
        if (Array.isArray(res.data)) setAllProjects(res.data);
        else setAllProjects([]);
      } catch {
        setAllProjects([]);
      }
    };
    fetchProjects();
  }, []);

  const catalogDomainData = useMemo(() => {
    if (domainDistribution.length > 0) return domainDistribution;
    const counts = new Map<string, number>();
    for (const project of allProjects) {
      const name = project.domain || 'Other';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [allProjects, domainDistribution]);

  const rankingBars = useMemo(
    () => results.map((match) => ({ name: match.title, fit: match.matchPercentage })),
    [results],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/projects/match', {
        selectedSkills: skills,
        preferredDomain: domain,
      });
      setResults(Array.isArray(data?.matches) ? data.matches : []);
      setDomainDistribution(Array.isArray(data?.domainDistribution) ? data.domainDistribution : []);
      setStep(3);
    } catch (err) {
      console.error('Error:', err);
      setError('Failed to find matches. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setResults([]);
    setDomainDistribution([]);
    setStep(1);
    setSkills([]);
    setDomain('');
    setError('');
  };

  return (
    <div className="max-w-5xl mx-auto p-6 text-ink">
      <h1 className="text-3xl font-bold mb-2">Find your project match</h1>
      <p className="text-ink-soft mb-6 text-sm">
        We score every intern project against your skills and domain — including close
        (fuzzy) matches — and always surface the three strongest fits.
      </p>

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-xl">Select your strongest skills</h2>
          <div className="flex flex-wrap gap-2">
            {SKILL_OPTIONS.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={() => setSkills((prev) => (prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]))}
                className={`px-4 py-2 rounded-full border transition-all duration-200 ${
                  skills.includes(skill)
                    ? 'bg-accent text-accent-text border-accent scale-105 shadow-md'
                    : 'bg-card text-ink border-border/70 hover:border-accent/60'
                }`}
              >
                {skill}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={skills.length === 0}
            className="bg-accent text-accent-text px-6 py-2 rounded-full disabled:opacity-50 transition-all hover:scale-105"
          >
            Next
          </button>
        </div>
      )}

      {step === 2 && (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <h2 className="text-xl">Select your preferred domain</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {DOMAIN_OPTIONS.map((dom) => (
              <button
                key={dom.name}
                type="button"
                onClick={() => setDomain(dom.name)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  domain === dom.name
                    ? 'bg-accent text-accent-text border-accent'
                    : 'bg-card text-ink border-border/70 hover:border-accent/60'
                }`}
              >
                <span className="font-bold block">{dom.name}</span>
                <span className="text-sm opacity-70">{dom.desc}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || !domain}
              className="bg-accent text-accent-text px-6 py-2 rounded-full disabled:opacity-50 transition-all hover:scale-105"
            >
              {loading ? 'Analyzing...' : 'Analyze matches'}
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-6 py-2 rounded-full border border-border/70 text-ink hover:border-accent/60 transition-all"
            >
              Back
            </button>
          </div>
          {error && <p className="text-red-500">{error}</p>}
        </form>
      )}

      {step === 3 && (
        <div className="space-y-8">
          <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
            <h2 className="text-2xl font-bold">Your top 3 fits</h2>
            <button
              type="button"
              onClick={handleRetry}
              className="px-4 py-2 rounded-full border border-border/70 text-ink hover:border-accent/60 transition-all"
            >
              Retry again
            </button>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-10 bg-card border border-border/70 rounded-xl">
              <p className="text-lg mb-2">The match catalog is empty.</p>
              <p className="text-sm text-ink-soft">Seed intern projects, then retry the analysis.</p>
            </div>
          ) : (
            <>
              {catalogDomainData.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-border/70 rounded-xl p-6 bg-card">
                    <h3 className="font-semibold mb-1">Internship mix by domain</h3>
                    <p className="text-xs text-ink-soft mb-3">Share of projects in the current catalog.</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={catalogDomainData}
                          dataKey="count"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={80}
                          paddingAngle={2}
                          strokeWidth={0}
                        >
                          {catalogDomainData.map((_, index) => (
                            <Cell key={catalogDomainData[index].name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="border border-border/70 rounded-xl p-6 bg-card">
                    <h3 className="font-semibold mb-1">Predicted fit vs your profile</h3>
                    <p className="text-xs text-ink-soft mb-3">Higher is a closer skill + domain match.</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={rankingBars} layout="vertical" margin={{ left: 16, right: 16 }}>
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="fit" radius={[0, 8, 8, 0]}>
                          {rankingBars.map((_, index) => (
                            <Cell key={rankingBars[index].name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                {results.map((match, index) => {
                  const radarData =
                    (match.skillScope?.length ? match.skillScope : skills.map((skill) => ({ skill, value: 0 })));
                  return (
                    <div key={String(match.id)} className="border border-border/70 rounded-xl p-6 bg-card shadow-sm">
                      <div className="flex justify-between items-start mb-4 gap-4">
                        <div>
                          <h3 className="text-xl font-bold mb-1">#{index + 1} {match.title}</h3>
                          <p className="text-sm text-ink-soft mb-2">{match.description}</p>
                          <div className="flex flex-wrap gap-2 mb-2">
                            <span className="bg-accent/10 text-accent text-xs px-2 py-1 rounded-full font-bold">
                              {match.matchPercentage}% predicted fit
                            </span>
                            <span className="bg-card border border-border/70 text-xs px-2 py-1 rounded-full">
                              {match.matchedSkillsCount} skills with real scope
                            </span>
                            <span className="bg-card border border-border/70 text-xs px-2 py-1 rounded-full">{match.domain}</span>
                          </div>
                        </div>
                        {match.repoLink && (
                          <a href={match.repoLink} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-sm shrink-0">
                            View repo
                          </a>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="font-semibold text-sm mb-3">Skill coverage on this project</h4>
                          <ResponsiveContainer width="100%" height={220}>
                            <RadarChart data={radarData}>
                              <PolarGrid />
                              <PolarAngleAxis dataKey="skill" tick={{ fontSize: 10 }} />
                              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                              <Radar name="Coverage" dataKey="value" stroke="rgb(var(--accent-rgb))" fill="rgb(var(--accent-rgb))" fillOpacity={0.35} />
                              <Tooltip />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm mb-3">Roles you could grow into</h4>
                          {(match.roles ?? []).map((role) => (
                            <div key={role.title} className="text-sm mb-2">
                              <span className="font-medium">• {role.title}</span>
                              <span className="text-ink-faint"> (Requires: {(role.skillsRequired ?? []).join(', ')})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
