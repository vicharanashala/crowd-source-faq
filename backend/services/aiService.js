const { GoogleGenerativeAI } = require("@google/generative-ai");

const EMBEDDING_MODEL = "models/gemini-embedding-001";
const CHAT_MODEL = "gemini-2.5-flash";
const EMBEDDING_DIMENSIONS = 3072;

let genAI;

const getApiKey = () => process.env.GEMINI_API_KEY;

const getClient = () => {
  const apiKey = getApiKey();

  if (!apiKey) {
    const error = new Error("GEMINI_API_KEY is required");
    error.statusCode = 503;
    throw error;
  }

  if (!genAI) {
    genAI = new GoogleGenerativeAI(apiKey);
  }

  return genAI;
};

const getGenerativeModel = (model) => getClient().getGenerativeModel({ model });

const generateGeminiEmbedding = async (input) => {
  const normalizedInput = String(input || "").trim();

  if (!normalizedInput) {
    const error = new Error("Embedding input is required");
    error.statusCode = 400;
    throw error;
  }

  const model = getGenerativeModel(EMBEDDING_MODEL);
  const response = await model.embedContent({
    content: { parts: [{ text: normalizedInput }] },
  });

  return response.embedding.values;
};

const generateChatbotAnswer = async ({ query, contextText }) => {
  const normalizedQuery = String(query || "").trim();

  if (!normalizedQuery) {
    const error = new Error("Chat message is required");
    error.statusCode = 400;
    throw error;
  }

  const prompt = `
You are the CrowdFAQ FAQ Assistant.
Answer the user's question using the community context below.
If the context is empty or does not answer the question, say you do not know yet and invite the user to post the question to the community.
Keep the answer concise, helpful, and transparent.

Community context:
${contextText || "No relevant community context was found."}

User question:
${normalizedQuery}

Answer:
`;

  const model = getGenerativeModel(CHAT_MODEL);
  const response = await model.generateContent(prompt);

  return response.response.text().trim();
};

const summarizeAnswers = async ({ questionTitle, answers = [] }) => {
  if (!answers.length) {
    return "No answers provided yet.";
  }

  const compiledAnswers = answers
    .map((answer, index) => `${index + 1}. ${answer.body || answer.content || ""}`)
    .join("\n");

  const prompt = `
Summarize the community answers to this question in 3-4 concise sentences.
Use only the answer text provided. Do not invent policy, deadlines, links, or contact details.

Question:
${questionTitle}

Answers:
${compiledAnswers}

Summary:
`;

  const model = getGenerativeModel(CHAT_MODEL);
  const response = await model.generateContent(prompt);

  return response.response.text().trim();
};

const generateProvisionalDraft = async ({ title, body, tags = [] }) => {
  const prompt = `
You are helping CrowdFAQ create a clearly provisional community answer draft.
Use only the question text below. Do not invent policies, deadlines, links, contact details, or personal data.
If the question needs a human or official source, say that clearly.
Keep the draft concise and label it as provisional.

Question title:
${title}

Question body:
${body}

Tags:
${tags.join(", ") || "none"}

Provisional draft:
`;

  const model = getGenerativeModel(CHAT_MODEL);
  const response = await model.generateContent(prompt);

  return response.response.text().trim();
};

const suggestTagsAndCategory = async ({ title, body, categories = [] }) => {
  const prompt = `
Given this question, choose the most relevant category from the available categories and suggest 3-5 short tags.
Return only valid JSON with keys "category" and "tags".

Available categories:
${categories.join(", ") || "general"}

Question title:
${title}

Question body:
${body}
`;

  const model = getGenerativeModel(CHAT_MODEL);
  const response = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
  });

  return JSON.parse(response.response.text());
};

module.exports = {
  CHAT_MODEL,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  generateChatbotAnswer,
  generateEmbedding: generateGeminiEmbedding,
  generateGeminiEmbedding,
  generateProvisionalDraft,
  getGenerativeModel,
  summarizeAnswers,
  suggestTagsAndCategory,
};
