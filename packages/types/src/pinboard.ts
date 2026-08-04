export type PriorityLevel = 'low' | 'medium' | 'high';
export type VoteType = 'up' | 'down';

export interface ICommunityReminder {
  _id: string;
  title: string;
  description: string;
  eventDate?: string | Date;
  priority: PriorityLevel;
  tags: string[];
  author: {
    _id: string;
    name: string;
    avatar?: string;
  };
  upvotes: string[];
  downvotes: string[];
  score: number;
  isPinned: boolean;
  pinnedAt?: string | Date;
  pinnedBy?: string;
  isVerified: boolean;
  verifiedAt?: string | Date;
  verifiedBy?: string;
  batchId?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface IImportantLink {
  _id: string;
  title: string;
  url: string;
  category: string;
  description?: string;
  order: number;
  isActive: boolean;
  batchId?: string;
  createdBy: {
    _id: string;
    name: string;
  };
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface IReminderBookmark {
  _id: string;
  user: string;
  reminder: ICommunityReminder | string;
  createdAt: string | Date;
}

export interface ReminderQueryFilters {
  search?: string;
  tag?: string;
  priority?: PriorityLevel;
  sortBy?: 'date' | 'votes' | 'priority' | 'pinned';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}
