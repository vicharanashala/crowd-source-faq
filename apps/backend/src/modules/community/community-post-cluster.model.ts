import mongoose, { Schema as MongooseSchema, Types, type Document } from 'mongoose';

export interface ICommunityPostCluster extends Document {
  batchId: Types.ObjectId;
  canonicalTitle: string;
  postIds: Types.ObjectId[];
  centroid: number[];
  lastRefreshedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const communityPostClusterSchema = new MongooseSchema<ICommunityPostCluster>(
  {
    batchId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      required: true,
      index: true,
    },
    canonicalTitle: { type: String, required: true, trim: true, maxlength: 200 },
    postIds: {
      type: [{ type: MongooseSchema.Types.ObjectId, ref: 'CommunityPost' }],
      required: true,
      validate: {
        validator: (v: Types.ObjectId[]) => Array.isArray(v) && v.length > 0,
        message: 'A post cluster must have at least one post.',
      },
    },
    centroid: { type: [Number], default: [] },
    lastRefreshedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

communityPostClusterSchema.index({ batchId: 1, lastRefreshedAt: -1 });

export default mongoose.model<ICommunityPostCluster>(
  'CommunityPostCluster',
  communityPostClusterSchema,
  'yaksha_faq_communitypostclusters'
);
