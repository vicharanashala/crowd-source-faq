from pymongo import MongoClient

MONGODB_URI = "mongodb+srv://kkp1882006_db_user:YOUR_PASSWORD@cluster0.d94ov2d.mongodb.net/CrowdFAQ?retryWrites=true&w=majority&appName=Cluster0"

try:
    client = MongoClient(MONGODB_URI)

    client.admin.command("ping")
    print("✅ Connected to MongoDB Atlas")

    db = client["CrowdFAQ"]

    faq_collection = db["faqs"]
    chat_collection = db["chat_history"]

except Exception as e:
    print("❌ Error connecting to MongoDB:")
    print(e)