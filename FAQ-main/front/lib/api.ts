import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export const api = axios.create({ baseURL: API_URL, timeout: 15000 });

// ── Request interceptor — attach Bearer token ──────────────────
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor — handle 403 ban suspension ──────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      typeof window !== "undefined" &&
      error?.response?.status === 403 &&
      error?.response?.data?.message === "Your account has been suspended."
    ) {
      // Lazy import to avoid circular deps at module load time
      import("@/store/authStore").then(({ useAuthStore }) => {
        useAuthStore.getState().logout();
        window.location.href = "/login?banned=1";
      });
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  register: (data: { name: string; email: string; password: string; title?: string }) =>
    api.post("/auth/register", data),
  login: (data: { email: string; password: string }) => api.post("/auth/login", data),
  getMe: () => api.get("/auth/me"),
  updateProfile: (data: { name?: string; title?: string; avatar?: string; bio?: string }) =>
    api.put("/auth/profile", data),
};

export const postsApi = {
  getAll: (params?: { category?: string; search?: string; sort?: string; myQuestions?: boolean; bookmarked?: boolean }) =>
    api.get("/posts", { params }),
  getById: (id: string) => api.get(`/posts/${id}`),
  create: (data: { title: string; category: string; intro?: string; description?: string }) =>
    api.post("/posts", data),
  vote: (id: string, dir: "up" | "down" | null) => api.post(`/posts/${id}/vote`, { dir }),
  bookmark: (id: string) => api.post(`/posts/${id}/bookmark`),
  delete: (id: string) => api.delete(`/posts/${id}`),
  addComment: (id: string, content: string) => api.post(`/posts/${id}/comments`, { content }),
  addReply: (postId: string, commentId: string, content: string) =>
    api.post(`/posts/${postId}/comments/${commentId}/replies`, { content }),
  likeComment: (postId: string, commentId: string) =>
    api.post(`/posts/${postId}/comments/${commentId}/like`),
};

export const faqsApi = {
  getAll: () => api.get("/faqs"),
  search: (q: string) => api.get("/faqs/search", { params: { q } }),
  getById: (id: string) => api.get(`/faqs/${id}`),
  create: (data: { question: string; answer: string; category?: string; tags?: string[]; source?: string }) =>
    api.post("/faqs", data),
};

export const answersApi = {
  getByPost: (postId: string) => api.get(`/posts/${postId}/answers`),
  create: (postId: string, content: string) => api.post(`/posts/${postId}/answers`, { content }),
  upvote: (answerId: string) => api.post(`/answers/${answerId}/upvote`),
  accept: (answerId: string) => api.post(`/answers/${answerId}/accept`),
};

export const aiApi = {
  ask: (question: string) => api.post("/ai/ask", { question }),
  chat: (query: string) => api.post("/ai/chat", { query }),
  health: () => api.get("/ai/health"),
  getUnanswered: (params?: { limit?: number; skip?: number }) =>
    api.get("/ai/unanswered", { params }),
  uploadFAQ: (file: File) => {
    const fd = new FormData(); fd.append("file", file);
    return api.post("/ai/upload-faq", fd, { headers: { "Content-Type": "multipart/form-data" } });
  },
  uploadPDF: (file: File) => {
    const fd = new FormData(); fd.append("file", file);
    return api.post("/ai/upload-pdf", fd, { headers: { "Content-Type": "multipart/form-data" } });
  },
  // Feature 2 — Repetition Trends
  getRepetitionClusters: () => api.get("/ai/repetition-clusters"),
  promoteRepetitionCluster: (id: string) => api.post(`/ai/repetition-clusters/${id}/promote`),
  dismissRepetitionCluster: (id: string) => api.post(`/ai/repetition-clusters/${id}/dismiss`),
};

// Feature 1 — Direct Questions
export const directQuestionsApi = {
  create: (data: {
    question: string;
    context?: string;
    source?: "faq_search" | "ai_chat" | "manual";
    originalQuery?: string;
    askedBy?: { name?: string; email?: string };
  }) => api.post("/direct-questions", data),
  getAll: (status?: string) =>
    api.get("/direct-questions", { params: status ? { status } : {} }),
  answer: (id: string, answer: string) =>
    api.put(`/direct-questions/${id}/answer`, { answer }),
  dismiss: (id: string) => api.put(`/direct-questions/${id}/dismiss`),
  convertToFaq: (
    id: string,
    data: { category?: string; tags?: string[]; source?: string; answer?: string }
  ) => api.post(`/direct-questions/${id}/convert-to-faq`, data),
};

// Feature 3 — User Management + Audit Log
export const usersApi = {
  getAll: (params?: { search?: string; role?: string; banned?: boolean }) =>
    api.get("/users", { params }),
  getById: (id: string) => api.get(`/users/${id}`),
  ban: (id: string, reason: string) => api.put(`/users/${id}/ban`, { reason }),
  unban: (id: string) => api.put(`/users/${id}/unban`),
};

export const auditLogsApi = {
  getAll: (params?: { limit?: number; skip?: number; action?: string }) =>
    api.get("/audit-logs", { params }),
};
