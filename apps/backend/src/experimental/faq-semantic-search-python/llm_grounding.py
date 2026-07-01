import os
from typing import List, Dict, Any
from dotenv import load_dotenv

load_dotenv()

# We set a confidence threshold. If the highest hybrid score is below this,
# we immediately return the fallback text without calling the LLM.
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.45"))
FALLBACK_TEXT = "I could not find an exact FAQ match. Please log in to Samagama and ask Yaksha."

def get_llm_provider() -> str:
    """Determines LLM provider based on env variables (gemini or openai)."""
    provider = os.getenv("LLM_PROVIDER", "").lower()
    if provider in ("gemini", "openai"):
        return provider
    
    if os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
        return "gemini"
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
        
    return "gemini"

def generate_grounded_answer(query: str, top_matches: List[Dict[str, Any]]) -> str:
    """
    Generates a short, grounded answer using the top matching FAQs.
    If the top match has a score below the confidence threshold, or if the LLM determines
    the context is insufficient, returns the fallback message.
    """
    if not top_matches:
        return FALLBACK_TEXT
        
    best_score = top_matches[0]["score"]
    if best_score < CONFIDENCE_THRESHOLD:
        print(f"Top match score {best_score} is below threshold {CONFIDENCE_THRESHOLD}. Returning fallback.")
        return FALLBACK_TEXT

    # Prepare context from top matches (we'll use the top 3 matches for context)
    context_items = []
    for idx, match in enumerate(top_matches[:3]):
        context_items.append(
            f"FAQ #{idx+1}\n"
            f"Section: {match['section_title']}\n"
            f"Question: {match['question']}\n"
            f"Answer: {match['answer']}"
        )
    
    context_text = "\n\n---\n\n".join(context_items)
    
    system_prompt = (
        "You are a helpful assistant for the Vicharanashala Internship FAQ search.\n"
        "Your task is to answer the user's question using ONLY the provided FAQ entries.\n"
        "CRITICAL RULES:\n"
        "1. Answer the question using ONLY the provided FAQ context.\n"
        "2. Do NOT invent, assume, or extrapolate any information. Do NOT use any pre-existing knowledge outside the context.\n"
        "3. Keep the answer extremely concise and brief (usually 1-3 sentences).\n"
        "4. If the provided FAQ context does not contain the answer, or is insufficient to answer the question, or if there is any doubt, "
        "you MUST return exactly this string: 'I could not find an exact FAQ match. Please log in to Samagama and ask Yaksha.'\n"
        "5. Do NOT include any other text if you output the fallback string."
    )
    
    user_prompt = (
        f"FAQ CONTEXT:\n"
        f"{context_text}\n\n"
        f"USER QUESTION: {query}\n\n"
        f"GROUNDED ANSWER:"
    )

    provider = get_llm_provider()
    
    try:
        if provider == "openai":
            from openai import OpenAI
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY is not set.")
            
            client = OpenAI(api_key=api_key)
            model = os.getenv("OPENAI_LLM_MODEL", "gpt-4o-mini")
            
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.0,
                max_tokens=250
            )
            answer = response.choices[0].message.content.strip()
        else:
            # Default to Gemini
            import google.generativeai as genai
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if not api_key:
                raise ValueError("Neither GEMINI_API_KEY nor GOOGLE_API_KEY is set.")
            
            genai.configure(api_key=api_key)
            model_name = os.getenv("GEMINI_LLM_MODEL", "gemini-1.5-flash")
            
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=system_prompt
            )
            
            response = model.generate_content(
                user_prompt,
                generation_config={"temperature": 0.0, "max_output_tokens": 250}
            )
            answer = response.text.strip()
            
        return answer

    except Exception as e:
        print(f"Error during LLM generation: {e}")
        # If there's an error calling the API (like quota exceeded or missing keys),
        # we can synthesize a basic answer using the top FAQ answer directly as a fallback,
        # or return the fallback text if we want to be safe.
        # Let's extract the top FAQ answer if score is high (e.g., > 0.6) as local fallback
        if best_score >= 0.6:
            # Grounding: just return a short preview of the top FAQ answer
            top_ans = top_matches[0]["answer"]
            if len(top_ans) > 200:
                return f"{top_ans[:200]}..."
            return top_ans
        return FALLBACK_TEXT
