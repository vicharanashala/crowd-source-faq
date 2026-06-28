import json

from embedding_service import generate_embedding
from vector_search import search
from decision_engine import decide

def get_response(query):

    with open("data/embeddings.json") as f:
        data = json.load(f)

    query_embedding = generate_embedding(query)

    score, match = search(query_embedding, data)

    action = decide(score)

    # Default response
    response = "Sorry, I don't understand."

    # If a match is found
    if match and "responses" in match:
        response = random.choice(match["responses"])

    return {
        "response": response,
        "action": action,
        "score": score
    }
