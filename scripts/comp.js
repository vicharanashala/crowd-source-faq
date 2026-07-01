// test-embedding.js

const EMBEDDING_BASE_URL = "https://<YOUR_TUNNEL_URL>/v1";
const EMBEDDING_API_KEY = "ollama";
const EMBEDDING_MODEL = "mxbai-embed-large";

async function createEmbedding(text) {
  try {
    const response = await fetch(`${EMBEDDING_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${EMBEDDING_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
      }),
    });

    if (!response.ok) {
      console.error(`HTTP ${response.status}`);
      console.error(await response.text());
      return;
    }

    const data = await response.json();

    console.log("Model:", data.model);
    console.log("Dimensions:", data.data[0].embedding.length);
    console.log("First 10 values:");
    console.log(data.data[0].embedding.slice(0, 10));
  } catch (err) {
    console.error(err);
  }
}

createEmbedding("What is Yaksha FAQ?");