import FAQ from './faq.model.js';
import { resolveProviderAsync, chatWithConfig } from '../../utils/ai/aiProvider.js';
import { logger } from '../../utils/http/logger.js';

export async function runFaqDriftGuard(): Promise<void> {
  try {
    logger.info('[drift-guard] Starting FAQ drift check...');

    const faqs = await FAQ.find({ status: 'approved' });
    if (faqs.length === 0) {
      logger.info('[drift-guard] No approved FAQs found. Skipping.');
      return;
    }

    const aiConfig = await resolveProviderAsync();
    if (!aiConfig || !aiConfig.apiKey) {
      logger.warn('[drift-guard] AI provider API key is missing. Skipping drift check.');
      return;
    }

    let checkedCount = 0;
    let driftCount = 0;

    for (const faq of faqs) {
      const q = faq.question;
      const a = faq.answer;

      const hasCode = a.includes('`') || a.includes('```') || a.includes('npm') || a.includes('pnpm') || a.includes('install') || a.includes('git') || a.includes('docker');
      if (!hasCode) continue;

      checkedCount++;

      const prompt = `You are a technical documentation verification assistant. Your task is to check if the following FAQ question and answer contains outdated code, deprecated APIs, deprecated package names, obsolete command line syntax, or outdated references that might lead to user failure or "drift".

Question: ${q}
Answer: ${a}

If the instructions, code snippets, package names, or APIs are likely outdated, respond with exactly:
OUTDATED: <Detailed explanation of what is outdated, what APIs/packages/commands are deprecated, and what the correct updated version should be.>

If the instructions and commands are correct, up-to-date, or you are unsure, respond with exactly:
UP_TO_DATE: No drift detected.

Your response must start with either 'OUTDATED: ' or 'UP_TO_DATE: '. Do not include any markdown formatting or surrounding brackets.`;

      try {
        const response = await chatWithConfig(aiConfig, [
          { role: 'user', content: prompt }
        ]);

        const cleaned = response.trim();
        faq.lastDriftCheckAt = new Date();

        if (cleaned.startsWith('OUTDATED:')) {
          faq.isLikelyOutdated = true;
          faq.driftReason = cleaned.replace(/^OUTDATED:\s*/i, '');
          driftCount++;
          logger.warn(`[drift-guard] FAQ "${q.slice(0, 40)}..." flagged as OUTDATED. Reason: ${faq.driftReason}`);
        } else {
          faq.isLikelyOutdated = false;
          faq.driftReason = null;
        }

        await faq.save();
      } catch (err) {
        logger.warn(`[drift-guard] Failed to verify FAQ "${q.slice(0, 30)}": ${(err as Error).message}`);
      }
    }

    logger.info(`[drift-guard] Drift check complete. Checked: ${checkedCount}, Drift detected: ${driftCount}`);
  } catch (err) {
    logger.error(`[drift-guard] Drift-guard service failed: ${(err as Error).message}`);
  }
}
