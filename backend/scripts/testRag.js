/**
 * Manual RAG test script — tests the full pipeline end-to-end
 * without needing the frontend or HTTP server running.
 *
 * Run: node scripts/testRag.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { ragChat } = require("../services/ragService");

// ─── Test cases ──────────────────────────────────────────────────────────────
const TESTS = [
  // ① Platform meta questions (should use knowledge docs)
  {
    label: "Platform meta",
    query: "what is this platform",
    history: [],
  },
  // ② Known community topic (should match seeded Q&A)
  {
    label: "Exact topic match",
    query: "how do I rotate AWS IAM keys without downtime",
    history: [],
  },
  // ③ Paraphrased query (semantic match, not keyword)
  {
    label: "Paraphrased query",
    query: "we have too many dead feature flags, what do we do",
    history: [],
  },
  // ④ Multi-turn: follow-up question using history
  {
    label: "Multi-turn follow-up",
    query: "what about the two-key approach, can you explain more",
    history: [
      { role: "user",      text: "how do I rotate AWS IAM keys without downtime" },
      { role: "assistant", text: "Use IAM Roles for Service Accounts (IRSA) with EKS. Stop minting long-lived keys. If you must keep keys, use a two-key dance: provision Key B, deploy pods with Key B, then retire Key A." },
    ],
  },
  // ⑤ Unknown topic (should gracefully say "I don't know")
  {
    label: "Unknown topic",
    query: "how do I reset my password",
    history: [],
  },
  // ⑥ Vague query (should fallback cleanly)
  {
    label: "Vague query",
    query: "hello",
    history: [],
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────
const DIVIDER = "─".repeat(60);

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ Connected to MongoDB\n");

  let passed = 0;
  let failed = 0;

  for (const test of TESTS) {
    console.log(DIVIDER);
    console.log(`🧪  ${test.label}`);
    console.log(`👤  User: "${test.query}"`);
    if (test.history.length) {
      console.log(`📜  History: ${test.history.length} turns`);
    }
    console.log();

    try {
      const start = Date.now();
      const result = await ragChat(test.query, test.history);
      const elapsed = Date.now() - start;

      console.log(`🤖  Answer: ${result.answer}`);
      console.log();

      if (result.citations.length) {
        console.log(`📚  Sources (${result.citations.length}):`);
        result.citations.forEach((c, i) => console.log(`     [${i + 1}] ${c.title}`));
        console.log();
      }

      console.log(`📊  Meta:`);
      console.log(`     Docs retrieved : ${result.meta.documentsRetrieved}`);
      console.log(`     Vector hits    : ${result.meta.vectorCount}`);
      console.log(`     Keyword hits   : ${result.meta.keywordCount}`);
      console.log(`     Has context    : ${result.meta.hasContext}`);
      console.log(`     Response time  : ${elapsed}ms`);
      passed++;
    } catch (err) {
      console.error(`❌  FAILED: ${err.message}`);
      failed++;
    }

    console.log();
  }

  console.log(DIVIDER);
  console.log(`\n✅  Passed: ${passed}  |  ❌  Failed: ${failed}`);
  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error("Fatal:", e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
