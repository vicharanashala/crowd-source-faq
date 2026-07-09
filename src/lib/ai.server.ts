// Server-side AI helpers (never imported from client code)

const cleanEnvVar = (val?: string) => val?.replace(/^["']|["']$/g, '').trim();

const geminiKey = cleanEnvVar(process.env.GEMINI_API_KEY);
const openaiKey = cleanEnvVar(process.env.OPENAI_API_KEY || process.env.AI_API_KEY);

// Check if Gemini is the preferred provider (Gemini key is set, or base URL points to Gemini)
const isGemini = !!geminiKey || (process.env.AI_API_URL || "").includes("googleapis.com");

export const AI_API_URL = 
  process.env.AI_API_URL || 
  process.env.OPENAI_BASE_URL || 
  (isGemini 
    ? "https://generativelanguage.googleapis.com/v1beta/openai" 
    : "https://api.openai.com/v1");

export async function embed(text: string): Promise<number[]> {
  const key = geminiKey || openaiKey;
  if (!key) throw new Error("Missing GEMINI_API_KEY, OPENAI_API_KEY, or AI_API_KEY");

  if (isGemini) {
    // Use native Gemini embedding API (gemini-embedding-001)
    const model = process.env.EMBEDDING_MODEL || "gemini-embedding-001";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          outputDimensionality: 1536,
        }),
      },
    );
    if (!res.ok) throw new Error(`Embed failed ${res.status}: ${await res.text()}`);
    const j = await res.json();
    return j.embedding.values as number[];
  }

  // Fallback: OpenAI-compatible endpoint
  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  const res = await fetch(`${AI_API_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, input: text }),
  });
  if (!res.ok) throw new Error(`Embed failed ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.data[0].embedding as number[];
}

export async function chat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  model = isGemini ? "gemini-3.1-flash-lite" : "gpt-4o-mini",
): Promise<string> {
  const key = geminiKey || openaiKey;
  if (!key) throw new Error("Missing GEMINI_API_KEY, OPENAI_API_KEY, or AI_API_KEY");

  const chatModel = process.env.CHAT_MODEL || model;

  if (isGemini) {
    // Use native Gemini generateContent API
    const systemMsg = messages.find((m) => m.role === "system");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = { contents };
    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${chatModel}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) throw new Error(`Chat failed ${res.status}: ${await res.text()}`);
    const j = await res.json();
    return j.candidates[0].content.parts[0].text as string;
  }

  // Fallback: OpenAI-compatible endpoint
  const res = await fetch(`${AI_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: chatModel, messages }),
  });
  if (!res.ok) throw new Error(`Chat failed ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.choices[0].message.content as string;
}
