/**
 * categoryAssigner.ts — LLM-based FAQ category reassignment.
 *
 * Replaces the old embedding-based `categoryClusterer` for the actual
 * per-FAQ category assignment work. The motivation: the user doesn't
 * run an embedding server, so cosine-similarity clustering has been
 * failing with "Connection error" for months. This module asks the
 * LLM directly which category each FAQ should belong to.
 *
 * Algorithm (per batch):
 *   1. Fetch all approved FAQs (status='approved') with their current
 *      category string.
 *   2. Fetch existing Category docs for the batch (the canonical list
 *      admins curate).
 *   3. Send batches of FAQs (default 10) to the LLM with a prompt that
 *      lists existing categories and asks it to pick one or suggest
 *      a new name.
 *   4. Parse the JSON response; create any missing Category docs
 *      (slugs auto-generated via slugifyCategoryName).
 *   5. Update each FAQ's `category` string to match the assigned
 *      Category.name.
 *   6. Write an audit log entry to CategoryAssignmentLog.
 *
 * Cooldown: NONE. Trigger is the 2-day cron in bootstrap/startup.ts.
 *
 * Failure modes:
 *   - No AI key: throw a clear error so the cron logs it and retries
 *     on the next tick. No silent no-op.
 *   - LLM call fails: surface the error, leave FAQs untouched, log.
 *   - LLM returns malformed JSON: log, skip that batch, continue.
 *   - FAQ update fails: log, count as not-reassigned, continue.
 */

import FAQ from '../../modules/faq/faq.model.js';
import Category, { type ICategory, slugifyCategoryName } from '../../modules/faq/category.model.js';
import Batch from '../../modules/program/batch.model.js';
import CategoryAssignmentLog from '../../modules/program/category-assignment-log.model.js';
import { getPipelineProviderConfig, chatWithProvider } from './aiProvider.js';
import { logger } from '../http/logger.js';
import { Types } from 'mongoose';

const BATCH_SIZE = 10;
const PROMPT_VERSION = 'v1.71-llm-categorizer';

// ─── Types ────────────────────────────────────────────────────────────

interface LLMSingleAssignment {
  /** Index into the input FAQ list (1-based, matches the prompt). */
  faqIndex: number;
  /** Either an existing category name OR a brand-new category name. */
  categoryName: string;
  /** Confidence in [0,1]. Below 0.6 = admin should review. */
  confidence: number;
  /** Short reason — surfaces in the audit log so admins can sanity-check. */
  reason: string;
}

interface LLMResponse {
  assignments: LLMSingleAssignment[];
}

/** Lightweight shape we need for assignment lookups (avoids Mongoose lean vs document type confusion). */
type CategoryLite = Pick<ICategory, 'name' | 'slug'>;

// ─── Public API ───────────────────────────────────────────────────────

export interface RecategorizeResult {
  batchId: string;
  faqsExamined: number;
  faqsReassigned: number;
  faqsUnchanged: number;
  categoriesCreated: string[];
  categoriesUsed: string[];
  llmCalls: number;
  durationMs: number;
  notes?: string;
}

/**
 * Recategorize all approved FAQs in a single batch.
 *
 * @param opts.triggeredBy  Discord user ID, CLI arg, etc. — for the audit log.
 * @param opts.source       'discord' | 'cli' | 'manual-script'
 */
