import { apiClient } from "./client";
import type { Escalation, EscalationAnalytics } from "../types";

// Matches backend/src/routes/escalationRoutes.ts exactly.
export const escalationApi = {
  create: (data: {
    title: string;
    description: string;
    category: string;
    priority: string;
  }) => apiClient.post<Escalation>("/escalations", data),

  // Edit within 30-minute window
  update: (
    id: string,
    data: { title?: string; description?: string; category?: string; priority?: string }
  ) => apiClient.patch<Escalation>(`/escalations/${id}`, data),

  getAll: () => apiClient.get<Escalation[]>("/escalations"),

  getMine: () => apiClient.get<Escalation[]>("/escalations/my"),

  getAnalytics: () => apiClient.get<EscalationAnalytics>("/escalations/analytics"),

  assign: (id: string, team: string) =>
    apiClient.patch<Escalation>(`/escalations/${id}/assign`, { team }),

  updateStatus: (id: string, status: string, resolutionNotes?: string) =>
    apiClient.patch<Escalation>(`/escalations/${id}/status`, {
      status,
      resolutionNotes,
    }),

  reopen: (id: string) => apiClient.patch<Escalation>(`/escalations/${id}/reopen`),

  addNote: (id: string, text: string) =>
    apiClient.post<Escalation>(`/escalations/${id}/notes`, { text }),
};
