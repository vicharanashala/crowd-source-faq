import { z } from 'zod';

export const createReminderSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(200, 'Title cannot exceed 200 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(3000, 'Description cannot exceed 3000 characters'),
  eventDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  tags: z.array(z.string()).max(5, 'Maximum 5 tags allowed').optional().default([]),
});

export const updateReminderSchema = createReminderSchema.partial();

export const voteReminderSchema = z.object({
  voteType: z.enum(['up', 'down']),
});

export const createImportantLinkSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(150, 'Title cannot exceed 150 characters'),
  url: z.string().url('Must be a valid URL'),
  category: z.string().min(1, 'Category is required').max(50),
  description: z.string().max(500).optional(),
  order: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateImportantLinkSchema = createImportantLinkSchema.partial();

export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
export type VoteReminderInput = z.infer<typeof voteReminderSchema>;
export type CreateImportantLinkInput = z.infer<typeof createImportantLinkSchema>;
export type UpdateImportantLinkInput = z.infer<typeof updateImportantLinkSchema>;
