/**
 * Seeds platform knowledge base documents into MongoDB with embeddings.
 * These are retrieved by RAG naturally when users ask meta questions
 * like "what is CrowdFAQ", "how do I post", "how does voting work", etc.
 * Run: node scripts/seedKnowledge.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Question = require("../models/Question");
const User = require("../models/User");

// Platform knowledge documents — each will be embedded and stored
// so RAG retrieves them only when the user's query is semantically relevant.
const KNOWLEDGE_DOCS = [
  {
    slug: "what-is-crowdfaq",
    title: "What is CrowdFAQ?",
    body: "CrowdFAQ is a community-driven Q&A platform where professionals share knowledge and answer each other's questions. It covers topics like engineering, security, product management, design, data, and people-ops. Members post questions, vote on answers, accept the best answer, and earn reputation points. The platform uses AI (vector search + Gemini) to detect duplicate questions and surface relevant community knowledge instantly.",
    tags: ["platform", "about", "crowdfaq"],
    status: "verified",
  },
  {
    slug: "how-to-post-a-question",
    title: "How do I post a question on CrowdFAQ?",
    body: "To post a question on CrowdFAQ: click the 'Ask Question' button on the home page or navigation bar. Write a clear title (8–180 characters) and a detailed body (10–5000 characters) explaining your problem. Add relevant tags to help others find your question. Before posting, the AI will check for duplicates and suggest existing answers. If none match, your question is submitted and the community can answer it.",
    tags: ["platform", "how-to", "posting"],
    status: "verified",
  },
  {
    slug: "how-does-voting-and-reputation-work",
    title: "How does voting and reputation work on CrowdFAQ?",
    body: "On CrowdFAQ, members can upvote or downvote questions and answers to surface the most helpful content. When your answer is upvoted or accepted by the question author, you earn reputation points. Higher reputation unlocks moderator privileges. The question author can mark one answer as 'Accepted' to indicate it solved their problem. Official answers from verified experts are also highlighted.",
    tags: ["platform", "voting", "reputation"],
    status: "verified",
  },
  {
    slug: "how-does-ai-duplicate-detection-work",
    title: "How does CrowdFAQ's AI duplicate detection work?",
    body: "Before you post a question, CrowdFAQ's AI embeds your question title using Google's Gemini embedding model and searches the vector database for semantically similar existing questions. If a near-duplicate is found (similarity score above 0.85), you are shown the existing question and its answers so you don't need to post again. This uses MongoDB Atlas Vector Search under the hood.",
    tags: ["platform", "ai", "duplicate-detection"],
    status: "verified",
  },
  {
    slug: "what-topics-does-crowdfaq-cover",
    title: "What topics does CrowdFAQ cover?",
    body: "CrowdFAQ covers a wide range of professional topics including: Engineering (backend, frontend, DevOps, architecture), Security (IAM, secrets management, GDPR, compliance), Product Management (PRDs, roadmaps, metrics), Design (design tokens, systems, Figma), Data Engineering (SQL, pipelines, BigQuery), People Ops (onboarding, culture, HR tools), and Finance (expense management, reimbursement tools).",
    tags: ["platform", "topics", "categories"],
    status: "verified",
  },
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const embeddingModel = genAI.getGenerativeModel({ model: "models/gemini-embedding-001" });

  // Find or create a system user to own knowledge docs
  let systemUser = await User.findOne({ handle: "crowdfaq.system" }).lean();
  if (!systemUser) {
    systemUser = await User.create({
      displayName: "CrowdFAQ System",
      handle: "crowdfaq.system",
      email: "system@crowdfaq.local",
      password: "System@Internal123",
      role: "admin",
      reputationScore: 0,
    });
    console.log("Created system user");
  }

  let inserted = 0;
  let skipped = 0;

  for (const doc of KNOWLEDGE_DOCS) {
    // Skip if already exists
    const existing = await Question.findOne({ slug: doc.slug });
    if (existing) {
      console.log(`⏭  Skipped (exists): ${doc.title}`);
      skipped++;
      continue;
    }

    // Generate embedding for title + body + tags
    const text = [doc.title, doc.body, ...doc.tags].join("\n");
    const result = await embeddingModel.embedContent({ content: { parts: [{ text }] } });
    const embedding = result.embedding.values;

    await Question.create({
      title: doc.title,
      body: doc.body,
      slug: doc.slug,
      tags: doc.tags,
      status: doc.status,
      embedding,
      author: systemUser._id,
      upvoteCount: 0,
      views: 0,
    });

    console.log(`✅ Seeded: ${doc.title}`);
    inserted++;
  }

  console.log(`\nDone — inserted: ${inserted}, skipped: ${skipped}`);
  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error("❌", e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
