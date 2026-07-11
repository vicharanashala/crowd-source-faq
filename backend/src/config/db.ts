import mongoose from "mongoose";

export const connectDB = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/csfaq";

  try {
    await mongoose.connect(uri);
    console.log(`[db] MongoDB connected -> ${uri}`);
  } catch (error) {
    console.error("[db] MongoDB connection failed:", error);
    process.exit(1);
  }
};
