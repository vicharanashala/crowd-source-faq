import { z } from 'zod';

export const createPostSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(200),
  body: z.string().min(10, 'Body must be at least 10 characters').max(5000),
  batchId: z.string().optional(),
});

export const createCommentSchema = z.object({
  body: z.string().min(1, 'Comment cannot be empty').max(2000),
  parentId: z.string().optional(),
});

export const editCommentSchema = z.object({
  body: z.string().min(1).max(2000),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type EditCommentInput = z.infer<typeof editCommentSchema>;
