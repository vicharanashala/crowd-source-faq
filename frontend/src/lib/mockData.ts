export const categories = [
  { slug: 'engineering', name: 'Engineering', description: 'System design, debugging, infra, code review.', count: 1248, top: ['react', 'kubernetes', 'python'] },
  { slug: 'product', name: 'Product', description: 'PRDs, roadmaps, prioritization frameworks.', count: 642, top: ['roadmap', 'okrs', 'discovery'] },
  { slug: 'design', name: 'Design', description: 'UX research, design systems, accessibility.', count: 487, top: ['figma', 'tokens', 'a11y'] },
  { slug: 'people-ops', name: 'People Ops', description: 'Hiring, onboarding, performance, policy.', count: 311, top: ['onboarding', 'pto', 'reviews'] },
  { slug: 'finance', name: 'Finance', description: 'Reimbursements, expenses, payroll, taxes.', count: 254, top: ['reimburse', 'tax', 'invoice'] },
  { slug: 'security', name: 'Security', description: 'Access, secrets, compliance, audits.', count: 198, top: ['sso', 'soc2', 'iam'] },
  { slug: 'data', name: 'Data & Analytics', description: 'Dashboards, SQL, warehousing, ETL.', count: 419, top: ['sql', 'dbt', 'looker'] },
  { slug: 'support', name: 'Customer Support', description: 'Tickets, scripts, escalation paths.', count: 277, top: ['sla', 'macros', 'zendesk'] },
  { slug: 'legal', name: 'Legal', description: 'Contracts, NDAs, IP, compliance.', count: 132, top: ['nda', 'msa', 'gdpr'] },
];

