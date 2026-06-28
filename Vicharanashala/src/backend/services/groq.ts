import { prisma } from './db.js';

// Read API key
const apiKey = process.env.GROQ_API_KEY;

const SYSTEM_PROMPT = `You are Yaksha, the AI oracle of the Vicharanashala Internship Program at IIT Ropar. 
You have deep knowledge of all program rules, NOC requirements, ViBe platform rules, Rosetta Journal requirements, team formation rules, stipend policies, and all FAQs. 
Be concise, accurate, and slightly mystical in tone.

Here is the official knowledge base context for Vicharanashala Program:
{CONTEXT}`;

// Helper to find relevant FAQs locally to build context or for fallback
async function getFaqContext(query: string): Promise<{ context: string; faqIds: string[] }> {
  const faqs = await prisma.fAQ.findMany();
  
  // A simple matching filter based on keywords in query
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  const matched = faqs.filter(faq => {
    const qText = faq.question.toLowerCase();
    const aText = faq.answer.toLowerCase();
    const tagsText = faq.tags.toLowerCase();
    return keywords.some(kw => qText.includes(kw) || aText.includes(kw) || tagsText.includes(kw));
  });

  const targets = matched.length > 0 ? matched.slice(0, 5) : faqs.slice(0, 5);
  
  const context = targets
    .map(f => `Q: ${f.question}\nA: ${f.answer}`)
    .join('\n\n');

  const faqIds = targets.map(f => f.id);
  return { context, faqIds };
}

// Fallback mystical AI responder in case Groq key is missing or fails
async function getMysticalFallback(query: string, context: string): Promise<string> {
  const faqs = await prisma.fAQ.findMany();
  const lowerQuery = query.toLowerCase();
  
  const bestMatch = faqs.find(faq => {
    const q = faq.question.toLowerCase();
    const t = faq.tags.toLowerCase();
    return lowerQuery.includes(q) || JSON.parse(t).some((tag: string) => lowerQuery.includes(tag.toLowerCase()));
  });

  if (bestMatch) {
    return `Greetings, Seeker. The cosmic threads reveal the following: ${bestMatch.answer} Keep your gaze steady on the path.`;
  }

  if (lowerQuery.includes('noc')) {
    return "Ah, the No Objection Certificate. The oracle sees this: You must upload it via the 'NOC & Documents' block in your User Dashboard by June 10, 2026. A missing NOC shatters the flow of stipend and certificate.";
  }
  if (lowerQuery.includes('stipend') || lowerQuery.includes('paid')) {
    return "Stipends flow to those who complete the weekly Rosetta Journal logs and achieve milestone approvals. The currents release them in the first week of each subsequent month. Satisfy the three participation rules: 85% Zoom presence, 85% response rate, 50% quiz score.";
  }
  if (lowerQuery.includes('rosetta') || lowerQuery.includes('journal') || lowerQuery.includes('logs')) {
    return "The Rosetta Journal is your system engineering diary. Record your code commits, readings, and milestones. Submit it every Saturday by 11:59 PM on ViBe, lest the mentors withhold validation of your stipend.";
  }
  if (lowerQuery.includes('vibe') || lowerQuery.includes('platform')) {
    return "ViBe is the sacred workspace of Vicharanashala. Access it on laptop or desktop only. Clear your browser cache and flush your local DNS (ipconfig /flushdns) if portal locked.";
  }
  if (lowerQuery.includes('team') || lowerQuery.includes('size')) {
    return "Teams must have 4 members, assigned or formed according to program rules. Communication occurs via Slack or LinkedIn/Email. WhatsApp groups are forbidden. Inactive members must be reported to mentors.";
  }
  if (lowerQuery.includes('participation') || lowerQuery.includes('zoom') || lowerQuery.includes('quiz')) {
    return "The rolling 5-day evaluation monitors your devotion. You must attend 85% of Zoom sessions, answer 85% of polls, and pass all quizzes with at least 50%. Fall short, and you will be moved to a subsequent batch.";
  }

  return "The oracle's chamber hums with quiet energy. Your query, '" + query + "', is registered. Seek knowledge in the 3D Knowledge Graph or traditional FAQ listings below, and the truth shall manifest.";
}

export interface YakshaResult {
  text: string;
  citations: string[];
}

export async function askYaksha(query: string, userId?: string): Promise<YakshaResult> {
  const { context, faqIds } = await getFaqContext(query);
  
  if (!apiKey) {
    // If no key, use fallback
    const fallbackText = await getMysticalFallback(query, context);
    // Return the top 2 matched source IDs as citations
    return { text: fallbackText, citations: faqIds.slice(0, 2) };
  }

  try {
    const formattedSystem = SYSTEM_PROMPT.replace('{CONTEXT}', context);
    
    // Call Groq API via standard Fetch
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: formattedSystem,
          },
          {
            role: 'user',
            content: query,
          }
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.warn(`Groq API returned error status ${response.status}:`, errBody);
      const fallbackText = await getMysticalFallback(query, context);
      return { text: fallbackText, citations: faqIds.slice(0, 2) };
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply) {
      return { text: reply.trim(), citations: faqIds };
    }
    return { text: "The oracle is silent. Try asking in a different manner.", citations: [] };
  } catch (error) {
    console.error("Error communicating with Groq API:", error);
    const fallbackText = await getMysticalFallback(query, context);
    return { text: fallbackText, citations: faqIds.slice(0, 2) };
  }
}
