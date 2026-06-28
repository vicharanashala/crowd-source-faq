from sklearn.metrics.pairwise import cosine_similarity

def search(query_embedding, stored_data):
    scores = []

    for item in stored_data:
        score = cosine_similarity(
            [query_embedding],
            [item["embedding"]]
        )[0][0]

        scores.append((score, item))

    return max(scores, key=lambda x: x[0])