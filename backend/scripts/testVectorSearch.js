require("dotenv").config();
const mongoose = require("mongoose");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Question = require("../models/Question");

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "models/gemini-embedding-001" });

  const queries = [
    "how to rotate AWS IAM keys",
    "cleaning up stale feature flags",
    "how to write a PRD engineers will read",
  ];

  for (const query of queries) {
    const result = await model.embedContent({ content: { parts: [{ text: query }] } });
    const queryVector = result.embedding.values;

    const matches = await Question.aggregate([
      {
        $vectorSearch: {
          index: "vector_index",
          path: "embedding",
          queryVector,
          numCandidates: 10,
          limit: 2,
        },
      },
      { $project: { title: 1, score: { $meta: "vectorSearchScore" } } },
    ]);

    console.log(`\nQuery: "${query}"`);
    matches.forEach((m) => console.log(`  ${m.score.toFixed(4)}  ${m.title}`));
  }

  await mongoose.disconnect();
  console.log("\n✅ Vector search working!");
}

test().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
