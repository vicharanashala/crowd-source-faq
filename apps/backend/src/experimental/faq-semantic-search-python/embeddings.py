import os
from typing import List, Union
from dotenv import load_dotenv

load_dotenv()

# Pre-initialize clients if keys are present
_openai_client = None
_gemini_client_configured = False

def get_openai_client():
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set.")
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client

def configure_gemini():
    global _gemini_client_configured
    if not _gemini_client_configured:
        import google.generativeai as genai
        # Look for standard keys
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("Neither GEMINI_API_KEY nor GOOGLE_API_KEY environment variable is set.")
        genai.configure(api_key=api_key)
        _gemini_client_configured = True

def get_embedding_provider() -> str:
    """
    Determines the embedding provider from EMBEDDING_PROVIDER environment variable.
    Falls back to 'gemini' if GEMINI_API_KEY/GOOGLE_API_KEY is present, then 'openai'.
    """
    provider = os.getenv("EMBEDDING_PROVIDER", "").lower()
    if provider in ("gemini", "openai"):
        return provider
    
    if os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
        return "gemini"
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
        
    # Default fallback
    return "gemini"

def get_embedding_dim() -> int:
    """Returns vector dimension size: 768 for Gemini (text-embedding-004), 1536 for OpenAI."""
    provider = get_embedding_provider()
    if provider == "openai":
        return 1536
    return 768

def get_embedding(text: str, is_query: bool = False) -> List[float]:
    """
    Generates a vector embedding for the given text.
    
    Parameters:
      text: The string to embed.
      is_query: Set to True when embedding a user query (used by Gemini's task_type parameter).
    """
    provider = get_embedding_provider()
    
    if provider == "openai":
        client = get_openai_client()
        # Use text-embedding-3-small as requested
        model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
        response = client.embeddings.create(
            input=[text],
            model=model
        )
        return response.data[0].embedding
    else:
        # Default to Gemini text-embedding-004
        configure_gemini()
        import google.generativeai as genai
        model = os.getenv("GEMINI_EMBEDDING_MODEL", "models/text-embedding-004")
        task_type = "retrieval_query" if is_query else "retrieval_document"
        
        result = genai.embed_content(
            model=model,
            contents=text,
            task_type=task_type
        )
        return result["embedding"]

def get_embeddings_batch(texts: List[str], is_query: bool = False) -> List[List[float]]:
    """
    Generates vector embeddings for a batch of text strings.
    """
    if not texts:
        return []
        
    provider = get_embedding_provider()
    
    if provider == "openai":
        client = get_openai_client()
        model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
        response = client.embeddings.create(
            input=texts,
            model=model
        )
        # Sort responses by index to ensure order matches input
        sorted_data = sorted(response.data, key=lambda x: x.index)
        return [item.embedding for item in sorted_data]
    else:
        configure_gemini()
        import google.generativeai as genai
        model = os.getenv("GEMINI_EMBEDDING_MODEL", "models/text-embedding-004")
        task_type = "retrieval_query" if is_query else "retrieval_document"
        
        result = genai.embed_content(
            model=model,
            contents=texts,
            task_type=task_type
        )
        return result["embedding"]
