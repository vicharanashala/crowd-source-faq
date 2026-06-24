import { Request, Response } from "express";
import { prisma } from "../services/db.js";
import { getGeminiClient } from "../services/gemini.js";
import { PRETRANSLATED_FAQS } from "../../data/pretranslations.js";

// Helper to format SQLite FAQ record into frontend-compatible FAQItem format
const formatFaq = (faq: any) => {
  return {
    ...faq,
    tags: faq.tags ? faq.tags.split(",").map((t: string) => t.trim()).filter((t: string) => t.length > 0) : [],
    related: faq.related ? (typeof faq.related === "string" ? faq.related.split(",") : faq.related) : []
  };
};

export const getFaqs = async (req: Request, res: Response): Promise<void> => {
  try {
    const faqs = await prisma.fAQ.findMany();
    const formattedFaqs = faqs.map(formatFaq);
    res.json({ success: true, faqs: formattedFaqs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const translateFaq = async (req: Request, res: Response): Promise<void> => {
  try {
    const { faqId, targetLang } = req.body;
    if (!faqId || !targetLang) {
      res.status(400).json({ error: "Missing faqId or targetLang" });
      return;
    }

    const originalFaq = await prisma.fAQ.findUnique({ where: { id: faqId } });
    if (!originalFaq) {
      res.status(404).json({ error: "FAQ not found" });
      return;
    }

    if (targetLang === "en") {
      res.json({ success: true, translated: formatFaq(originalFaq) });
      return;
    }

    if (PRETRANSLATED_FAQS[faqId] && PRETRANSLATED_FAQS[faqId][targetLang]) {
      const pTrans = PRETRANSLATED_FAQS[faqId][targetLang];
      const translatedItem = {
        ...originalFaq,
        question: pTrans.question,
        answer: pTrans.answer,
        tags: pTrans.tags ? pTrans.tags.join(",") : originalFaq.tags
      };
      res.json({ success: true, translated: formatFaq(translatedItem) });
      return;
    }

    const languageNames: Record<string, string> = {
      hi: "Hindi (हिन्दी)",
      pa: "Punjabi (ਪੰਜਾਬੀ)",
      es: "Spanish (Español)"
    };
    const targetLangName = languageNames[targetLang] || targetLang;

    try {
      const client = getGeminiClient();
      const systemInstruction = `You are an expert bilingual scientific and academic translator.
Translate the elements of the provided FAQ JSON object into ${targetLangName}.
Follow these strict guidelines:
1. Translate the "question" and "answer" text naturally and professionally into ${targetLangName}. Preserve any technical formatting.
2. Translate the "tags" into ${targetLangName} as single words or short tags.
3. Keep the keys identical.
4. Output ONLY valid JSON matching this schema: {"question":"...","answer":"...","tags":"tag1,tag2"}`;

      const textToTranslate = JSON.stringify({
        question: originalFaq.question,
        answer: originalFaq.answer,
        tags: originalFaq.tags
      });

      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: "user", parts: [{ text: textToTranslate }] }],
        config: {
          systemInstruction,
          temperature: 0.15,
          responseMimeType: "application/json"
        }
      });

      const raw = response.text?.trim() || "";
      const parsed = JSON.parse(raw);
      
      if (parsed.question && parsed.answer) {
        const translatedItem = {
          ...originalFaq,
          question: parsed.question,
          answer: parsed.answer,
          tags: parsed.tags || originalFaq.tags
        };
        res.json({ success: true, translated: formatFaq(translatedItem) });
        return;
      }
    } catch (apiErr: any) {
      console.warn(`[Translate API] Gemini failed for ${faqId}`, apiErr.message || apiErr);
    }

    res.json({ 
      success: false, 
      error: "Translation service unavailable", 
      translated: formatFaq(originalFaq) 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createFaq = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, question, answer, tags } = req.body;
    if (!category || !question || !answer) {
      res.status(400).json({ error: "Category, question, and answer are required." });
      return;
    }

    // Generate FAQ-XXX id based on the max existing number prefix
    const faqs = await prisma.fAQ.findMany({ select: { id: true } });
    let maxNum = 0;
    for (const faq of faqs) {
      const parts = faq.id.split("-");
      if (parts.length === 2) {
        const num = parseInt(parts[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
    const nextNum = maxNum + 1;
    const newId = `FAQ-${String(nextNum).padStart(3, "0")}`;

    const newFaq = await prisma.fAQ.create({
      data: {
        id: newId,
        category,
        question,
        answer,
        tags: Array.isArray(tags) ? tags.join(",") : (tags || ""),
        upvotes: 0,
        downvotes: 0,
        popularity: 0
      }
    });

    res.status(201).json({
      success: true,
      faq: formatFaq(newFaq)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteFaq = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "FAQ ID is required." });
      return;
    }

    const faq = await prisma.fAQ.findUnique({ where: { id } });
    if (!faq) {
      res.status(404).json({ error: "FAQ not found." });
      return;
    }

    await prisma.fAQ.delete({ where: { id } });
    res.json({ success: true, message: "FAQ successfully deleted." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
