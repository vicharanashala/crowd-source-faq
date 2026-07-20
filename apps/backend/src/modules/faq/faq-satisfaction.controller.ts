import { type Request, type Response } from 'express';
import { Types } from 'mongoose';

import FAQ from './faq.model.js';
import FaqSatisfactionRating from './faq-satisfaction-rating.model.js';
import { setGuestCookieIfMissing } from './public-faq.controller.js';
import { assertSameProgram } from '../../utils/db/scopedQuery.js';
import { adminLog } from '../../utils/http/logger.js';

async function recomputeSatisfaction(
  faqId: Types.ObjectId | string
) {
  const result = await FaqSatisfactionRating.aggregate([
    {
      $match: {
        faqId: new Types.ObjectId(faqId),
      },
    },
    {
      $group: {
        _id: '$faqId',
        satisfactionAvg: { $avg: '$rating' },
        satisfactionCount: { $sum: 1 },
      },
    },
  ]);

  const stats = result[0];

  if (!stats) {
    await FAQ.findByIdAndUpdate(faqId, {
      satisfactionAvg: null,
      satisfactionCount: 0,
    });

    return;
  }

  await FAQ.findByIdAndUpdate(faqId, {
    satisfactionAvg: stats.satisfactionAvg,
    satisfactionCount: stats.satisfactionCount,
  });
}

export { recomputeSatisfaction };

type SatisfactionIdentity =
  | { userId: Types.ObjectId }
  | { guestId: string };

interface SatisfactionResponse {
  satisfactionAvg: number | null;
  satisfactionCount: number;
  yourRating: number | null;
}

function getSatisfactionIdentity(req: Request, res: Response): SatisfactionIdentity {
  if (req.user?._id) {
    return { userId: req.user._id as Types.ObjectId };
  }

  return { guestId: setGuestCookieIfMissing(req, res) };
}

async function getSatisfactionResponse(
  faqId: Types.ObjectId,
  identity: SatisfactionIdentity,
): Promise<SatisfactionResponse> {
  const [faq, rating] = await Promise.all([
    FAQ.findById(faqId).select('satisfactionAvg satisfactionCount').lean(),
    FaqSatisfactionRating.findOne({ faqId, ...identity }).select('rating').lean(),
  ]);

  return {
    satisfactionAvg: faq?.satisfactionAvg ?? null,
    satisfactionCount: faq?.satisfactionCount ?? 0,
    yourRating: rating?.rating ?? null,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: number }).code === 11000;
}

/** POST /api/faq/:id/satisfaction — create or update the caller's rating. */
export async function submitSatisfaction(req: Request<{ id: string }>, res: Response): Promise<void> {
  try {
    const faq = await FAQ.findById(req.params.id).select('_id batchId');
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    if (assertSameProgram(faq, req.programContext, res)) return;

    const identity = getSatisfactionIdentity(req, res);
    const rating = (req.body as { rating: number }).rating;
    const filter = { faqId: faq._id, ...identity };

    try {
      await FaqSatisfactionRating.findOneAndUpdate(
        filter,
        { $set: { rating } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      // A simultaneous first rating may race on the unique identity index.
      // Once the competing insert exists, retry as a normal update.
      if (!isDuplicateKeyError(error)) throw error;
      await FaqSatisfactionRating.findOneAndUpdate(
        filter,
        { $set: { rating } },
        { new: true, runValidators: true },
      );
    }

    await recomputeSatisfaction(faq._id);
    res.json(await getSatisfactionResponse(faq._id, identity));
  } catch (error) {
    adminLog.error('[faqSatisfaction] submit failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ message: 'Unable to save satisfaction rating.' });
  }
}

/** GET /api/faq/:id/satisfaction — aggregate and the caller's prior rating. */
export async function getSatisfaction(req: Request<{ id: string }>, res: Response): Promise<void> {
  try {
    const faq = await FAQ.findById(req.params.id).select('_id batchId');
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    if (assertSameProgram(faq, req.programContext, res)) return;

    const identity = getSatisfactionIdentity(req, res);
    res.json(await getSatisfactionResponse(faq._id, identity));
  } catch (error) {
    adminLog.error('[faqSatisfaction] fetch failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ message: 'Unable to load satisfaction rating.' });
  }
}
