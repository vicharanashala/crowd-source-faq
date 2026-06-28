import re

def preprocess_text(text):
    """
    Clean and normalize text before embedding.
    """

    # Convert to lowercase
    text = text.lower()

    # Remove extra spaces
    text = text.strip()

    # Remove special characters
    text = re.sub(r'[^\w\s]', '', text)

    # Replace multiple spaces with one
    text = re.sub(r'\s+', ' ', text)

    return text