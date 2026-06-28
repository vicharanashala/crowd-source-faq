/**
 * Groq chat service — used exclusively for fast LLM generation.
 * Gemini is used only for embeddings (see aiService.js).
 *
 * Groq provides ~10x faster inference than Gemini for chat,
 * with a generous free tier on models like llama-3.3-70b.
 */
const Groq = require("groq-sdk");

// Best free Groq models (in order of quality vs speed):
// "llama-3.3-70b-versatile"  — best quality, generous free limits
// "llama-3.1-8b-instant"     — fastest, good for simple queries
// "mixtral-8x7b-32768"       — long context window (32k tokens)
const GROQ_CHAT_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

let groqClient;

const getGroqClient = () => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey === "your-groq-api-key-here") {
    const err = new Error("GROQ_API_KEY is required. Get a free key at https://console.groq.com");
    err.statusCode = 503;
    throw err;
  }

  if (!groqClient) {
    groqClient = new Groq({ apiKey });
  }

  return groqClient;
};

/**
 * Generate a chat completion using Groq.
 * @param {string} systemPrompt  - System instructions
 * @param {string} userMessage   - The user's query
 * @param {number} maxTokens     - Max output tokens (default 512)
 * @returns {Promise<string>}    - Generated text
 */
const groqChat = async (systemPrompt, userMessage, maxTokens = 512) => {
  const client = getGroqClient();

  const response = await client.chat.completions.create({
    model: GROQ_CHAT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userMessage },
    ],
    max_tokens: maxTokens,
    temperature: 0.3,      // low temp = more factual, less creative
    top_p: 0.9,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
};

/**
 * Generate with full message history (for multi-turn conversations).
 * @param {Array<{role: string, content: string}>} messages
 * @param {number} maxTokens
 */
const groqChatWithHistory = async (messages, maxTokens = 512) => {
  const client = getGroqClient();

  const response = await client.chat.completions.create({
    model: GROQ_CHAT_MODEL,
    messages,
    max_tokens: maxTokens,
    temperature: 0.3,
    top_p: 0.9,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
};

module.exports = {
  GROQ_CHAT_MODEL,
  groqChat,
  groqChatWithHistory,
};