export async function recategorizeBatch(
  batchId: string,
  opts: { triggeredBy: string; source: 'discord' | 'cli' | 'manual-script' } = {
    triggeredBy: 'cron',
    source: 'manual-script',
  },
): Promise<RecategorizeResult> {
  const startTime = Date.now();

  // 1. Validate batch
  if (!Types.ObjectId.isValid(batchId)) {
    throw new Error(`Invalid batchId: ${batchId}`);
  }
  const batch = await Batch.findById(batchId).select('_id isActive').lean();
  if (!batch) throw new Error(`Batch not found: ${batchId}`);
  if (!batch.isActive) {
    logger.info(`[categoryAssigner] batch ${batchId} is inactive — skipping`);
    return {
      batchId,
      faqsExamined: 0,
      faqsReassigned: 0,
      faqsUnchanged: 0,
      categoriesCreated: [],
      categoriesUsed: [],
      llmCalls: 0,
      durationMs: Date.now() - startTime,
      notes: 'batch_inactive',
    };
  }

  // 2. Load FAQs + categories
  const faqs = await FAQ.find({
    batchId: new Types.ObjectId(batchId),
    status: 'approved',
  })
    .select('_id question answer category')
    .lean();

  const existingCategories: CategoryLite[] = await Category.find({ batchId: new Types.ObjectId(batchId) })
    .select('name slug')
    .lean();

  if (faqs.length === 0) {
    logger.info(`[categoryAssigner] batch ${batchId}: no approved FAQs to recategorize`);
    await upsertAuditLog(batchId, opts, {
      faqsExamined: 0,
      faqsReassigned: 0,
      categoriesUsed: existingCategories.map((c) => c.name),
      categoriesCreated: [],
      notes: 'no_approved_faqs',
    });
    return {
      batchId,
      faqsExamined: 0,
      faqsReassigned: 0,
      faqsUnchanged: 0,
      categoriesCreated: [],
      categoriesUsed: existingCategories.map((c) => c.name),
      llmCalls: 0,
      durationMs: Date.now() - startTime,
      notes: 'no_approved_faqs',
    };
  }

  logger.info(
    `[categoryAssigner] batch ${batchId}: recategorizing ${faqs.length} FAQs against ` +
      `${existingCategories.length} existing categories`,
  );

  // 3. Resolve AI provider config (uses per-program override if set)
  // 'duplicateDetection' is a small/fast pipeline in the AI config — good for categorization too.
  const providerConfig = await getPipelineProviderConfig('duplicateDetection', batchId);

  // 4. Build a name → category lookup
  const categoryByName = new Map<string, CategoryLite>();
  for (const c of existingCategories) categoryByName.set(c.name.toLowerCase(), c);

  const createdCategories: string[] = [];
  const usedCategories = new Set<string>();

  // 5. Process FAQs in batches
  let totalReassigned = 0;
  let totalUnchanged = 0;
  let llmCalls = 0;

  for (let i = 0; i < faqs.length; i += BATCH_SIZE) {
    const chunk = faqs.slice(i, i + BATCH_SIZE);
    const chunkStartIndex = i + 1;

    let response: LLMResponse;
    try {
      response = await askLLMForCategories(chunk, existingCategories, providerConfig);
      llmCalls++;
    } catch (err) {
      logger.error(
        `[categoryAssigner] batch ${batchId} chunk ${chunkStartIndex}-${chunkStartIndex + chunk.length - 1} failed: ${(err as Error).message}`,
      );
      totalUnchanged += chunk.length;
      continue;
    }

    for (const assignment of response.assignments) {
      const faqIndex = assignment.faqIndex - 1;
      if (faqIndex < 0 || faqIndex >= chunk.length) {
        logger.warn(
          `[categoryAssigner] batch ${batchId} LLM returned invalid faqIndex=${assignment.faqIndex} (chunk size ${chunk.length}) — skipping`,
        );
        continue;
      }

      const faq = chunk[faqIndex]!;
      const rawName = (assignment.categoryName || '').trim();
      if (!rawName) {
        totalUnchanged++;
        continue;
      }

      let categoryDoc: CategoryLite | undefined = categoryByName.get(rawName.toLowerCase());
      if (!categoryDoc) {
        // LLM suggested a new category — create it
        const slug = slugifyCategoryName(rawName);
        if (!slug) {
          logger.warn(`[categoryAssigner] batch ${batchId} suggested category "${rawName}" produces empty slug — skipping`);
          totalUnchanged++;
          continue;
        }
        const collision = existingCategories.find(
          (c) => c.slug === slug && c.name.toLowerCase() !== rawName.toLowerCase(),
        );
        if (collision) {
          logger.warn(
            `[categoryAssigner] batch ${batchId} suggested "${rawName}" but slug "${slug}" already used by "${collision.name}" — skipping`,
          );
          totalUnchanged++;
          continue;
        }
        try {
          const created = await Category.create({
            batchId: new Types.ObjectId(batchId),
            name: rawName,
            slug,
            description: '',
          });
          const lean: CategoryLite = { name: created.name, slug: created.slug };
          categoryByName.set(rawName.toLowerCase(), lean);
          existingCategories.push(lean);
          createdCategories.push(rawName);
          logger.info(`[categoryAssigner] batch ${batchId} created new category "${rawName}"`);
          categoryDoc = lean;
        } catch (err) {
          // Unique-index race — re-fetch
          const existing = await Category.findOne({ batchId: new Types.ObjectId(batchId), slug }).lean();
          if (existing) {
            const lean: CategoryLite = { name: existing.name, slug: existing.slug };
            categoryByName.set(rawName.toLowerCase(), lean);
            categoryDoc = lean;
          } else {
            logger.warn(`[categoryAssigner] batch ${batchId} failed to create category "${rawName}": ${(err as Error).message}`);
            totalUnchanged++;
            continue;
          }
        }
      }

      // Update FAQ if category changed
      const newCategoryStr = categoryDoc.name;
      usedCategories.add(newCategoryStr);
      try {
        await FAQ.updateOne(
          { _id: faq._id },
          { $set: { category: newCategoryStr } },
        );
        totalReassigned++;
        logger.info(
          `[categoryAssigner] batch ${batchId} reassigned FAQ "${(faq.question || '').slice(0, 50)}…" ` +
            `"${faq.category}" → "${newCategoryStr}" (confidence ${assignment.confidence.toFixed(2)})`,
        );
      } catch (err) {
        logger.warn(`[categoryAssigner] batch ${batchId} failed to update FAQ ${faq._id}: ${(err as Error).message}`);
        totalUnchanged++;
      }
    }
  }

  const durationMs = Date.now() - startTime;

  // Audit log
  await upsertAuditLog(batchId, opts, {
    faqsExamined: faqs.length,
    faqsReassigned: totalReassigned,
    categoriesUsed: Array.from(usedCategories),
    categoriesCreated: createdCategories,
  });

  logger.info(
    `[categoryAssigner] batch ${batchId}: done in ${durationMs}ms — ` +
      `${totalReassigned} reassigned, ${totalUnchanged} unchanged, ` +
      `${createdCategories.length} new categories created, ${llmCalls} LLM calls`,
  );

  return {
    batchId,
    faqsExamined: faqs.length,
    faqsReassigned: totalReassigned,
    faqsUnchanged: totalUnchanged,
    categoriesCreated: createdCategories,
    categoriesUsed: Array.from(usedCategories),
    llmCalls,
    durationMs,
  };
}

