import { apiClient } from "./client";
import { Discussion, DiscussionDetail, Reply } from "../types";

export interface NewDiscussionPayload {
  title: string;
  description: string;
  category: string;
  tags?: string[];
  authorId: string;
}

export interface DiscussionFilters {
  search?: string;
  category?: string;
  tag?: string;
}

const buildQuery = (filters: DiscussionFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.category) params.set("category", filters.category);
  if (filters.tag) params.set("tag", filters.tag);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

export const discussionApi = {
  list: (filters?: DiscussionFilters) =>
    apiClient.get<Discussion[]>(`/discussions${buildQuery(filters)}`),

  getById: (id: string) => apiClient.get<DiscussionDetail>(`/discussions/${id}`),

  create: (payload: NewDiscussionPayload) =>
    apiClient.post<Discussion>("/discussions", payload),

  addReply: (discussionId: string, content: string, authorId: string) =>
    apiClient.post<Reply>(`/discussions/${discussionId}/replies`, {
      content,
      authorId,
    }),

  upvoteReply: (replyId: string, userId: string) =>
    apiClient.patch<Reply>(`/replies/${replyId}/upvote`, { userId }),

  acceptReply: (replyId: string, userId: string) =>
    apiClient.patch<Reply>(`/replies/${replyId}/accept`, { userId }),

  approveReply: (replyId: string) =>
    apiClient.patch<Reply>(`/replies/${replyId}/approve`),
};
