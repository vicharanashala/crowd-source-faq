import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IImportantLink extends Document {
  _id: Types.ObjectId;
  title: string;
  url: string;
  category: string;
  description?: string;
  order: number;
  isActive: boolean;
  batchId?: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const importantLinkSchema = new Schema<IImportantLink>(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 150 },
    url: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, maxlength: 50, index: true },
    description: { type: String, trim: true, maxlength: 500 },
    order: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
  }
);

importantLinkSchema.index({ batchId: 1, isActive: 1, order: 1, createdAt: -1 });

const ImportantLink = mongoose.models.ImportantLink || mongoose.model<IImportantLink>('ImportantLink', importantLinkSchema);

export default ImportantLink;
