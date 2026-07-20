import { Types } from 'mongoose';

import FAQ from './faq.model.js';
import FaqSatisfactionRating from './faq-satisfaction-rating.model.js';

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
