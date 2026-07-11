const API_BASE = "/api/faqs";

export const getFAQs = async () => {
  const res = await fetch(API_BASE);

  if (!res.ok) {
    throw new Error("Failed to fetch FAQs");
  }

  return res.json();
};

export const createFAQ = async (faq) => {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(faq),
  });

  if (!res.ok) {
    throw new Error("Failed to create FAQ");
  }

  return res.json();
};