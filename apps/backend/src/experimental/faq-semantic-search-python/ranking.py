import re
from typing import List, Dict, Any

# Simple stop words list to filter out noise in keyword matching
STOP_WORDS = {
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', "you're", 
    "you've", "you'll", "you'd", 'your', 'yours', 'yourself', 'yourselves', 'he', 
    'him', 'his', 'himself', 'she', "she's", 'her', 'hers', 'herself', 'it', 
    "it's", 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 
    'what', 'which', 'who', 'whom', 'this', 'that', "that'll", 'these', 'those', 
    'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 
    'having', 'do', 'does', 'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if', 
    'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 
    'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 
    'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 
    'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 
    'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 
    'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 
    'very', 's', 't', 'can', 'will', 'just', 'don', "don't", 'should', "should've", 
    'now', 'd', 'll', 'm', 'o', 're', 've', 'y', 'ain', 'aren', "aren't", 'couldn', 
    "couldn't", 'didn', "didn't", 'doesn', "doesn't", 'hadn', "hadn't", 'hasn', 
    "hasn't", 'haven', "haven't", 'isn', "isn't", 'ma', 'mightn', "mightn't", 
    'mustn', "mustn't", 'needn', "needn't", 'shan', "shan't", 'shouldn', "shouldn't", 
    'wasn', "wasn't", 'weren', "weren't", 'won', "won't", 'wouldn', "wouldn't"
}

def tokenize(text: str) -> List[str]:
    """Tokenizes and normalizes text by removing punctuation and lowercasing."""
    text = text.lower()
    # Replace non-alphanumeric characters with spaces
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    return text.split()

def get_clean_tokens_set(text: str) -> set:
    """Returns a set of cleaned, lowercase tokens excluding stop words."""
    tokens = tokenize(text)
    return {t for t in tokens if t not in STOP_WORDS}

def calculate_hybrid_scores(query: str, search_results: List[tuple]) -> List[Dict[str, Any]]:
    """
    Applies the hybrid ranking formula to the retrieved vector database results:
    final_score = 0.60 * vector_similarity 
                + 0.25 * keyword_score 
                + 0.10 * question_title_match 
                + 0.05 * section_match
                
    Parameters:
      query: The user's input question string.
      search_results: List of tuples (FAQ payload, dict of vector similarity scores).
    """
    ranked_results = []
    
    query_tokens = get_clean_tokens_set(query)
    query_raw_tokens = tokenize(query)
    query_normalized = " ".join(query_raw_tokens)
    
    for payload, vector_scores in search_results:
        question = payload.get("question", "")
        answer = payload.get("answer", "")
        section_title = payload.get("section_title", "")
        
        # 1. Vector Similarity Score (0.60 weight)
        # We combine the three named vector scores. Since question match is highly indicative,
        # we weight question similarity highest, combined second, and answer third.
        sim_q = vector_scores.get("question", 0.0)
        sim_c = vector_scores.get("combined", 0.0)
        sim_a = vector_scores.get("answer", 0.0)
        
        # We take a weighted representation or maximum
        vector_similarity = 0.50 * sim_q + 0.35 * sim_c + 0.15 * sim_a
        # Fallback to max if weighted is low but one of them is highly specific
        max_sim = max(sim_q, sim_c, sim_a)
        if max_sim > vector_similarity:
            vector_similarity = max_sim
            
        # 2. Keyword/BM25 Score (0.25 weight)
        # Calculate token overlap between query tokens and (question + answer) tokens
        q_tokens = get_clean_tokens_set(question)
        a_tokens = get_clean_tokens_set(answer)
        
        overlap_q = len(query_tokens & q_tokens) / max(len(query_tokens), 1)
        overlap_a = len(query_tokens & a_tokens) / max(len(query_tokens), 1)
        
        keyword_score = 0.7 * overlap_q + 0.3 * overlap_a
        
        # 3. Question Title Match (0.10 weight)
        # Boost if the normalized query is an exact substring of the question,
        # or if the query contains a substantial exact word match from the question.
        q_normalized = " ".join(tokenize(question))
        question_title_match = 0.0
        
        if query_normalized and (query_normalized in q_normalized or q_normalized in query_normalized):
            question_title_match = 1.0
        else:
            # If not exact substring, check if we match any trigrams or bigrams
            q_bigrams = set(zip(q_normalized.split()[:-1], q_normalized.split()[1:]))
            query_bigrams = set(zip(query_normalized.split()[:-1], query_normalized.split()[1:]))
            if query_bigrams and (query_bigrams & q_bigrams):
                # Partial phrase boost
                question_title_match = 0.5

        # 4. Section Match (0.05 weight)
        # Boost if the query tokens intersect with the section title tokens
        section_tokens = get_clean_tokens_set(section_title)
        # Filter section title tokens to exclude generic words
        section_tokens = {t for t in section_tokens if t not in {'about', 'internship', 'related', 'timing', 'dates'}}
        
        section_match = 0.0
        if query_tokens & section_tokens:
            section_match = 1.0
            
        # Final Score Calculation
        final_score = (
            0.60 * vector_similarity +
            0.25 * keyword_score +
            0.10 * question_title_match +
            0.05 * section_match
        )
        
        # Ensure range [0.0, 1.0]
        final_score = max(0.0, min(1.0, final_score))
        
        # Store individual score debug metadata
        ranked_results.append({
            "question": question,
            "answer": answer,
            "answer_html": payload.get("answer_html", ""),
            "section_title": section_title,
            "url": payload.get("url", ""),
            "score": round(final_score, 4),
            "debug": {
                "vector_similarity": round(vector_similarity, 4),
                "keyword_score": round(keyword_score, 4),
                "question_title_match": round(question_title_match, 4),
                "section_match": round(section_match, 4),
                "raw_sims": {k: round(v, 4) for k, v in vector_scores.items()}
            }
        })
        
    # Sort by final score descending
    ranked_results.sort(key=lambda x: x["score"], reverse=True)
    return ranked_results
