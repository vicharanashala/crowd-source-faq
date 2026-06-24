import { Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { faqData } from "../../data/faqs.js";
import { getGeminiClient, SYSTEM_INSTRUCTION } from "../services/gemini.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateContentWithRetryAndFallback(
  client: GoogleGenAI,
  contents: any,
  systemInstruction: string
) {
  const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];
  let lastError: any = null;

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[Gemini] Attempting generation with model ${model} (attempt ${attempt}/3)...`);
        const response = await client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });
        console.log(`[Gemini] Generation succeeded on model ${model} (attempt ${attempt})!`);
        return response;
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini] Attempt ${attempt} failed with model ${model}:`, err.message || err);

        const errMessage = String(err.message || "").toLowerCase();
        const errStatus = err.status || (err.error && err.error.code);
        const isRetryable =
          errStatus === 429 ||
          errStatus === 503 ||
          errMessage.includes("503") ||
          errMessage.includes("429") ||
          errMessage.includes("demand") ||
          errMessage.includes("unavailable") ||
          errMessage.includes("overloaded");

        if (isRetryable && attempt < 3) {
          const waitTime = attempt * 1200;
          await delay(waitTime);
        } else {
          break;
        }
      }
    }
  }
  throw lastError || new Error("Failed to generate content after retry attempts and model fallbacks.");
}

export const chatEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "Missing or invalid 'messages' field in request body." });
      return;
    }

    try {
      const client = getGeminiClient();

      const contents = messages.map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content || m.text }],
      }));

      const response = await generateContentWithRetryAndFallback(
        client,
        contents,
        SYSTEM_INSTRUCTION
      );

      res.json({
        content: response.text || "I apologize, but I could not formulate a response at this moment.",
        success: true,
      });
    } catch (apiError: any) {
      console.error("Gemini API calling failed:", apiError);
      
      const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || "";
      let answer = "I am Yaksha AI, your chatbot companion. (Note: Gemini API Key is loading or unconfigured, returning local matching answer.)\n\n";
      
      const bestMatch = faqData.find(faq => 
        lastMessage.includes(faq.category.toLowerCase()) || 
        faq.question.toLowerCase().split(" ").some(word => word.length > 4 && lastMessage.includes(word)) ||
        faq.tags.some(tag => lastMessage.includes(tag.toLowerCase()))
      );

      if (bestMatch) {
        answer += `Based on official Vicharanashala FAQs:\n\n**${bestMatch.question}**\n\n${bestMatch.answer}\n\nCan I assist you with anything else regarding the ${bestMatch.category}?`;
      } else {
        answer += "Based on Vicharanashala Internship guidelines:\n\n- The program runs from June 1 to August 10, 2026.\n- Weekly Rosetta Journal updates are required by Saturday at 11:59 PM.\n- Please ensure you submit your NOC signed by your TPO by June 10, 2026.\n\nPlease type a specific keyword like NOC, ViBe, Certificate, or Stipend to get a tailored answer!";
      }

      res.json({
        content: answer,
        isFallback: true,
        success: true
      });
    }
  } catch (error: any) {
    console.error("Chat Server Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
};
