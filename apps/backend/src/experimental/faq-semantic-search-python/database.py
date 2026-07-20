import os
from typing import List, Dict, Any, Tuple
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from embeddings import get_embedding, get_embedding_dim, get_embeddings_batch

COLLECTION_NAME = "samagama_faqs"

# Use local storage by default
DB_PATH = os.getenv("QDRANT_PATH", "./qdrant_db")
# If using remote host (e.g., in docker-compose)
DB_HOST = os.getenv("QDRANT_HOST", None)
DB_PORT = int(os.getenv("QDRANT_PORT", "6333"))

def get_db_client() -> QdrantClient:
    """Returns a Qdrant client connection."""
    if DB_HOST:
        return QdrantClient(host=DB_HOST, port=DB_PORT)
    else:
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
        return QdrantClient(path=DB_PATH)

def init_db(force_recreate: bool = False):
    """Initializes the Qdrant FAQ collection with named vectors."""
    client = get_db_client()
    dim = get_embedding_dim()
    
    # Check if collection exists
    exists = False
    try:
        collections = client.get_collections().collections
        exists = any(c.name == COLLECTION_NAME for c in collections)
    except Exception:
        pass

    if exists and force_recreate:
        client.delete_collection(collection_name=COLLECTION_NAME)
        exists = False
        
    if not exists:
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config={
                "question": VectorParams(size=dim, distance=Distance.COSINE),
                "answer": VectorParams(size=dim, distance=Distance.COSINE),
                "combined": VectorParams(size=dim, distance=Distance.COSINE),
            }
        )
        print(f"Collection '{COLLECTION_NAME}' initialized with vector dimension {dim}.")
    else:
        print(f"Collection '{COLLECTION_NAME}' already exists.")

def index_faqs(faq_data: dict):
    """
    Clears current index and stores scraped FAQ items with generated embeddings.
    """
    client = get_db_client()
    init_db(force_recreate=True)
    
    faqs = faq_data.get("faqs", [])
    if not faqs:
        print("No FAQs to index.")
        return

    print(f"Generating embeddings and indexing {len(faqs)} FAQs...")
    
    # Extract texts to embed in batch for optimization
    questions = [faq["question"] for faq in faqs]
    answers = [faq["answer"] for faq in faqs]
    combined_texts = [f"Question: {faq['question']}\nAnswer: {faq['answer']}" for faq in faqs]
    
    print("Generating question embeddings...")
    q_embeddings = get_embeddings_batch(questions)
    
    print("Generating answer embeddings...")
    a_embeddings = get_embeddings_batch(answers)
    
    print("Generating combined embeddings...")
    c_embeddings = get_embeddings_batch(combined_texts)
    
    points = []
    for idx, faq in enumerate(faqs):
        # Store metadata along with the 3 vectors
        payload = {
            "section_id": faq.get("section_id", ""),
            "section_title": faq.get("section_title", ""),
            "faq_id": faq.get("id", ""),
            "question": faq.get("question", ""),
            "answer": faq.get("answer", ""),
            "answer_html": faq.get("answer_html", ""),
            "url": faq.get("url", ""),
            "version": faq_data.get("version", "Unknown"),
            "last_updated": faq_data.get("last_updated", "Unknown")
        }
        
        points.append(
            PointStruct(
                id=idx,
                vector={
                    "question": q_embeddings[idx],
                    "answer": a_embeddings[idx],
                    "combined": c_embeddings[idx]
                },
                payload=payload
            )
        )
        
    # Batch upsert points
    client.upsert(
        collection_name=COLLECTION_NAME,
        wait=True,
        points=points
    )
    print("Indexing completed successfully.")

def get_all_indexed_faqs() -> List[Dict[str, Any]]:
    """Retrieves all stored FAQ entries from the database (including payload metadata)."""
    client = get_db_client()
    
    # Retrieve all points (limit to 1000 since there are ~150-200 FAQs maximum)
    results = client.scroll(
        collection_name=COLLECTION_NAME,
        limit=1000,
        with_payload=True,
        with_vectors=False
    )
    
    points = results[0]
    return [p.payload for p in points]

def search_faqs_vector(query_text: str, limit: int = 15) -> List[Tuple[Dict[str, Any], Dict[str, float]]]:
    """
    Performs vector similarity search against the three named vectors.
    Returns a list of tuples: (FAQ payload, dict of individual vector similarity scores).
    """
    client = get_db_client()
    query_vector = get_embedding(query_text, is_query=True)
    
    # Query against question vector
    res_q = client.search(
        collection_name=COLLECTION_NAME,
        query_vector=("question", query_vector),
        limit=limit,
        with_payload=True
    )
    
    # Query against combined vector
    res_c = client.search(
        collection_name=COLLECTION_NAME,
        query_vector=("combined", query_vector),
        limit=limit,
        with_payload=True
    )
    
    # Query against answer vector
    res_a = client.search(
        collection_name=COLLECTION_NAME,
        query_vector=("answer", query_vector),
        limit=limit,
        with_payload=True
    )
    
    # Aggregate scores for each FAQ id or anchor URL
    # Map from URL/id to a tuple of (payload, scores_dict)
    faq_map: Dict[str, Tuple[Dict[str, Any], Dict[str, float]]] = {}
    
    def process_results(results, vector_name):
        for hit in results:
            url = hit.payload.get("url", "")
            if not url:
                continue
            if url not in faq_map:
                faq_map[url] = (hit.payload, {"question": 0.0, "answer": 0.0, "combined": 0.0})
            faq_map[url][1][vector_name] = hit.score

    process_results(res_q, "question")
    process_results(res_c, "combined")
    process_results(res_a, "answer")
    
    return list(faq_map.values())
