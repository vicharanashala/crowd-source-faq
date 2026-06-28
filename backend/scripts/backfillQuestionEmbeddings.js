const mongoose = require("mongoose");

const env = require("../config/env");
const Question = require("../models/Question");
const { generateEmbedding, EMBEDDING_DIMENSIONS } = require("../services/aiService");

const buildQuestionText = (question) =>
  [question.title, question.body, ...(question.tags || [])].filter(Boolean).join("\n");

const hasValidEmbedding = (question) =>
  Array.isArray(question.embedding) &&
  question.embedding.length === EMBEDDING_DIMENSIONS;

const run = async () => {
  if (!env.mongodbUri) {
    throw new Error("MONGODB_URI is required");
  }

  await mongoose.connect(env.mongodbUri, {
    serverSelectionTimeoutMS: 10000,
    tls: true,
    tlsAllowInvalidCertificates: true,
    retryWrites: true,
    w: "majority",
  });

  const questions = await Question.find({})
    .select("title body tags embedding")
    .sort({ _id: 1 });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const question of questions) {
    if (hasValidEmbedding(question)) {
      skipped += 1;
      continue;
    }

    try {
      const embedding = await generateEmbedding(buildQuestionText(question));
      question.embedding = embedding;
      await question.save();
      updated += 1;
      console.log(`Updated ${question._id}: ${question.title}`);
    } catch (error) {
      failed += 1;
      console.error(`Failed ${question._id}: ${error.message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        total: questions.length,
        updated,
        skipped,
        failed,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();

  if (failed > 0) {
    process.exitCode = 1;
  }
};

run().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
