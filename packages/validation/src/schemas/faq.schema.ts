import { z } from 'zod';

export const createFaqSchema = z.object({
  question: z.string().min(5, 'Question must be at least 5 characters').max(200),
  answer: z.string().min(10, 'Answer must be at least 10 characters').max(10000),
  category: z.string().min(1, 'Category is required'),
  batchId: z.string().optional(),
  freshnessTier: z.enum(['evergreen', 'seasonal', 'volatile']).default('evergreen'),
  reviewIntervalDays: z.number().int().positive().optional(),
});

export const updateFaqSchema = createFaqSchema.partial();

export type CreateFaqInput = z.infer<typeof createFaqSchema>;
export type UpdateFaqInput = z.infer<typeof updateFaqSchema>;
