import mongoose, { Schema, Document } from 'mongoose';

export interface ITranslationCache extends Document {
  hash: string;
  sourceText: string;
  targetLang: string;
  translatedText: string;
  provider: string;
  createdAt: Date;
}

const translationCacheSchema = new Schema<ITranslationCache>(
  {
    hash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sourceText: {
      type: String,
      required: true,
    },
    targetLang: {
      type: String,
      required: true,
      index: true,
    },
    translatedText: {
      type: String,
      required: true,
    },
    provider: {
      type: String,
      default: 'auto',
    },
  },
  {
    timestamps: true,
  }
);

// Expire translation entries automatically after 30 days
translationCacheSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const TranslationCache = mongoose.model<ITranslationCache>('TranslationCache', translationCacheSchema);

export default TranslationCache;
