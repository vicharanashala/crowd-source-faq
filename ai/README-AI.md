# AI Module & LLM Orchestration Blueprint (MERN Stack)

This document details the AI architecture, embedding extraction options (cloud or local JS-based), MongoDB Atlas Vector Search pipelines, and prompt structures for CrowdFAQ.

---

## 1. AI Architecture & MERN RAG Pipeline

```
[ User Input Query ]
          │
          ▼
┌──────────────────────┐
│  AI Service (Node)   │ ───► Generate embeddings using `@google/generative-ai`
└──────────────────────┘      or `@xenova/transformers`
          │
          ▼
┌──────────────────────┐
│ MongoDB Atlas Search │ ───► MongoDB `$vectorSearch` aggregation stage
│ (Vector DB Index)    │      Threshold check (score > 0.85) -> Duplicate flag
└──────────────────────┘
          │
      If Found
          ▼
┌──────────────────────┐
│ Suggest Existing     │
│    Discussion        │
└──────────────────────┘
```

---

## 2. Dependencies
To build the MERN AI service, install these npm packages:
```bash
npm install @google/generative-ai @xenova/transformers
```

---

## 3. Implementation Code Snippets

### 3.1 Embedding Generation

We support two ways to generate embeddings in the Node.js backend:

#### Option A: Cloud Embeddings via Gemini API
Uses Google's `gemini-embedding-001` with a stored 768-dimension prefix:
```javascript
// src/services/aiService.js
const { GoogleGenAI } = require("@google/generative-ai");

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function getGeminiEmbedding(text) {
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const result = await model.embedContent(text);
    return result.embedding.values.slice(0, 768); // Store a 768-dimension prefix
}
```

#### Option B: Local Offline Embeddings via `@xenova/transformers`
Runs the `all-MiniLM-L6-v2` transformer model (384 dimensions) directly in Node.js without Python:
```javascript
// src/services/aiService.js
let pipeline;
async function getLocalEmbedding(text) {
    if (!pipeline) {
        const { pipeline: getPipeline } = await import('@xenova/transformers');
        pipeline = await getPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    const output = await pipeline(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data); // Returns array of 384 floats
}
```

---

### 3.2 Semantic Similarity Database Queries
We query the vector search index using the MongoDB aggregation framework:

```javascript
// src/controllers/questionController.js
const Question = require('../models/Question');
const { getLocalEmbedding } = require('../services/aiService');

async function checkForDuplicates(req, res) {
    try {
        const { title } = req.body;
        const queryVector = await getLocalEmbedding(title);

        const duplicates = await Question.aggregate([
            {
                $vectorSearch: {
                    index: "vector_index", // Index defined in database/README.md
                    path: "embedding",
                    queryVector: queryVector,
                    numCandidates: 10,
                    limit: 3
                }
            },
            {
                $project: {
                    title: 1,
                    slug: 1,
                    description: 1,
                    score: { $meta: "searchScore" }
                }
            }
        ]);

        // MongoDB Atlas searchScore returns values up to 1.0 based on similarity.
        const matches = duplicates.filter(q => q.score > 0.85);

        return res.status(200).json({ matches });
    } catch (error) {
        return res.status(500).json({ message: "Vector search failed", error });
    }
}
```

---

### 3.3 Gemini API Summarization & Tags
For summarization and category matching, we use the `gemini-1.5-flash` model:

```javascript
// src/services/aiService.js
const getModel = () => genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function summarizeAnswers(questionTitle, answers = []) {
    if (answers.length === 0) return "No answers provided yet.";
    
    const model = getModel();
    const compiledAnswers = answers.map((ans, i) => `${i + 1}. ${ans.content}`).join('\n');
    
    const prompt = `
You are an expert technical editor. Summarize the discussions and answers to the question below.
Provide a concise 3-4 sentence paragraph that captures the most helpful and accurate details from the answers.

Question: ${questionTitle}

Answers:
${compiledAnswers}

Summary:
`;

    const response = await model.generateContent(prompt);
    return response.response.text().trim();
}

async function suggestTagsAndCategory(title, description, categories = []) {
    const model = getModel();
    const prompt = `
Given a question's title and description, choose the most relevant category from the options provided, and suggest 3-5 tags.
Return your response ONLY as a valid JSON object with keys "category" and "tags".

Available Categories: ${categories.join(', ')}

Question Title: ${title}
Question Description: ${description}

JSON Response:
`;

    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
    });

    return JSON.parse(result.response.text());
}
```

---

### 3.4 Chatbot RAG Assistant
Integrates the Vector Search + Gemini response generation:

```javascript
// src/controllers/chatbotController.js
const { getLocalEmbedding } = require('../services/aiService');
const Question = require('../models/Question');
const { GoogleGenAI } = require("@google/generative-ai");

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function askChatbot(req, res) {
    const { query } = req.body;
    const queryVector = await getLocalEmbedding(query);

    // Retrieve matching Q&As with score metadata
    const contextMatches = await Question.aggregate([
        {
            $vectorSearch: {
                index: "vector_index",
                path: "embedding",
                queryVector: queryVector,
                numCandidates: 10,
                limit: 3
            }
        }
    ]);

    const contextText = contextMatches
        .map(q => `Q: ${q.title}\nA: ${q.description}`)
        .join('\n\n');

    const prompt = `
You are the CrowdFAQ Community AI Assistant. Answer the user's question using the context provided.
If the context doesn't contain enough information, state that you don't know the answer but invite the user to post the question to the community.

Context:
${contextText}

User Question: ${query}

Answer:
`;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const response = await model.generateContent(prompt);
    
    return res.status(200).json({ answer: response.response.text().trim() });
}
```
