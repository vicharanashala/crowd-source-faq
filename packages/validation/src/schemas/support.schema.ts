import { z } from 'zod';

export const createSupportRequestSchema = z.object({
  issueType: z.string().min(1, 'Issue type is required'),
  description: z.string().min(10, 'Please describe your issue in more detail').max(5000),
  contextFields: z.record(z.string(), z.unknown()).optional(),
  evidence: z.array(z.string().url()).max(5).optional(),
});

export const addFollowUpSchema = z.object({
  body: z.string().min(1, 'Follow-up cannot be empty').max(2000),
});

export type CreateSupportRequestInput = z.infer<typeof createSupportRequestSchema>;
export type AddFollowUpInput = z.infer<typeof addFollowUpSchema>;
