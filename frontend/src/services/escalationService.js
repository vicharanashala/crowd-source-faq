const API_BASE = "/api/escalations"; // adjust if your backend runs on a different origin

// Helper to attach auth token if you're using one
const authHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

// authHeaders() without Content-Type — used for FormData requests where
// the browser needs to set its own multipart boundary header
const authHeadersNoContentType = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const submitEscalation = async (data, files = []) => {
  // If there are attachments, submit as multipart/form-data.
  // Otherwise, keep the lighter plain-JSON request.
  if (files.length > 0) {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => formData.append(key, value));
    files.forEach((file) => formData.append("attachments", file));

    const res = await fetch(API_BASE, {
      method: "POST",
      headers: authHeadersNoContentType(),
      body: formData,
    });
    if (!res.ok) throw new Error("Failed to submit escalation");
    return res.json();
  }

  const res = await fetch(API_BASE, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to submit escalation");
  return res.json();
};

export const getMyEscalations = async () => {
  const res = await fetch(`${API_BASE}/my`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch your escalations");
  return res.json();
};

export const getAllEscalations = async (filters = {}) => {
  const params = new URLSearchParams(filters).toString();
  const res = await fetch(`${API_BASE}?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch escalations");
  return res.json();
};

export const assignEscalation = async (id, team) => {
  const res = await fetch(`${API_BASE}/${id}/assign`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ team }),
  });
  if (!res.ok) throw new Error("Failed to assign escalation");
  return res.json();
};

export const updateEscalationStatus = async (id, status, resolutionNotes) => {
  const res = await fetch(`${API_BASE}/${id}/status`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ status, resolutionNotes }),
  });
  if (!res.ok) throw new Error("Failed to update status");
  return res.json();
};

export const reopenEscalation = async (id) => {
  const res = await fetch(`${API_BASE}/${id}/reopen`, {
    method: "PATCH",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to reopen escalation");
  return res.json();
};

export const addInternalNote = async (id, text) => {
  const res = await fetch(`${API_BASE}/${id}/notes`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Failed to add note");
  return res.json();
};

export const getAnalytics = async () => {
  const res = await fetch(`${API_BASE}/analytics`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch analytics");
  return res.json();
};
