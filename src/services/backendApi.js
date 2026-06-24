const API_BASE = import.meta.env.VITE_API_URL || 'https://faq-project-5otr.onrender.com';

export async function askBackend(query) {
  const res = await fetch(`${API_BASE}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }

  return res.json();
}
