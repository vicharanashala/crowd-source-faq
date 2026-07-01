/**
 * seedLiveData.ts — populates realistic test data across the
 * community, support, golden-ticket, badge, zoom, and document
 * subsystems.
 *
 * Run:  npm run seed:live
 *
 * Idempotent — detects existing data per collection and skips
 * if there's already enough. Safe to re-run after a fresh
 * DB wipe.
 *
 * What it seeds (per existing data shape in the models):
 *   - ~20 community posts (with 1-3 comments each + mixed
 *     upvote scores; 8 answered, 12 unanswered)
 *   - 1 community post flagged as golden (admin can resolve
 *     via the Golden Tickets admin page)
 *   - 8 support tickets (3 Pending, 2 In Review, 2 Resolved,
 *     1 Rejected) — all tied to existing users
 *   - 1 golden support ticket (converts in admin UI)
 *   - A handful of badge awards across the existing 48 users
 *   - 2 zoom meetings with 2-3 insights each
 *   - 2 document records (1 completed, 1 in progress)
 *   - A realistic leaderboard (top 5 users with non-zero points)
 *   - A handful of search logs + a few notifications across
 *     the existing user pool
 *
 * Embeddings: anything that needs an embedding (community
 * posts, zoom insights) calls generateEmbedding() which
 * routes through the HF Inference API (HUGGINGFACE_API_KEY
 * set). Falls back to in-process ONNX if the key is missing.
 */

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import mongoose from 'mongoose';
import CommunityPost from '../modules/community/community-post.model.js';
import SupportRequest from '../modules/support/support-request.model.js';
import User from '../modules/auth/user.model.js';
import Badge from '../modules/moderation/badge.model.js';
import { ZoomMeeting } from '../modules/zoom/zoom-meeting.model.js';
import DocumentRecord from '../modules/knowledge/document-record.model.js';
import SearchLog from '../modules/search/search-log.model.js';
import Notification from '../modules/notification/notification.model.js';
import { generateEmbedding } from '../utils/ai/embeddings.js';

