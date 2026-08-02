export interface Reminder {
  id: string;

  title: string;

  content: string;

  authorId: string;

  authorName: string;

  createdAt: string;

  updatedAt?: string;

  upvotes: number;

  downvotes: number;

  isPinned: boolean;

  isVerified: boolean;

  isBookmarked?: boolean;

  tags?: string[];
}