export const users = [
  { id: 'u1', name: 'Mira Halverson', handle: 'mira.h', title: 'Staff Engineer', avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&q=80', reputation: 18420, joined: 'Mar 2022' },
  { id: 'u2', name: 'Daniel Okafor', handle: 'okafor', title: 'Design Systems Lead', avatar: 'https://images.unsplash.com/photo-1521119989659-a83eee488004?w=200&q=80', reputation: 12880, joined: 'Aug 2021' },
  { id: 'u3', name: 'Aiko Tanaka', handle: 'aiko.t', title: 'Product Manager', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&q=80', reputation: 9461, joined: 'Jan 2023' },
  { id: 'u4', name: 'Rafael Costa', handle: 'rafa', title: 'Data Engineer', avatar: 'https://images.pexels.com/photos/12396627/pexels-photo-12396627.jpeg?auto=compress&w=200', reputation: 7203, joined: 'Jun 2022' },
  { id: 'u5', name: 'Priya Raghavan', handle: 'priya.r', title: 'Security Engineer', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&q=80', reputation: 5611, joined: 'Nov 2023' },
  { id: 'u6', name: 'Henrik Vossen', handle: 'henrik', title: 'People Ops Manager', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80', reputation: 4203, joined: 'Feb 2024' },
];

export const questions = [
  {
    id: 'q-001',
    slug: 'how-to-rotate-aws-iam-keys-without-downtime',
    title: 'How do we rotate AWS IAM access keys for service accounts without downtime?',
    body: "We have ~40 service accounts that consume AWS keys baked into config maps. We want to move to a 90-day rotation policy. What is the right pattern to rotate keys with zero downtime, ideally without touching Kubernetes deployments?",
    excerpt: 'We have ~40 service accounts that consume AWS keys baked into config maps. Looking for the right rotation pattern with zero downtime.',
    author: 'u5',
    votes: 142,
    answers: 4,
    views: 5482,
    status: 'verified',
    category: 'security',
    tags: ['aws', 'iam', 'rotation', 'kubernetes'],
    createdAt: '2026-02-04T10:22:00Z',
  },
  {
    id: 'q-002',
    slug: 'recommended-pattern-for-feature-flag-cleanup',
    title: 'Recommended pattern for cleaning up stale feature flags across a 2M LOC codebase?',
    excerpt: 'Our flag system is sprawling. Looking for an internal policy others have shipped that actually gets engineers to remove dead flags.',
    body: 'Our flag system has grown to ~1,400 flags, and a recent audit showed ~38% are dead. Looking for an enforceable policy.',
    author: 'u1',
    votes: 98,
    answers: 7,
    views: 3120,
    status: 'answered',
    category: 'engineering',
    tags: ['feature-flags', 'tech-debt', 'process'],
    createdAt: '2026-02-08T14:55:00Z',
  },
  {
    id: 'q-003',
    slug: 'onboarding-engineer-first-30-days',
    title: 'What does a great engineering onboarding plan look like for the first 30 days?',
    excerpt: 'I am building our first formal 30-60-90 onboarding. Curious how other teams structure the first month.',
    body: 'I am building our first formal 30-60-90 onboarding. Curious how other teams structure the first month, what artifacts are required, and what mistakes to avoid.',
    author: 'u6',
    votes: 67,
    answers: 3,
    views: 2104,
    status: 'answered',
    category: 'people-ops',
    tags: ['onboarding', '30-60-90', 'culture'],
    createdAt: '2026-02-10T09:10:00Z',
  },
  {
    id: 'q-004',
    slug: 'design-tokens-naming-convention',
    title: 'What naming convention do you use for design tokens across light and dark themes?',
    excerpt: 'We are scaling our token system to support 4 themes. Looking for a battle-tested naming approach.',
    body: 'We are scaling our token system to support 4 themes (light, dark, hi-contrast, brand-print). Want a battle-tested naming approach.',
    author: 'u2',
    votes: 54,
    answers: 5,
    views: 1880,
    status: 'verified',
    category: 'design',
    tags: ['design-tokens', 'theming', 'figma'],
    createdAt: '2026-02-09T11:31:00Z',
  },
  {
    id: 'q-005',
    slug: 'reimbursement-software-recommendations',
    title: 'Which expense reimbursement tool integrates cleanly with NetSuite and Deel?',
    excerpt: 'Evaluating Ramp, Brex, Pleo, and Expensify for a 240-person team across 12 countries.',
    body: 'Evaluating Ramp, Brex, Pleo, and Expensify for a 240-person team across 12 countries.',
    author: 'u3',
    votes: 21,
    answers: 2,
    views: 612,
    status: 'unanswered',
    category: 'finance',
    tags: ['expenses', 'netsuite', 'deel'],
    createdAt: '2026-02-11T16:02:00Z',
  },
  {
    id: 'q-006',
    slug: 'sql-window-functions-vs-self-join-performance',
    title: 'When does a self-join outperform a window function in Postgres 16?',
    excerpt: 'Counter-intuitively, our self-join beat ROW_NUMBER() by 4x on a 2B row table. What gives?',
    body: 'Counter-intuitively, our self-join beat ROW_NUMBER() by 4x on a 2B row table. Trying to understand the planner choices.',
    author: 'u4',
    votes: 88,
    answers: 6,
    views: 2941,
    status: 'verified',
    category: 'data',
    tags: ['postgres', 'sql', 'performance'],
    createdAt: '2026-02-06T08:44:00Z',
  },
  {
    id: 'q-007',
    slug: 'sla-breach-customer-communication-script',
    title: 'Do you have an SLA-breach communication script that does not sound corporate?',
    excerpt: 'Looking for templates that admit failure clearly without legal sounding theater.',
    body: 'Looking for templates that admit failure clearly without sounding like corporate theater.',
    author: 'u3',
    votes: 33,
    answers: 4,
    views: 1182,
    status: 'answered',
    category: 'support',
    tags: ['sla', 'comms', 'templates'],
    createdAt: '2026-02-07T13:20:00Z',
  },
  {
    id: 'q-008',
    slug: 'how-to-write-prd-that-engineers-actually-read',
    title: 'How do you write a PRD that engineers will actually read past page one?',
    excerpt: 'Tried inverted pyramid, decision logs, FAQs. Engineers still skim. Looking for what worked for you.',
    body: 'Tried inverted pyramid, decision logs, FAQs. Engineers still skim. Looking for what worked for you.',
    author: 'u3',
    votes: 215,
    answers: 12,
    views: 8902,
    status: 'verified',
    category: 'product',
    tags: ['prd', 'product', 'writing'],
    createdAt: '2026-01-28T17:00:00Z',
  },
  {
    id: 'q-009',
    slug: 'gdpr-data-retention-server-logs',
    title: 'Is keeping raw server access logs for 18 months a GDPR risk?',
    excerpt: 'Auditor flagged our 18-month log retention. Need a defensible policy.',
    body: 'Auditor flagged our 18-month log retention. Need a defensible policy that does not break incident response.',
    author: 'u5',
    votes: 41,
    answers: 3,
    views: 974,
    status: 'answered',
    category: 'legal',
    tags: ['gdpr', 'logs', 'retention'],
    createdAt: '2026-02-05T15:48:00Z',
  },
  {
    id: 'q-010',
    slug: 'kubernetes-secret-mounting-vs-csi-driver',
    title: 'Should we use Kubernetes Secret objects or a CSI driver for production secrets?',
    excerpt: 'Migrating from raw Secrets to AWS Secrets Manager. Worth the complexity?',
    body: 'Migrating from raw Secrets to AWS Secrets Manager. Worth the complexity?',
    author: 'u1',
    votes: 76,
    answers: 5,
    views: 2603,
    status: 'verified',
    category: 'security',
    tags: ['kubernetes', 'secrets', 'aws'],
    createdAt: '2026-02-03T12:10:00Z',
  },
];

export const answers = {
  'q-001': [
    {
      id: 'a-1', author: 'u1', votes: 84, accepted: true, createdAt: '2026-02-04T11:30:00Z',
      body: "Use IAM Roles for Service Accounts (IRSA) with EKS. Stop minting long-lived keys for service accounts entirely. For workloads outside EKS, prefer AWS STS AssumeRole with short-lived credentials issued via SPIFFE or an OIDC trust to your CI. If you must keep keys, rotate via a two-key dance: provision key B, deploy new pods with key B, retire key A on a soak window.",
    },
    {
      id: 'a-2', author: 'u5', votes: 22, accepted: false, createdAt: '2026-02-04T13:14:00Z',
      body: "If your platform team is small, the simplest path is the two-key dance with an automated rotator (HashiCorp Vault or AWS Secrets Manager rotation lambdas). Just enforce a 24-hour overlap window and you'll never page anyone.",
    },
    {
      id: 'a-3', author: 'u4', votes: 11, accepted: false, createdAt: '2026-02-05T08:02:00Z',
      body: "Worth noting: if any of those service accounts are read by external SaaS vendors, you'll need a webhook to push the new key. We learned this the hard way after a Snowflake integration broke at 3am.",
    },
  ],
  'q-008': [
    {
      id: 'a-4', author: 'u1', votes: 132, accepted: true, createdAt: '2026-01-28T18:22:00Z',
      body: "Lead with the decision. Page one is: what we're building, why, and the one number that proves it worked. Push every framework, persona doc, and exploration into appendices. Engineers will read appendices for the parts they care about. They will not read 12 pages of context to find the ask.",
    },
    {
      id: 'a-5', author: 'u2', votes: 41, accepted: false, createdAt: '2026-01-28T20:11:00Z',
      body: "We split PRDs into 'Brief' (1 page, decision + scope) and 'Spec' (long form). Engineers only need to read the Brief to start estimating. The Spec is the working document during build.",
    },
  ],
};

export const notifications = [
  { id: 'n1', type: 'answer', actor: 'u1', target: 'q-001', read: false, time: '2h ago', text: 'Mira Halverson answered your question on IAM key rotation.' },
  { id: 'n2', type: 'mention', actor: 'u2', target: 'q-008', read: false, time: '5h ago', text: 'Daniel Okafor mentioned you in a comment on a PRD question.' },
  { id: 'n3', type: 'accepted', actor: 'u3', target: 'q-008', read: false, time: '1d ago', text: 'Your answer was accepted on "How do you write a PRD that engineers will read".' },
  { id: 'n4', type: 'vote', actor: 'u4', target: 'q-006', read: true, time: '2d ago', text: 'Your answer received 25 upvotes on a Postgres window function question.' },
  { id: 'n5', type: 'system', actor: null, target: null, read: true, time: '3d ago', text: 'You earned the "Curator" badge for editing 25 questions.' },
  { id: 'n6', type: 'answer', actor: 'u5', target: 'q-009', read: true, time: '4d ago', text: 'Priya Raghavan answered your question on GDPR log retention.' },
];

export const reports = [
  { id: 'r1', target: 'q-005', type: 'question', reason: 'Spam / promotional', reporter: 'u2', status: 'pending', time: '14 min ago' },
  { id: 'r2', target: 'a-2', type: 'answer', reason: 'Misinformation', reporter: 'u4', status: 'pending', time: '1h ago' },
  { id: 'r3', target: 'q-007', type: 'question', reason: 'Duplicate', reporter: 'u1', status: 'pending', time: '3h ago' },
  { id: 'r4', target: 'a-3', type: 'answer', reason: 'Off-topic', reporter: 'u6', status: 'pending', time: '6h ago' },
  { id: 'r5', target: 'q-003', type: 'question', reason: 'Low quality', reporter: 'u5', status: 'resolved', time: '2d ago' },
];

export const activityChart = [
  { day: 'Mon', questions: 32, answers: 78, views: 4120 },
  { day: 'Tue', questions: 41, answers: 92, views: 4780 },
  { day: 'Wed', questions: 55, answers: 108, views: 5340 },
  { day: 'Thu', questions: 48, answers: 121, views: 6122 },
  { day: 'Fri', questions: 62, answers: 134, views: 7011 },
  { day: 'Sat', questions: 24, answers: 51, views: 3210 },
  { day: 'Sun', questions: 19, answers: 38, views: 2880 },
];

export const topicSearches = [
  { topic: 'kubernetes', searches: 1284 },
  { topic: 'postgres', searches: 982 },
  { topic: 'onboarding', searches: 740 },
  { topic: 'design-tokens', searches: 612 },
  { topic: 'sso', searches: 588 },
  { topic: 'gdpr', searches: 421 },
  { topic: 'okrs', searches: 388 },
];

export const adminStats = {
  totalQuestions: 4126,
  totalAnswers: 11842,
  totalUsers: 2310,
  flagged: 18,
  weeklyGrowth: 4.2,
};

export const userById = (id) => users.find((u) => u.id === id) || users[0];
export const questionById = (id) => questions.find((q) => q.id === id);
export const questionBySlug = (slug) => questions.find((q) => q.slug === slug);
export const categoryBySlug = (slug) => categories.find((c) => c.slug === slug);

export const timeAgo = (iso) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
