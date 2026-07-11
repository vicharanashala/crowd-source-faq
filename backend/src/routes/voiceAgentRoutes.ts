import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";

const router = Router();

// The voice agent reads FAQ content from its own local seed file (shipped
// alongside its static assets) rather than the main MongoDB-backed
// /api/faqs endpoint. This keeps the voice agent demo-able offline, exactly
// as it worked when it ran as its own standalone server on port 3100 —
// only the transport (now the shared backend port) has changed.
const SEED_PATH = path.join(__dirname, "../../voice-agent/data/faq-seed.json");
const FAQ_SOURCE = "local-seed:voice-agent/data/faq-seed.json";

let faqCache: { data: unknown[] | null; fetchedAt: number } = {
  data: null,
  fetchedAt: 0,
};

const loadFaqs = (): unknown[] => {
  if (faqCache.data) {
    return faqCache.data;
  }

  if (!fs.existsSync(SEED_PATH)) {
    throw new Error(`Seed file not found at ${SEED_PATH}.`);
  }

  const raw = fs.readFileSync(SEED_PATH, "utf8");
  const faqs = JSON.parse(raw);

  if (!Array.isArray(faqs) || !faqs.length) {
    throw new Error("voice-agent/data/faq-seed.json is empty or malformed");
  }

  faqCache = { data: faqs, fetchedAt: Date.now() };
  return faqs;
};

router.get("/api/faqs", (req: Request, res: Response) => {
  try {
    const faqs = loadFaqs();
    res.set("Cache-Control", "no-store");
    res.json({
      source: FAQ_SOURCE,
      fetchedAt: new Date(faqCache.fetchedAt).toISOString(),
      faqs,
    });
  } catch (error) {
    res.status(502).json({
      error: "Could not load the local FAQ seed",
      message: (error as Error).message,
    });
  }
});

export default router;
