const mongoose = require("mongoose");
const env = require("./config/env");
const User = require("./models/User");
const Question = require("./models/Question");
const Answer = require("./models/Answer");
const Notification = require("./models/Notification");
const Report = require("./models/Report");
const { generateEmbedding } = require("./services/aiService");

const mockUsers = [
  { mockId: 'u1', displayName: 'Mira Halverson', handle: 'mira.h', title: 'Staff Engineer', avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&q=80', reputationScore: 18420, email: 'mira.h@crowdfaq.local', role: 'admin' },
  { mockId: 'u2', displayName: 'Daniel Okafor', handle: 'okafor', title: 'Design Systems Lead', avatar: 'https://images.unsplash.com/photo-1521119989659-a83eee488004?w=200&q=80', reputationScore: 12880, email: 'okafor@crowdfaq.local', role: 'moderator' },
  { mockId: 'u3', displayName: 'Aiko Tanaka', handle: 'aiko.t', title: 'Product Manager', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&q=80', reputationScore: 9461, email: 'aiko.t@crowdfaq.local', role: 'student' },
  { mockId: 'u4', displayName: 'Rafael Costa', handle: 'rafa', title: 'Data Engineer', avatar: 'https://images.pexels.com/photos/12396627/pexels-photo-12396627.jpeg?auto=compress&w=200', reputationScore: 7203, email: 'rafa@crowdfaq.local', role: 'student' },
  { mockId: 'u5', displayName: 'Priya Raghavan', handle: 'priya.r', title: 'Security Engineer', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&q=80', reputationScore: 5611, email: 'priya.r@crowdfaq.local', role: 'student' },
  { mockId: 'u6', displayName: 'Henrik Vossen', handle: 'henrik', title: 'People Ops Manager', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80', reputationScore: 4203, email: 'henrik@crowdfaq.local', role: 'moderator' },
];

const mockQuestions = [
  {
    mockId: 'q-001',
    slug: 'how-to-rotate-aws-iam-keys-without-downtime',
    title: 'How do we rotate AWS IAM access keys for service accounts without downtime?',
    body: 'We have ~40 service accounts that consume AWS keys baked into config maps. We want to move to a 90-day rotation policy. What is the right pattern to rotate keys with zero downtime, ideally without touching Kubernetes deployments?',
    excerpt: 'We have ~40 service accounts that consume AWS keys baked into config maps. Looking for the right rotation pattern with zero downtime.',
    authorMockId: 'u5',
    upvoteCount: 142,
    downvoteCount: 0,
    views: 5482,
    status: 'verified',
    category: 'security',
    tags: ['aws', 'iam', 'rotation', 'kubernetes'],
    createdAt: '2026-02-04T10:22:00Z',
  },
  {
    mockId: 'q-002',
    slug: 'recommended-pattern-for-feature-flag-cleanup',
    title: 'Recommended pattern for cleaning up stale feature flags across a 2M LOC codebase?',
    excerpt: 'Our flag system is sprawling. Looking for an internal policy others have shipped that actually gets engineers to remove dead flags.',
    body: 'Our flag system has grown to ~1,400 flags, and a recent audit showed ~38% are dead. Looking for an enforceable policy.',
    authorMockId: 'u1',
    upvoteCount: 98,
    downvoteCount: 0,
    views: 3120,
    status: 'answered',
    category: 'engineering',
    tags: ['feature-flags', 'tech-debt', 'process'],
    createdAt: '2026-02-08T14:55:00Z',
  },
  {
    mockId: 'q-003',
    slug: 'onboarding-engineer-first-30-days',
    title: 'What does a great engineering onboarding plan look like for the first 30 days?',
    excerpt: 'I am building our first formal 30-60-90 onboarding. Curious how other teams structure the first month.',
    body: 'I am building our first formal 30-60-90 onboarding. Curious how other teams structure the first month, what artifacts are required, and what mistakes to avoid.',
    authorMockId: 'u6',
    upvoteCount: 67,
    downvoteCount: 0,
    views: 2104,
    status: 'answered',
    category: 'people-ops',
    tags: ['onboarding', '30-60-90', 'culture'],
    createdAt: '2026-02-10T09:10:00Z',
  },
  {
    mockId: 'q-004',
    slug: 'design-tokens-naming-convention',
    title: 'What naming convention do you use for design tokens across light and dark themes?',
    excerpt: 'We are scaling our token system to support 4 themes. Looking for a battle-tested naming approach.',
    body: 'We are scaling our token system to support 4 themes (light, dark, hi-contrast, brand-print). Want a battle-tested naming approach.',
    authorMockId: 'u2',
    upvoteCount: 54,
    downvoteCount: 0,
    views: 1880,
    status: 'verified',
    category: 'design',
    tags: ['design-tokens', 'theming', 'figma'],
    createdAt: '2026-02-09T11:31:00Z',
  },
  {
    mockId: 'q-005',
    slug: 'reimbursement-software-recommendations',
    title: 'Which expense reimbursement tool integrates cleanly with NetSuite and Deel?',
    excerpt: 'Evaluating Ramp, Brex, Pleo, and Expensify for a 240-person team across 12 countries.',
    body: 'Evaluating Ramp, Brex, Pleo, and Expensify for a 240-person team across 12 countries.',
    authorMockId: 'u3',
    upvoteCount: 21,
    downvoteCount: 0,
    views: 612,
    status: 'pending',
    category: 'finance',
    tags: ['expenses', 'netsuite', 'deel'],
    createdAt: '2026-02-11T16:02:00Z',
  },
  {
    mockId: 'q-006',
    slug: 'sql-window-functions-vs-self-join-performance',
    title: 'When does a self-join outperform a window function in Postgres 16?',
    excerpt: 'Counter-intuitively, our self-join beat ROW_NUMBER() by 4x on a 2B row table. What gives?',
    body: 'Counter-intuitively, our self-join beat ROW_NUMBER() by 4x on a 2B row table. Trying to understand the planner choices.',
    authorMockId: 'u4',
    upvoteCount: 88,
    downvoteCount: 0,
    views: 2941,
    status: 'verified',
    category: 'data',
    tags: ['postgres', 'sql', 'performance'],
    createdAt: '2026-02-06T08:44:00Z',
  },
  {
    mockId: 'q-007',
    slug: 'sla-breach-customer-communication-script',
    title: 'Do you have an SLA-breach communication script that does not sound corporate?',
    excerpt: 'Looking for templates that admit failure clearly without legal sounding theater.',
    body: 'Looking for templates that admit failure clearly without sounding like corporate theater.',
    authorMockId: 'u3',
    upvoteCount: 33,
    downvoteCount: 0,
    views: 1182,
    status: 'answered',
    category: 'support',
    tags: ['sla', 'comms', 'templates'],
    createdAt: '2026-02-07T13:20:00Z',
  },
  {
    mockId: 'q-008',
    slug: 'how-to-write-prd-that-engineers-actually-read',
    title: 'How do you write a PRD that engineers will actually read past page one?',
    excerpt: 'Tried inverted pyramid, decision logs, FAQs. Engineers still skim. Looking for what worked for you.',
    body: 'Tried inverted pyramid, decision logs, FAQs. Engineers still skim. Looking for what worked for you.',
    authorMockId: 'u3',
    upvoteCount: 215,
    downvoteCount: 0,
    views: 8902,
    status: 'verified',
    category: 'product',
    tags: ['prd', 'product', 'writing'],
    createdAt: '2026-01-28T17:00:00Z',
  },
  {
    mockId: 'q-009',
    slug: 'gdpr-data-retention-server-logs',
    title: 'Is keeping raw server access logs for 18 months a GDPR risk?',
    excerpt: 'Auditor flagged our 18-month log retention. Need a defensible policy.',
    body: 'Auditor flagged our 18-month log retention. Need a defensible policy that does not break incident response.',
    authorMockId: 'u5',
    upvoteCount: 41,
    downvoteCount: 0,
    views: 974,
    status: 'answered',
    category: 'legal',
    tags: ['gdpr', 'logs', 'retention'],
    createdAt: '2026-02-05T15:48:00Z',
  },
  {
    mockId: 'q-010',
    slug: 'kubernetes-secret-mounting-vs-csi-driver',
    title: 'Should we use Kubernetes Secret objects or a CSI driver for production secrets?',
    excerpt: 'Migrating from raw Secrets to AWS Secrets Manager. Worth the complexity?',
    body: 'Migrating from raw Secrets to AWS Secrets Manager. Worth the complexity?',
    authorMockId: 'u1',
    upvoteCount: 76,
    downvoteCount: 0,
    views: 2603,
    status: 'verified',
    category: 'security',
    tags: ['kubernetes', 'secrets', 'aws'],
    createdAt: '2026-02-03T12:10:00Z',
  },
];

const mockAnswers = {
  'q-001': [
    {
      mockId: 'a-1', authorMockId: 'u1', upvoteCount: 84, downvoteCount: 0, isAccepted: true, createdAt: '2026-02-04T11:30:00Z',
      body: "Use IAM Roles for Service Accounts (IRSA) with EKS. Stop minting long-lived keys for service accounts entirely. For workloads outside EKS, prefer AWS STS AssumeRole with short-lived credentials issued via SPIFFE or an OIDC trust to your CI. If you must keep keys, rotate via a two-key dance: provision key B, deploy new pods with key B, retire key A on a soak window.",
    },
    {
      mockId: 'a-2', authorMockId: 'u5', upvoteCount: 22, downvoteCount: 0, isAccepted: false, createdAt: '2026-02-04T13:14:00Z',
      body: "If your platform team is small, the simplest path is the two-key dance with an automated rotator (HashiCorp Vault or AWS Secrets Manager rotation lambdas). Just enforce a 24-hour overlap window and you'll never page anyone.",
    },
    {
      mockId: 'a-3', authorMockId: 'u4', upvoteCount: 11, downvoteCount: 0, isAccepted: false, createdAt: '2026-02-05T08:02:00Z',
      body: "Worth noting: if any of those service accounts are read by external SaaS vendors, you'll need a webhook to push the new key. We learned this the hard way after a Snowflake integration broke at 3am.",
    },
  ],
  'q-004': [
    {
      mockId: 'a-4', authorMockId: 'u2', upvoteCount: 30, downvoteCount: 0, isAccepted: true, createdAt: '2026-02-09T12:00:00Z',
      body: "We structure our design tokens in three tiers: 1. Global Tokens (raw values like color-blue-500), 2. Alias Tokens (semantic meanings like color-background-primary), and 3. Component Tokens (specific elements like button-primary-background). This makes them incredibly clean to update.",
    }
  ],
  'q-008': [
    {
      mockId: 'a-5', authorMockId: 'u1', upvoteCount: 132, downvoteCount: 0, isAccepted: true, createdAt: '2026-01-28T18:22:00Z',
      body: "Lead with the decision. Page one is: what we're building, why, and the one number that proves it worked. Push every framework, persona doc, and exploration into appendices. Engineers will read appendices for the parts they care about. They will not read 12 pages of context to find the ask.",
    },
    {
      mockId: 'a-6', authorMockId: 'u2', upvoteCount: 41, downvoteCount: 0, isAccepted: false, createdAt: '2026-01-28T20:11:00Z',
      body: "We split PRDs into 'Brief' (1 page, decision + scope) and 'Spec' (long form). Engineers only need to read the Brief to start estimating. The Spec is the working document during build.",
    },
  ],
  'q-006': [
    {
      mockId: 'a-7', authorMockId: 'u1', upvoteCount: 50, downvoteCount: 0, isAccepted: true, createdAt: '2026-02-06T10:00:00Z',
      body: "A self-join can outperform a window function in Postgres when the join filter is highly selective and can utilize an index, whereas ROW_NUMBER() forces a full scan and sort. Postgres 16 planner optimizer is better, but sorting 2B rows in memory still fails.",
    }
  ],
  'q-009': [
    {
      mockId: 'a-8', authorMockId: 'u5', upvoteCount: 15, downvoteCount: 0, isAccepted: true, createdAt: '2026-02-05T17:10:00Z',
      body: "Keeping raw server logs containing IPs for 18 months without a clear business/security justification is definitely a GDPR risk. IP addresses are considered personal data. The standard best practice is to truncate or anonymize IPs after 30 days, keeping only aggregated metrics for long-term retention.",
    }
  ]
};

const mockNotifications = [
  { mockId: 'n1', type: 'answer', actorMockId: 'u1', targetMockId: 'q-001', userMockId: 'u5', read: false, text: 'Mira Halverson answered your question on IAM key rotation.' },
  { mockId: 'n2', type: 'mention', actorMockId: 'u2', targetMockId: 'q-008', userMockId: 'u3', read: false, text: 'Daniel Okafor mentioned you in a comment on a PRD question.' },
  { mockId: 'n3', type: 'accepted', actorMockId: 'u3', targetMockId: 'q-008', userMockId: 'u1', read: false, text: 'Your answer was accepted on "How do you write a PRD that engineers will read".' },
  { mockId: 'n4', type: 'vote', actorMockId: 'u4', targetMockId: 'q-006', userMockId: 'u1', read: true, text: 'Your answer received 25 upvotes on a Postgres window function question.' },
  { mockId: 'n5', type: 'system', actorMockId: null, targetMockId: null, userMockId: 'u1', read: true, text: 'You earned the "Curator" badge for editing 25 questions.' },
  { mockId: 'n6', type: 'answer', actorMockId: 'u5', targetMockId: 'q-009', userMockId: 'u1', read: true, text: 'Priya Raghavan answered your question on GDPR log retention.' },
];

const mockReports = [
  { mockId: 'r1', targetMockId: 'q-005', type: 'question', reason: 'Spam / promotional', reporterMockId: 'u2', status: 'pending' },
  { mockId: 'r2', targetMockId: 'a-2', type: 'answer', reason: 'Misinformation', reporterMockId: 'u4', status: 'pending' },
  { mockId: 'r3', targetMockId: 'q-007', type: 'question', reason: 'Duplicate', reporterMockId: 'u1', status: 'pending' },
  { mockId: 'r4', targetMockId: 'a-3', type: 'answer', reason: 'Off-topic', reporterMockId: 'u6', status: 'pending' },
  { mockId: 'r5', targetMockId: 'q-003', type: 'question', reason: 'Low quality', reporterMockId: 'u5', status: 'resolved' },
];

async function seedDatabase() {
  try {
    await mongoose.connect(env.mongodbUri || "mongodb://localhost:27017/CrowdFAQ");
    console.log("Connected to MongoDB");

    // Clear existing data
    await Question.deleteMany({});
    await Answer.deleteMany({});
    await User.deleteMany({});
    await Notification.deleteMany({});
    await Report.deleteMany({});
    console.log("Cleared existing data");

    // 1. Seed Users
    const userMap = {};
    for (const u of mockUsers) {
      const createdUser = await User.create({
        displayName: u.displayName,
        email: u.email,
        password: "Password@123",
        role: u.role,
        reputationScore: u.reputationScore,
        handle: u.handle,
        title: u.title,
        avatar: u.avatar,
        badges: u.role === 'admin' ? ["verified", "founder"] : []
      });
      userMap[u.mockId] = createdUser;
      console.log(`Created user: ${createdUser.displayName} (${createdUser._id})`);
    }

    // 2. Seed Questions & Answers
    const questionMap = {};
    const answerMap = {};

    for (const q of mockQuestions) {
      const author = userMap[q.authorMockId];
      
      let embedding = [];
      try {
        embedding = await generateEmbedding(`${q.title} ${q.body}`);
      } catch (err) {
        console.warn(`Failed to generate embedding for question "${q.title}":`, err.message);
      }

      const createdQuestion = await Question.create({
        title: q.title,
        body: q.body,
        excerpt: q.excerpt,
        views: q.views,
        slug: q.slug,
        author: author._id,
        tags: q.tags,
        status: q.status,
        category: q.category,
        embedding,
        upvoteCount: q.upvoteCount,
        downvoteCount: q.downvoteCount,
        createdAt: new Date(q.createdAt)
      });
      questionMap[q.mockId] = createdQuestion;
      console.log(`Created question: ${createdQuestion.title}`);

      // Seed answers for this question
      const answersForQ = mockAnswers[q.mockId] || [];
      for (const ans of answersForQ) {
        const ansAuthor = userMap[ans.authorMockId];
        const createdAnswer = await Answer.create({
          question: createdQuestion._id,
          author: ansAuthor._id,
          body: ans.body,
          upvoteCount: ans.upvoteCount,
          downvoteCount: ans.downvoteCount,
          isAccepted: ans.isAccepted,
          createdAt: new Date(ans.createdAt)
        });
        answerMap[ans.mockId] = createdAnswer;

        if (ans.isAccepted) {
          createdQuestion.acceptedAnswerId = createdAnswer._id;
          await createdQuestion.save();
        }
        console.log(`- Created answer by ${ansAuthor.displayName}`);
      }
    }

    // 3. Seed Notifications
    for (const n of mockNotifications) {
      const actor = n.actorMockId ? userMap[n.actorMockId] : null;
      const target = n.targetMockId ? questionMap[n.targetMockId] : null;
      const userRecip = n.userMockId ? userMap[n.userMockId] : userMap['u1'];
      await Notification.create({
        user: userRecip._id,
        type: n.type,
        actor: actor ? actor._id : null,
        target: target ? target._id : null,
        read: n.read,
        text: n.text
      });
    }
    console.log(`✅ Seeded ${mockNotifications.length} Notifications`);

    // 4. Seed Reports
    for (const r of mockReports) {
      const reporter = userMap[r.reporterMockId];
      const targetId = r.type === 'question' ? questionMap[r.targetMockId]._id : answerMap[r.targetMockId]._id;
      await Report.create({
        target: targetId,
        type: r.type,
        reason: r.reason,
        reporter: reporter._id,
        status: r.status
      });
    }
    console.log(`✅ Seeded ${mockReports.length} Reports`);

    console.log("✅ Database initialization complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error.message);
    process.exit(1);
  }
}

seedDatabase();
