import mongoose, { Schema as MongooseSchema } from 'mongoose';
const mentorSchema = new MongooseSchema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    designation: { type: String },
    bio: { type: String },
    profilePicture: { type: String },
    officeHours: { type: String },
    meetingLink: { type: String },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
}, { timestamps: true });
mentorSchema.index({ status: 1 });
export default mongoose.model('Mentor', mentorSchema, 'yaksha_faq_mentors');