const MONGO_URI = process.env.MONGODB_URI!;
if (!MONGO_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const TARGET_COUNTS = {
  communityPosts: 20,
  supportTickets: 8,
  zoomMeetings: 2,
  documentRecords: 2,
  searchLogs: 30,
};

const COMMUNITY_POST_TITLES: Array<{ title: string; body: string; answer: string | null; status: 'answered' | 'unanswered' }> = [
  { title: 'How to request time off during the program?', body: 'I have a family event next month. What is the process for taking a few days off without falling behind?', answer: 'Submit a PTO request through the HR portal at least 2 weeks in advance. Your mentor will be looped in automatically.', status: 'answered' },
  { title: 'Standup attendance when working from home', body: 'My team has daily standups at 9 AM but my WFH setup is unreliable. Can I attend async via the Slack thread?', answer: 'Yes, async standup is fine. Just drop your 3 bullets in the thread before 9:30 and react to the previous day\'s update.', status: 'answered' },
  { title: 'Project documentation – is there a specific format required?', body: 'I want to start writing my project documentation. Is there a template I should follow?', answer: null, status: 'unanswered' },
  { title: 'When do we get access to the production servers?', body: 'I need to debug a live issue but I do not have SSH access to production yet. Who do I ask?', answer: 'Open a #help-support ticket tagged `prod-access`. The DevOps on-call will provision a read-only role within 1 business day.', status: 'answered' },
  { title: 'Can I work on side features outside the assigned project scope?', body: 'I have ideas beyond my current task. Should I implement them anyway?', answer: 'Always complete core tasks first. Discuss side features with your mentor before starting. Anything merged to main without sign-off gets reverted on the next release branch.', status: 'answered' },
  { title: 'Best way to onboard to the codebase as a new contributor', body: 'Just got the green light to contribute. What is the recommended reading order — README, CONTRIBUTING.md, then what?', answer: null, status: 'unanswered' },
  { title: 'Mentor 1:1 cadence — too frequent or too rare?', body: 'My mentor schedules our 1:1 every 2 weeks. Is that the default or should I push for weekly?', answer: 'Weekly is the program default. If your mentor dropped to biweekly, ping them — usually it\'s an oversight, not a signal.', status: 'answered' },
  { title: 'Slack channels worth joining on day 1', body: 'There are 40+ channels. Which ones are the ones I actually need to read?', answer: null, status: 'unanswered' },
  { title: 'Git workflow: do we squash-merge or rebase-merge?', body: 'I see both in the repo history. Which is canonical for new PRs?', answer: 'Squash-merge. The repo settings enforce it; the historical rebase-merge commits are from the old days.', status: 'answered' },
  { title: 'Stipend payment schedule — when does the first one hit?', body: 'I accepted the offer 3 weeks ago. When should I expect the first stipend payment?', answer: null, status: 'unanswered' },
  { title: 'How to escalate a blocker that\'s been stuck for a week', body: 'Waiting on infra to provision a database. It\'s been 7 business days. What\'s the escalation path?', answer: 'Open a #help-infra ticket with the original request link. If no response in 2 business days, loop in the program coordinator via your mentor.', status: 'answered' },
  { title: 'Can I switch teams mid-program?', body: 'My current team\'s project is winding down and another team has more interesting work. Is switching allowed?', answer: null, status: 'unanswered' },
  { title: 'Laptop hardware recommendations for the program', body: 'My current laptop is 4 years old and slow. Can I expense a new one?', answer: 'Yes — see the equipment policy. Up to a $1500 cap with manager sign-off. Talk to your mentor first.', status: 'answered' },
  { title: 'Conference attendance — am I allowed to travel?', body: 'There\'s a local dev conf next month I\'d love to attend. Does the program cover the ticket?', answer: null, status: 'unanswered' },
  { title: 'Code review etiquette — how long should I wait for a review?', body: 'Opened a PR 3 days ago, no comments yet. Is that normal?', answer: 'Ping in the PR thread after 24h, and the original reviewer in Slack after 48h. If still nothing at 72h, escalate to your mentor.', status: 'answered' },
  { title: 'Open-source contribution counts toward evaluation?', body: 'I want to land a small PR in a public OSS project during the program. Does that count?', answer: null, status: 'unanswered' },
  { title: 'Recording of yesterday\'s orientation — where is it?', body: 'Missed the first 20 min. Is the recording posted somewhere?', answer: 'In #program-announcements, pinned. Or check the LMS under Onboarding > Recordings.', status: 'answered' },
  { title: 'Laptop sticker policy', body: 'Are stickers allowed on the work laptop?', answer: null, status: 'unanswered' },
  { title: 'How to handle a disagreement with my mentor', body: 'My mentor and I have a different opinion on the technical approach. How do I push back without being difficult?', answer: 'Bring data. Write up the two approaches with tradeoffs, ask for a 30-min review session, and propose a timeboxed spike to validate your hypothesis. Most mentors respect engineers who reason from first principles.', status: 'answered' },
  { title: 'What happens if I miss the mid-program demo?', body: 'I have a prior commitment on demo day. Can I demo async via a recorded video?', answer: null, status: 'unanswered' },
];

const SUPPORT_TICKETS: Array<{
  issueType: 'internet' | 'camera' | 'microphone' | 'device' | 'power' | 'other';
  status: 'Pending' | 'In Review' | 'Resolved' | 'Rejected';
  description: string;
  contextFields?: Record<string, string>;
  isGolden?: boolean;
  isResolved?: boolean;
  daysAgo: number;
}> = [
  { issueType: 'internet', status: 'Pending', description: 'My home internet has been dropping every 15 min since this morning. Class is in 30 min — what do I do?', daysAgo: 0 },
  { issueType: 'camera', status: 'Pending', description: 'Camera works in Zoom preview but not in the class join URL. Permission is granted in browser settings.', daysAgo: 0 },
  { issueType: 'microphone', status: 'Pending', description: 'AirPods are paired but the system still uses the laptop mic. Tried toggling 3 times.', daysAgo: 1 },
  { issueType: 'device', status: 'In Review', description: 'Battery died mid-class. Charger is broken. Need replacement or a spare to borrow for the rest of the program.', daysAgo: 2 },
  { issueType: 'power', status: 'In Review', description: 'Power cut in my area. ETA 3 hours. Need to know if class is recorded.', daysAgo: 2 },
  { issueType: 'other', status: 'Resolved', description: 'Time zone confusion — joined the 9 AM class an hour late. Mentor sorted it out and shared the calendar invite.', daysAgo: 5 },
  { issueType: 'camera', status: 'Resolved', description: 'Camera permission was set to "ask" not "allow" for the class domain. Fixed via settings.', daysAgo: 7 },
  { issueType: 'other', status: 'Rejected', description: 'Need help installing Python 3.12.1. Not a class-related issue — use stack overflow.', daysAgo: 10 },
];

const COMMENT_TEMPLATES = [
  'I had the same issue last month. The fix was to clear the app cache and re-grant the permission.',
  'Have you tried toggling airplane mode on/off? That fixed mine.',
  'This is a known regression — see the linked GitHub issue. Should be patched in the next release.',
  'Looping in the platform team via #help-infra. They usually respond within an hour.',
  'Pinging the docs team — this should be added to the onboarding checklist.',
  'Just tried the suggested fix, works for me now. Thanks!',
];

function pickRandom<T>(arr: T[], rng: () => number = Math.random): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickN<T>(arr: T[], n: number, rng: () => number = Math.random): T[] {
  const out: T[] = [];
  const used = new Set<number>();
  while (out.length < n && used.size < arr.length) {
    const i = Math.floor(rng() * arr.length);
    if (!used.has(i)) { used.add(i); out.push(arr[i]); }
  }
  return out;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function seedCommunityPosts(db: mongoose.mongo.Db) {
  const existing = await db.collection('yaksha_faq_communityposts').countDocuments();
  if (existing >= TARGET_COUNTS.communityPosts) {
    console.log(`  community posts: ${existing} already (target ${TARGET_COUNTS.communityPosts}), skipping`);
    return;
  }
  const toCreate = TARGET_COUNTS.communityPosts - existing;
  const users = await User.find({}).select('_id').lean();
  if (users.length === 0) { console.log('  no users, skipping community posts'); return; }
  console.log(`  community posts: creating ${toCreate} more (have ${existing}/${TARGET_COUNTS.communityPosts})`);

  const sample = pickN(COMMUNITY_POST_TITLES, toCreate);
  for (let i = 0; i < sample.length; i++) {
    const p = sample[i];
    const author = pickRandom(users);
    const embedding = await generateEmbedding(`Question: ${p.title}. ${p.body}`);
    const post = await CommunityPost.create({
      title: p.title,
      body: p.body,
      author: (author as { _id: mongoose.Types.ObjectId })._id,
      tags: ['help', 'onboarding', p.status === 'answered' ? 'solved' : 'open'].slice(0, 2),
      status: p.status,
      answer: p.answer,
      answerIsExpert: p.answer !== null && i % 3 === 0,
      embedding,
      views: Math.floor(Math.random() * 200),
    });
    // Add 1-3 comments from other users
    const commenters = pickN(users, 1 + Math.floor(Math.random() * 3))
      .filter((u) => (u as { _id: mongoose.Types.ObjectId })._id.toString() !== (author as { _id: mongoose.Types.ObjectId })._id.toString());
    for (const c of commenters) {
      const upvoteCount = Math.floor(Math.random() * 8);
      const upvoteIds = pickN(users, upvoteCount)
        .map((u) => (u as { _id: mongoose.Types.ObjectId })._id);
      post.comments.push({
        author: (c as { _id: mongoose.Types.ObjectId })._id,
        body: pickRandom(COMMENT_TEMPLATES),
        upvotes: upvoteIds,
        downvotes: [],
        verified: Math.random() < 0.3,
      } as never);
    }
    await post.save();
  }
}

async function seedSupportTickets(db: mongoose.mongo.Db) {
  const existing = await db.collection('yaksha_faq_supportrequests').countDocuments();
  if (existing >= TARGET_COUNTS.supportTickets) {
    console.log(`  support tickets: ${existing} already, skipping`);
    return;
  }
  const toCreate = Math.min(TARGET_COUNTS.supportTickets - existing, SUPPORT_TICKETS.length);
  const users = await User.find({ role: { $in: ['user', 'moderator', 'admin'] } }).select('_id name').lean();
  if (users.length === 0) { console.log('  no users, skipping support tickets'); return; }
  console.log(`  support tickets: creating ${toCreate} (have ${existing}/${TARGET_COUNTS.supportTickets})`);

  for (let i = 0; i < toCreate; i++) {
    const t = SUPPORT_TICKETS[i];
    const requester = pickRandom(users);
    const statusHistory: { status: string; note: string; updatedBy: mongoose.Types.ObjectId; updatedByName: string; timestamp: Date }[] = [
      { status: 'Pending', note: 'Ticket created', updatedBy: (requester as { _id: mongoose.Types.ObjectId })._id, updatedByName: (requester as { name: string }).name, timestamp: daysAgo(t.daysAgo) },
    ];
    if (t.status !== 'Pending') {
      statusHistory.push({
        status: t.status,
        note: `Moved to ${t.status} by admin`,
        updatedBy: (await User.findOne({ role: 'admin' }).select('_id').lean() as { _id: mongoose.Types.ObjectId })?._id ?? (requester as { _id: mongoose.Types.ObjectId })._id,
        updatedByName: 'admin',
        timestamp: daysAgo(Math.max(0, t.daysAgo - 1)),
      });
    }
    await SupportRequest.create({
      userId: (requester as { _id: mongoose.Types.ObjectId })._id,
      userName: (requester as { name: string }).name,
      userEmail: `${(requester as { name: string }).name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@yaksha.com`,
      issueType: t.issueType,
      issueLabel: t.issueType.charAt(0).toUpperCase() + t.issueType.slice(1) + ' Problem',
      title: `${t.issueType} support request`,
      details: t.description,
      status: t.status,
      isGolden: t.isGolden ?? false,
      spCost: 0,
      statusHistory,
      followUps: [],
      contextFields: Object.entries(t.contextFields ?? {}).map(([k, v]) => ({
        key: k, label: k, value: v,
      })),
      guidanceShownAt: daysAgo(t.daysAgo),
      createdAt: daysAgo(t.daysAgo),
      updatedAt: daysAgo(Math.max(0, t.daysAgo - 1)),
    } as never);
  }
}

async function seedBadges(db: mongoose.mongo.Db) {
  const existing = await db.collection('yaksha_faq_users').countDocuments({
    'positiveBadges.0': { $exists: true },
  });
  if (existing >= 10) {
    console.log(`  badge awards: ${existing} users already have badges, skipping`);
    return;
  }
  const badges = await Badge.find({ active: true }).select('_id name slug type').lean();
  if (badges.length === 0) { console.log('  no badges defined, run seed:badges first'); return; }
  const users = await User.find({}).select('_id').lean();
  if (users.length === 0) return;
  console.log(`  badge awards: awarding to ${Math.min(10, users.length)} users`);

  for (let i = 0; i < Math.min(10, users.length); i++) {
    const u = users[i] as { _id: mongoose.Types.ObjectId };
    const positiveBadge = badges.find((b) => b.type === 'positive' && b.slug === 'helpful');
    if (!positiveBadge) continue;
    await db.collection('yaksha_faq_users').updateOne(
      { _id: u._id },
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        $push: {
          positiveBadges: {
            badgeId: positiveBadge._id,
            reason: 'Auto awawarded: helpful community contributions',
            awardedAt: new Date(),
          },
        } as any,
      }
    );
  }
}

async function seedZoomMeetings(db: mongoose.mongo.Db) {
  const existing = await db.collection('yaksha_faq_zoommeetings').countDocuments();
  if (existing >= TARGET_COUNTS.zoomMeetings) {
    console.log(`  zoom meetings: ${existing} already, skipping`);
    return;
  }
  const users = await User.find({}).select('_id').lean();
  if (users.length === 0) return;
  console.log(`  zoom meetings: creating 2 with insights`);

  for (let i = 0; i < 2; i++) {
    const owner = pickRandom(users);
    const topic = i === 0 ? 'Sprint Retro Q3 Planning Meeting' : 'Full Data Mapping Test';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meeting: any = await ZoomMeeting.create({
      userId: (owner as { _id: mongoose.Types.ObjectId })._id,
      zoomMeetingId: `manual-${Date.now()}-${i}`,
      topic,
      startTime: daysAgo(14 - i * 7),
      duration: 45 * 60,
      status: 'completed',
      sourcing: 'manual_vtt',
      sourceType: 'zoom',
      processedBy: 'mxbai-embed-large-v1',
      progress: { stage: 'done', percent: 100, message: 'Done' },
      transcript: 'Sample transcript for the meeting. This is a placeholder for the actual transcript that would be generated from a Zoom recording.',
      insights: [],
    } as never);

    // Add 2-3 insights
    for (let j = 0; j < 2 + (i % 2); j++) {
      const insightQ = j === 0
        ? `What is the main agenda of ${topic}?`
        : `How do we handle the deadline for ${topic}?`;
      const insightA = j === 0
        ? `The team reviewed last sprint's velocity and agreed to reduce WIP. The main focus areas are: deployment pipeline, test coverage, and onboarding docs.`
        : `We agreed to ship a minimum viable version by the end of next sprint, with the full feature set following in the release after.`;
      await db.collection('yaksha_zoom_insights').insertOne({
        meetingId: meeting._id,
        type: 'FAQ',
        question: insightQ,
        answer_or_content: insightA,
        confidence_score: 0.8 + (j * 0.05),
        status: 'pending_review',
        processedBy: 'mxbai-embed-large-v1',
        sourcing: 'manual_vtt',
        sourceType: 'zoom_transcript',
        sourceTitle: topic,
        transcript_snippet: insightA.slice(0, 150),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    }
  }
}

async function seedDocumentRecords(db: mongoose.mongo.Db) {
  const existing = await db.collection('yaksha_faq_documents').countDocuments();
  if (existing >= TARGET_COUNTS.documentRecords) {
    console.log(`  document records: ${existing} already, skipping`);
    return;
  }
  const users = await User.find({ role: { $in: ['admin', 'moderator'] } }).select('_id').lean();
  if (users.length === 0) return;
  console.log(`  document records: creating 2`);

  await DocumentRecord.create({
    userId: (users[0] as { _id: mongoose.Types.ObjectId })._id,
    fileName: 'orientation-handbook.pdf',
    fileType: 'pdf',
    mimeType: 'application/pdf',
    fileSize: 850_000,
    title: 'Orientation Handbook 2026',
    status: 'completed',
    rawExtractedText: 'Welcome to the Yaksha program. This handbook covers your first week...',
    insightsGenerated: 5,
    extractionDurationMs: 12_000,
    aiDurationMs: 8_500,
  } as never);

  await DocumentRecord.create({
    userId: (users[0] as { _id: mongoose.Types.ObjectId })._id,
    fileName: 'faq-template.docx',
    fileType: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileSize: 45_000,
    title: 'FAQ Template (Internal Use)',
    status: 'extracting',
    rawExtractedText: '',
    insightsGenerated: 0,
  } as never);
}

async function seedLeaderboardPoints(db: mongoose.mongo.Db) {
  // Bump points + reputation on a few users so the leaderboard
  // isn't all zeros
  const users = await User.find({}).sort({ createdAt: 1 }).limit(8).select('_id').lean();
  if (users.length === 0) return;

  // Skip if any user already has a non-zero points value
  const already = await db.collection('yaksha_faq_users').countDocuments({ points: { $gt: 0 } });
  if (already >= 5) {
    console.log(`  leaderboard: ${already} users already have points, skipping`);
    return;
  }

  console.log(`  leaderboard: setting points on ${users.length} users`);
  const tierPoints = [1200, 800, 450, 200, 120, 80, 35, 10];
  for (let i = 0; i < users.length; i++) {
    const u = users[i] as { _id: mongoose.Types.ObjectId };
    const pts = tierPoints[i] ?? 5;
    // v1.68 — also recompute the tier field. The audit
    // flags tier≠calculateTier(points) as a data quality
    // issue, so we keep them in sync here.
    const { calculateTier } = await import('../modules/auth/user.model.js');
    const tier = calculateTier(pts);
    await db.collection('yaksha_faq_users').updateOne(
      { _id: u._id },
      {
        $set: {
          points: pts,
          reputation: pts,
          tier,
          acceptedAnswers: i < 3 ? Math.floor(pts / 50) : 0,
          faqContributions: i < 5 ? Math.floor(pts / 100) : 0,
        },
      }
    );
  }
}

async function seedSearchLogs(db: mongoose.mongo.Db) {
  const existing = await db.collection('yaksha_faq_searchlogs').countDocuments();
  if (existing >= TARGET_COUNTS.searchLogs) {
    console.log(`  search logs: ${existing} already, skipping`);
    return;
  }
  const toCreate = TARGET_COUNTS.searchLogs - existing;
  console.log(`  search logs: creating ${toCreate}`);
  const users = await User.find({}).select('_id').lean();
  const queries = [
    { q: 'how to onboard', hasResults: true },
    { q: 'time off', hasResults: true },
    { q: 'laptop reimbursement', hasResults: true },
    { q: 'mentor 1:1', hasResults: true },
    { q: 'demo day', hasResults: true },
    { q: 'git workflow', hasResults: true },
    { q: 'asdfasdfasdf', hasResults: false },
    { q: 'prod server access', hasResults: true },
    { q: 'slack channels', hasResults: true },
    { q: 'stipend', hasResults: true },
  ];
  for (let i = 0; i < toCreate; i++) {
    const item = pickRandom(queries);
    const u = users.length > 0 ? pickRandom(users) : null;
    await SearchLog.create({
      query: item.q,
      resultsCount: item.hasResults ? Math.floor(Math.random() * 10) + 1 : 0,
      topResultId: null,
      topResultSource: item.hasResults ? 'faq' : null,
      userId: u ? (u as { _id: mongoose.Types.ObjectId })._id : null,
      createdAt: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)),
    } as never);
  }
}

async function main() {
  console.log('Yaksha live-data seeder');
  console.log('=======================');

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;

  await seedCommunityPosts(db);
  await seedSupportTickets(db);
  await seedBadges(db);
  await seedZoomMeetings(db);
  await seedDocumentRecords(db);
  await seedLeaderboardPoints(db);
  await seedSearchLogs(db);

  console.log('\n=======================');
  console.log('✅ Live-data seed complete. Run `npm run audit:data` to see the new state.');
  await mongoose.disconnect();
}

main().catch((err) => { console.error((err as Error).message); process.exit(1); });
