/**
 * Professional RAG (Retrieval-Augmented Generation) Service
 *
 * Pipeline:
 *   Query → Hybrid Search (Vector + BM25 with RRF) → Confidence Filter
 *         → Context Compression → Multi-turn Generation → Cited Answer
 *
 * Key features:
 *  - Hybrid retrieval: parallel vector + keyword search fused with Reciprocal Rank Fusion
 *  - Confidence thresholding: drops low-similarity docs to avoid hallucination
 *  - Token-budgeted context: smart truncation keeps prompt compact
 *  - Multi-turn memory: last N conversation turns injected into prompt
 *  - Source citations: answer includes [Source N] references
 *  - Graceful degradation: falls back clearly when knowledge is absent
 */

const Question = require("../models/Question");
const Answer = require("../models/Answer");
const { generateEmbedding } = require("./aiService");        // Gemini — embeddings only
const { groqChatWithHistory, GROQ_CHAT_MODEL } = require("./groqService"); // Groq — generation

// ─── Tuneable constants ────────────────────────────────────────────────────────
const VECTOR_CANDIDATES = 50;  // ANN candidates scanned in Atlas
const TOP_K = 5;               // docs returned per retrieval method
const FINAL_K = 3;             // docs sent to LLM after fusion + filter
const MIN_VECTOR_SCORE = 0.65; // below this = semantically irrelevant
const RRF_K = 60;              // RRF constant (standard value)
const MAX_CONTEXT_CHARS = 3500; // hard cap on context chars sent to LLM
const MAX_ANSWER_CHARS = 500;  // truncate individual answers in context
const MAX_HISTORY_TURNS = 4;   // conversation turns to keep (user+assistant pairs)

// ─── Reciprocal Rank Fusion ───────────────────────────────────────────────────
const rrfScore = (rank) => 1 / (RRF_K + rank + 1);

// ─── Vector Search ────────────────────────────────────────────────────────────
const vectorSearch = async (query) => {
  const queryVector = await generateEmbedding(query);

  const results = await Question.aggregate([
    {
      $vectorSearch: {
        index: "vector_index",
        path: "embedding",
        queryVector,
        numCandidates: VECTOR_CANDIDATES,
        limit: TOP_K,
      },
    },
    {
      $lookup: {
        from: "answers",
        localField: "_id",
        foreignField: "question",
        as: "answers",
        pipeline: [
          { $sort: { isAccepted: -1, isOfficial: -1, upvoteCount: -1 } },
          { $limit: 3 },
          { $project: { body: 1, isAccepted: 1, upvoteCount: 1 } },
        ],
      },
    },
    {
      $project: {
        title: 1,
        body: 1,
        tags: 1,
        status: 1,
        answers: 1,
        slug: 1,
        vectorScore: { $meta: "vectorSearchScore" },
      },
    },
  ]);

  // Filter out docs below the minimum relevance threshold
  return results.filter((doc) => doc.vectorScore >= MIN_VECTOR_SCORE);
};

// ─── Keyword / BM25-style Search ─────────────────────────────────────────────
const keywordSearch = async (query) => {
  // Extract meaningful tokens (skip stopwords + short words)
  const STOPWORDS = new Set([
    "a","an","the","is","in","on","at","to","for","of","and","or","but",
    "how","what","why","when","where","who","which","do","does","did",
    "can","could","should","would","will","i","we","you","it","this","that",
  ]);

  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));

  if (!tokens.length) return [];

  // Build an OR regex from meaningful tokens
  const pattern = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = { $regex: pattern, $options: "i" };

  const questions = await Question.find({
    $or: [{ title: regex }, { body: regex }, { tags: regex }],
  })
    .select("-embedding")
    .limit(TOP_K)
    .lean();

  if (!questions.length) return [];

  const ids = questions.map((q) => q._id);
  const answers = await Answer.find({ question: { $in: ids } })
    .sort({ isAccepted: -1, upvoteCount: -1 })
    .select("question body isAccepted upvoteCount")
    .lean();

  const answerMap = answers.reduce((map, a) => {
    const key = a.question.toString();
    if (!map[key]) map[key] = [];
    if (map[key].length < 3) map[key].push(a);
    return map;
  }, {});

  return questions.map((q) => ({
    ...q,
    answers: answerMap[q._id.toString()] || [],
    vectorScore: 0,
  }));
};

