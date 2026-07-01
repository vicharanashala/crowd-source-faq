import mongoose, { Schema as MongooseSchema } from 'mongoose';
const orientationSchema = new MongooseSchema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    videoUrl: { type: String, required: true },
    transcript: { type: String, default: '' },
    completionThreshold: { type: Number, default: 90, min: 0, max: 100 },
}, { timestamps: true });
export default mongoose.model('Orientation', orientationSchema, 'yaksha_faq_orientations');
