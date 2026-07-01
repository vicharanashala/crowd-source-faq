import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface IZoomTranscriptChunk extends Document {
  zoomSessionId: Types.ObjectId;
  text: string;
  embedding: number[];
  createdAt: Date;
  updatedAt: Date;
}

const zoomTranscriptChunkSchema = new MongooseSchema<IZoomTranscriptChunk>(
  {
    zoomSessionId: { type: MongooseSchema.Types.ObjectId, ref: 'ZoomSession', required: true, index: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IZoomTranscriptChunk>(
  'ZoomTranscriptChunk',
  zoomTranscriptChunkSchema,
  'yaksha_faq_zoom_transcript_chunks'
);