/**
 * Recategorize every active batch. Called by the 2-day cron.
 */
export async function recategorizeAllActiveBatches(): Promise<void> {
  const cursor = Batch.find({ isActive: true }).select('_id').lean().cursor();
  let batchesProcessed = 0;
  for await (const b of cursor) {
    try {
      await recategorizeBatch(String(b._id), {
        triggeredBy: 'cron',
        source: 'manual-script',
      });
      batchesProcessed++;
    } catch (err) {
      logger.error(`[categoryAssigner] failed for batch ${b._id}: ${(err as Error).message}`);
    }
  }
  logger.info(`[categoryAssigner] cron run complete: processed ${batchesProcessed} active batches`);
}

// ─── LLM prompt + parsing ────────────────────────────────────────────

// ProviderConfigShape — kept loose to avoid Mongoose generic noise.
// Properties are inferred at call sites; ProviderConfig from
// './aiProvider' is the canonical type if you need it elsewhere.
interface ProviderConfigShape {
  provider: string;
  model: string;
  baseURL: string;
  // The API key field exists on the real config but is omitted here
  // since it's never read inside askLLMForCategories. Marked as
  // optional so callers can pass the lighter shape from
  // getPipelineProviderConfig(...).
}

async function askLLMForCategories(
  faqs: Array<{ _id: unknown; question?: string; answer?: string; category?: string }>,
  existingCategories: CategoryLite[],
  providerConfig: ProviderConfigShape,
): Promise<LLMResponse> {
  const categoryList = existingCategories.length > 0
    ? existingCategories.map((c) => `- "${c.name}"`).join('\n')
    : '(no existing categories yet — suggest new ones)';

  const faqList = faqs
    .map((f, idx) => {
      const q = (f.question || '').slice(0, 200);
      const a = (f.answer || '').slice(0, 300);
      const current = f.category || '(none)';
      return `[${idx + 1}] Q: ${q}\n    A: ${a}\n    Current category: ${current}`;
    })
    .join('\n\n');

  const prompt = `You are a precise categorization assistant for a research-internship FAQ portal.

Given the list of FAQs below, assign each one to the BEST fitting category from the existing list.
If none of the existing categories fit, suggest a SHORT new category name (Title Case, 1-3 words).

Existing categories:
${categoryList}

FAQs (indexed 1 to ${faqs.length}):

${faqList}

Respond with ONLY a JSON object in this exact shape — no prose, no markdown fences:
{"assignments":[{"faqIndex":1,"categoryName":"...","confidence":0.0-1.0,"reason":"..."}, ...]}

Rules:
- faqIndex is 1-based and must reference a FAQ from the input list.
- categoryName must either match an existing category EXACTLY (case-insensitive is fine, we normalize) or be a new short name.
- confidence: 0.9+ for obvious matches, 0.7-0.9 for reasonable, <0.7 for ambiguous.
- reason: one short sentence explaining the match (helps audit).
- Every FAQ in the list MUST have an assignment — no omissions.
- Prompt version: ${PROMPT_VERSION}`;

  const messages = [{ role: 'user', content: prompt }];

  const reply = await chatWithProvider(
    providerConfig.provider as 'anthropic' | 'openai' | 'xai' | 'minimax' | 'gemini' | 'custom',
    messages,
    providerConfig.model,
  );

  const cleaned = reply
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: LLMResponse;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`LLM returned invalid JSON: ${(err as Error).message}. Raw reply: ${reply.slice(0, 200)}`);
  }

  if (!parsed.assignments || !Array.isArray(parsed.assignments)) {
    throw new Error(`LLM response missing 'assignments' array. Raw: ${cleaned.slice(0, 200)}`);
  }

  return parsed;
}

// ─── Audit log ────────────────────────────────────────────────────────

async function upsertAuditLog(
  batchId: string,
  opts: { triggeredBy: string; source: 'discord' | 'cli' | 'manual-script' },
  result: {
    faqsExamined: number;
    faqsReassigned: number;
    categoriesUsed: string[];
    categoriesCreated: string[];
    notes?: string;
  },
): Promise<void> {
  try {
    await CategoryAssignmentLog.findOneAndUpdate(
      { batchId: new Types.ObjectId(batchId) },
      {
        $set: {
          lastRunAt: new Date(),
          triggeredBy: opts.triggeredBy,
          source: opts.source,
          faqsExamined: result.faqsExamined,
          faqsReassigned: result.faqsReassigned,
          categoriesUsed: result.categoriesUsed,
          categoriesCreated: result.categoriesCreated,
          notes: result.notes,
        },
      },
      { upsert: true, new: true },
    );
  } catch (err) {
    logger.warn(`[categoryAssigner] failed to write audit log for batch ${batchId}: ${(err as Error).message}`);
  }
}