const mongoose = require("mongoose");

const Answer = require("../models/Answer");
const Question = require("../models/Question");
const { ragChat } = require("../services/ragService");
const {
  generateEmbedding,
  summarizeAnswers,
} = require("../services/aiService");

const HARD_INTERCEPT_THRESHOLD = 0.9;
const SOFT_INTERCEPT_THRESHOLD = 0.75;
const GENTLE_SUGGEST_THRESHOLD = 0.6;
const DUPLICATE_THRESHOLD = 0.85;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const findTextMatches = async (query, limit) => {
  const escapedQuery = escapeRegex(query);

  const matches = await Question.find({
    $or: [
      { title: { $regex: escapedQuery, $options: "i" } },
      { body: { $regex: escapedQuery, $options: "i" } },
    ],
  })
    .select("-embedding")
    .limit(limit)
    .lean();

  const questionIds = matches.map((match) => match._id);
  const answers = questionIds.length
    ? await Answer.find({ question: { $in: questionIds } })
      .select("question body isAccepted isOfficial upvoteCount createdAt")
      .sort({ isAccepted: -1, isOfficial: -1, upvoteCount: -1, createdAt: 1 })
      .lean()
    : [];

  const answersByQuestion = answers.reduce((groups, answer) => {
    const key = answer.question.toString();
    groups[key] = groups[key] || [];

    if (groups[key].length < 3) {
      groups[key].push(answer);
    }

    return groups;
  }, {});

  return matches.map((match) => ({
    ...match,
    answers: answersByQuestion[match._id.toString()] || [],
    score: 1,
    searchSource: "text",
  }));
};

const findSimilarQuestions = async (query, { limit = 5 } = {}) => {
  let matches = [];
  let aiFallback = false;
  let fallbackReason = null;

  try {
    const queryVector = await generateEmbedding(query);

    matches = await Question.aggregate([
      {
        $vectorSearch: {
          index: "vector_index",
          path: "embedding",
          queryVector,
          numCandidates: 100,
          limit,
        },
      },
      {
        $lookup: {
          from: "answers",
          localField: "_id",
          foreignField: "question",
          as: "answers",
          pipeline: [
            {
              $project: {
                body: 1,
                isAccepted: 1,
                isOfficial: 1,
                upvoteCount: 1,
                createdAt: 1,
              },
            },
            { $sort: { isAccepted: -1, isOfficial: -1, upvoteCount: -1, createdAt: 1 } },
            { $limit: 3 },
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
          createdAt: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ]);
  } catch (error) {
    aiFallback = true;
    fallbackReason = error.message;
  }

  if (matches.length === 0) {
    try {
      matches = await findTextMatches(query, limit);
    } catch (error) {
      aiFallback = true;
      fallbackReason = fallbackReason || error.message;
    }
  }

  return {
    aiFallback,
    fallbackReason,
    matches,
  };
};

const buildContextText = (matches) => {
  return matches
    .map((question, index) => {
      const answerText = (question.answers || [])
        .map((answer, answerIndex) => `A${answerIndex + 1}: ${answer.body}`)
        .join("\n");

      return [
        `Result ${index + 1}`,
        `Q: ${question.title}`,
        `Details: ${question.body}`,
        answerText || "No community answers yet.",
      ].join("\n");
    })
    .join("\n\n");
};

const buildFallbackAnswer = (matches) => {
  if (!matches.length) {
    return "I do not know yet. Please post this question to the community so someone can answer it.";
  }

  const topMatch = matches[0];
  const firstAnswer = topMatch.answers && topMatch.answers[0];

  if (firstAnswer) {
    return `I found a related community discussion: "${topMatch.title}". The top answer says: ${firstAnswer.body}`;
  }

  return `I found a related community discussion: "${topMatch.title}", but it does not have a community answer yet.`;
};

const askChatbot = async (req, res, next) => {
  try {
    const message = String(req.body.message || req.body.query || "").trim();
    // history: [{role: "user"|"assistant", text: string}]
    const history = Array.isArray(req.body.history) ? req.body.history : [];

    if (!message) {
      return res.status(400).json({
        success: false,
        error: { message: "message is required" },
      });
    }

    try {
      const { answer, citations, meta } = await ragChat(message, history);

      return res.status(200).json({
        success: true,
        data: {
          answer,
          citations,
          meta,
          // legacy field kept for backward compat
          matches: citations,
          aiFallback: !meta.hasContext || meta.vectorFailed,
          fallbackReason: !meta.hasContext
            ? "No relevant documents found"
            : (meta.vectorFailed ? "Vector search failed" : null),
        },
      });
    } catch (error) {
      // Graceful fallback to text matching and pre-defined response builder if RAG fails
      const matches = await findTextMatches(message, 3);
      const answer = buildFallbackAnswer(matches);
      return res.status(200).json({
        success: true,
        data: {
          answer,
          citations: matches.map((m) => ({ title: m.title, id: m._id, slug: m.slug })),
          meta: {
            documentsRetrieved: matches.length,
            vectorCount: 0,
            keywordCount: matches.length,
            vectorFailed: true,
            hasContext: matches.length > 0,
          },
          matches: matches.map((m) => ({ title: m.title, id: m._id, slug: m.slug })),
          aiFallback: true,
          fallbackReason: error.message,
        },
      });
    }
  } catch (error) {
    return next(error);
  }
};

const checkDuplicates = async (req, res, next) => {
  try {
    const title = String(req.body.title || req.body.query || "").trim();

    if (!title) {
      return res.status(400).json({
        success: false,
        error: { message: "title is required" },
      });
    }

    const { aiFallback, fallbackReason, matches } = await findSimilarQuestions(title, {
      limit: 5,
    });
    const duplicateMatches = matches.filter((match) => match.score >= DUPLICATE_THRESHOLD);
    const topScore = matches[0] ? matches[0].score : 0;

    return res.status(200).json({
      success: true,
      data: {
        action: getTriageAction(topScore),
        topScore,
        matches: duplicateMatches,
        aiFallback,
        fallbackReason,
        thresholds: {
          duplicate: DUPLICATE_THRESHOLD,
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

const summarizeQuestionAnswers = async (req, res, next) => {
  try {
    const { questionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({
        success: false,
        error: { message: "Question id must be a valid MongoDB ObjectId" },
      });
    }

    const question = await Question.findById(questionId).select("title").lean();

    if (!question) {
      return res.status(404).json({
        success: false,
        error: { message: "Question not found" },
      });
    }

    const answers = await Answer.find({ question: questionId })
      .select("body isAccepted isOfficial upvoteCount createdAt")
      .sort({ isAccepted: -1, isOfficial: -1, upvoteCount: -1, createdAt: 1 })
      .limit(10)
      .lean();

    const summary = await summarizeAnswers({
      questionTitle: question.title,
      answers,
    });

    return res.status(200).json({
      success: true,
      data: {
        questionId,
        summary,
        answerCount: answers.length,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  askChatbot,
  checkDuplicates,
  summarizeQuestionAnswers,
};
