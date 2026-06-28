const Question = require("../models/Question");
const { generateEmbedding } = require("../services/aiService");

const HARD_INTERCEPT_THRESHOLD = 0.9;
const SOFT_INTERCEPT_THRESHOLD = 0.75;
const GENTLE_SUGGEST_THRESHOLD = 0.6;

const getTriageAction = (score) => {
  if (score >= HARD_INTERCEPT_THRESHOLD) {
    return "hard_intercept";
  }

  if (score >= SOFT_INTERCEPT_THRESHOLD) {
    return "soft_intercept";
  }

  if (score >= GENTLE_SUGGEST_THRESHOLD) {
    return "gentle_suggest";
  }

  return "allow_post";
};

const searchAndTriage = async (req, res, next) => {
  try {
    const query = String(req.query.q || "").trim();

    if (!query) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Query parameter q is required",
        },
      });
    }

    let embedding;
    try {
      embedding = await generateEmbedding(query);
    } catch (aiError) {
      console.warn("Gemini embedding failed, falling back to empty vector triage:", aiError.message);
      // Fallback: If AI is down, we can't do vector search, so we return zero matches
      // but allow the request to proceed so the user can still post.
      return res.status(200).json({
        success: true,
        data: {
          action: "allow_post",
          query,
          topScore: 0,
          topMatch: null,
          matches: [],
          aiFallback: true
        },
      });
    }

    let matches = [];
    try {
      matches = await Question.aggregate([
        {
          $vectorSearch: {
            index: "vector_index",
            path: "embedding",
            queryVector: embedding,
            numCandidates: 100,
            limit: 5,
          },
        },
        {
          $project: {
            title: 1,
            body: 1,
            tags: 1,
            status: 1,
            author: 1,
            duplicateOf: 1,
            duplicateScore: 1,
            createdAt: 1,
            score: {
              $meta: "vectorSearchScore",
            },
          },
        },
      ]);
    } catch (vectorError) {
      console.warn("Atlas Vector Search failed or index not ready:", vectorError.message);
      // We'll proceed to the text-search fallback below
    }

    // Fallback: If no vector matches (or score is very low), try a text-based search
    // This is crucial because many FAQs might have zero-embeddings due to quota issues.
    if (matches.length === 0 || matches[0].score < 0.1) {
      const textMatches = await Question.find({
        $or: [
          { title: { $regex: query, $options: "i" } },
          { body: { $regex: query, $options: "i" } },
        ],
      })
      .limit(5)
      .lean();

      if (textMatches.length > 0) {
        // Map text matches to look like vector results with a synthetic score
        const formattedTextMatches = textMatches.map(m => ({
          ...m,
          score: 1.0, // Give text matches high priority as a fallback
        }));
        // Merge or replace
        matches = [...formattedTextMatches, ...matches];
      }
    }

    const topMatch = matches[0] || null;
    const topScore = topMatch ? topMatch.score : 0;

    return res.status(200).json({
      success: true,
      data: {
        action: getTriageAction(topScore),
        query,
        topScore,
        topMatch,
        matches,
        thresholds: {
          hardIntercept: HARD_INTERCEPT_THRESHOLD,
          softIntercept: SOFT_INTERCEPT_THRESHOLD,
          gentleSuggest: GENTLE_SUGGEST_THRESHOLD,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  searchAndTriage,
};
