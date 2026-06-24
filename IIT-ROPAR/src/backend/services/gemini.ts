import { GoogleGenAI } from "@google/genai";
import { faqData } from "../../data/faqs.js";

let aiClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      throw new Error("GEMINI_API_KEY is not configured or contains placeholder.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

export const SYSTEM_INSTRUCTION = `You are "Yaksha AI" (or "Yaksha-mini"), the advanced AI-powered Internship Support Assistant for the "Vicharanashala Internship Program" and and ViBe Learning Platform at the prestigious Indian Institute of Technology Ropar (IIT Ropar).

Your primary mission is to provide accurate, helpful, and polite answers regarding the internship program and learning platform.

--- KEY GROUNDING INFORMATION (VICHARANASHALA FAQ KNOWLEDGE BASE) ---
${JSON.stringify(faqData, null, 2)}
---------------------------------------------------------------------

GUIDELINES FOR RESPONSE:
1. Grounded Accuracy: ALWAYS prioritize the dates, rules, and facts from the FAQ knowledge base.
2. If the user asks something outside the provided FAQs, state that the official FAQ does not specify it when it's factual/procedural program logistics.
3. Conversational Tone: Be highly professional, helpful, tech-savvy, and structured. Use Markdown for lists, bold points, and codeblocks.
4. Keep answers concise, clear, and action-oriented.`;
