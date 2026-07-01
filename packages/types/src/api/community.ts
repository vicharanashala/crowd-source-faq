// ── Community API Contracts ───────────────────────────────────────

export interface CreatePostRequest {
  title: string;
  body: string;
  batchId?: string;
}

export interface CreateCommentRequest {
  body: string;
  parentId?: string;
}
