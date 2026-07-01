import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';

export interface INotificationSettings {
  user: mongoose.Types.ObjectId;
  newFaq: boolean;
  pendingApproval: boolean;
  newUser: boolean;
  systemAlerts: boolean;
  weeklyReport: boolean;
}

interface INotificationSettingsDoc extends INotificationSettings, Document {}

const notificationSettingsSchema = new MongooseSchema<INotificationSettingsDoc>({
  user: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, unique: true },
  newFaq: { type: Boolean, default: true },
  pendingApproval: { type: Boolean, default: true },
  newUser: { type: Boolean, default: false },
  systemAlerts: { type: Boolean, default: true },
  weeklyReport: { type: Boolean, default: false },
});

export default mongoose.model<INotificationSettingsDoc>('NotificationSettings', notificationSettingsSchema);