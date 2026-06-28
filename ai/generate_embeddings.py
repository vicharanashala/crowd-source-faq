import json
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")

INPUT_FILE = "data/faq.json"
OUTPUT_FILE = "data/embeddings.json"

with open(INPUT_FILE, "r", encoding="utf-8") as f:
    data = json.load(f)

embeddings = []

for intent in data["intents"]:
    tag = intent["tag"]
    responses = intent.get("responses", [])

    for pattern in intent.get("patterns", []):
        embedding = model.encode(pattern).tolist()

        embeddings.append({
            "tag": tag,
            "pattern": pattern,
            "responses": responses,
            "embedding": embedding
        })

        print(f"Processed: [{tag}] {pattern}")

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(embeddings, f, indent=4)

print(f"\nSaved {len(embeddings)} embeddings to {OUTPUT_FILE}")