// ─── Hybrid Search with RRF Fusion ───────────────────────────────────────────
const hybridSearch = async (query) => {
  // Run both retrieval methods in parallel
  const [vectorResult, keywordResult] = await Promise.allSettled([
    vectorSearch(query),
    keywordSearch(query),
  ]);

  const vectorDocs = vectorResult.status === "fulfilled" ? vectorResult.value : [];
  const keywordDocs = keywordResult.status === "fulfilled" ? keywordResult.value : [];
  const vectorFailed = vectorResult.status === "rejected";

  // Build unified score map with RRF fusion
  const scoreMap = new Map();

  vectorDocs.forEach((doc, rank) => {
    const id = doc._id.toString();
    const entry = scoreMap.get(id) || { doc, rrf: 0, vectorScore: doc.vectorScore };
    entry.rrf += rrfScore(rank) * 1.5; // weight vector search higher (semantic > keyword)
    entry.vectorScore = doc.vectorScore;
    scoreMap.set(id, entry);
  });

  keywordDocs.forEach((doc, rank) => {
    const id = doc._id.toString();
    const entry = scoreMap.get(id) || { doc, rrf: 0, vectorScore: 0 };
    entry.rrf += rrfScore(rank);
    if (!entry.doc) entry.doc = doc;
    scoreMap.set(id, entry);
  });

  // Sort by RRF score, take top FINAL_K
  const fused = Array.from(scoreMap.values())
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, FINAL_K)
    .map(({ doc, rrf, vectorScore }) => ({ ...doc, rrf, vectorScore }));

  return { docs: fused, vectorFailed, vectorCount: vectorDocs.length, keywordCount: keywordDocs.length };
};

// ─── Context Builder ──────────────────────────────────────────────────────────
const buildContext = (docs) => {
  if (!docs.length) {
    return { contextText: "", citations: [] };
  }

  const citations = [];
  let contextText = "";

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const answers = (doc.answers || []).slice(0, 2);

    let chunk = `[Source ${i + 1}]: ${doc.title}\n`;

    // Include body only if it adds info beyond the title
    if (doc.body && doc.body.trim() !== doc.title.trim()) {
      chunk += `Context: ${doc.body.slice(0, 200)}\n`;
    }

    if (answers.length) {
      const answerText = answers
        .map((a, j) => {
          const label = a.isAccepted ? `Top Answer` : `Answer ${j + 1}`;
          return `${label}: ${a.body.slice(0, MAX_ANSWER_CHARS)}`;
        })
        .join("\n");
      chunk += answerText;
    } else {
      chunk += "No community answers yet.";
    }

    chunk += "\n";

    // Stop if we'd exceed the token budget
    if (contextText.length + chunk.length > MAX_CONTEXT_CHARS) break;

    contextText += chunk + "\n";
    citations.push({ title: doc.title, id: doc._id?.toString(), slug: doc.slug });
  }

  return { contextText: contextText.trim(), citations };
};

// ─── Conversation History Formatter ──────────────────────────────────────────
const formatHistory = (history = []) => {
  if (!history.length) return "";

  const recent = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-MAX_HISTORY_TURNS * 2);

  return recent
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");
};

// ─── Retry helper (handles Gemini 503 spikes) ────────────────────────────────
const withRetry = async (fn, retries = 3, delayMs = 1000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is503 = err.message?.includes("503") || err.message?.includes("Service Unavailable");
      if (is503 && attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * attempt)); // 1s, 2s, 4s
        continue;
      }
      throw err;
    }
  }
};

// ─── RAG Prompt Builder ───────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the CrowdFAQ FAQ Assistant — a concise, grounded AI for a professional Q&A community.
Your answers must be based ONLY on the retrieved community knowledge provided in each message.
Do not invent facts, links, deadlines, or contact details.
Keep answers under 150 words unless detail is essential.
When you use a source, reference it as [Source 1], [Source 2], etc.
If the knowledge does not answer the question, respond: "The community hasn't covered this yet. Post your question and let the community help!"`;

const buildGroqMessages = (query, contextText, historyText) => {
  const userContent = [
    historyText ? `Conversation so far:\n${historyText}\n` : "",
    `Retrieved community knowledge:\n${contextText || "No relevant community knowledge found."}`,
    `\nUser question: ${query}`,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user",   content: userContent },
  ];
};

// ─── Main RAG Pipeline ────────────────────────────────────────────────────────
const ragChat = async (query, history = []) => {
  const normalizedQuery = String(query || "").trim();

  if (!normalizedQuery) {
    const err = new Error("message is required");
    err.statusCode = 400;
    throw err;
  }

  // Step 1: Hybrid retrieval
  const { docs, vectorFailed, vectorCount, keywordCount } = await hybridSearch(normalizedQuery);

  // Step 2: Build compressed context
  const { contextText, citations } = buildContext(docs);

  // Step 3: Format conversation history
  const historyText = formatHistory(history);

  // Step 4: Generate grounded answer via Groq (with retry for transient errors)
  const messages = buildGroqMessages(normalizedQuery, contextText, historyText);
  const answer = await withRetry(() => groqChatWithHistory(messages, 400));

  return {
    answer,
    citations,
    model: GROQ_CHAT_MODEL,
    meta: {
      documentsRetrieved: docs.length,
      vectorCount,
      keywordCount,
      vectorFailed,
      hasContext: docs.length > 0,
    },
  };
};

module.exports = { ragChat, hybridSearch };
