from transformers import pipeline

chatbot = pipeline(
    "text2text-generation",
    model="google/flan-t5-large"
)

def ask_llm(question):
    prompt = f"Answer this question clearly:\n{question}"

    response = chatbot(
        prompt,
        max_length=150
    )

    return response[0]["generated_text"]