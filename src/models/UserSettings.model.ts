import mongoose, { Document, Schema } from 'mongoose';

export interface IUserSettings extends Document {
  user: mongoose.Types.ObjectId;
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;
  notifications: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  privacy: {
    showProfile: boolean;
    showEmail: boolean;
    showPhone: boolean;
  };
  accessibility: {
    highContrast: boolean;
    textScale: number;
  };
  dashboardLayout: string[];
  createdAt: Date;
  updatedAt: Date;
}

const userSettingsSchema = new Schema<IUserSettings>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system',
    },
    language: {
      type: String,
      default: 'en',
    },
    timezone: {
      type: String,
      default: 'Africa/Lagos',
    },
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true },
    },
    privacy: {
      showProfile: { type: Boolean, default: true },
      showEmail: { type: Boolean, default: false },
      showPhone: { type: Boolean, default: false },
    },
    accessibility: {
      highContrast: { type: Boolean, default: false },
      textScale: { type: Number, default: 1, min: 0.8, max: 1.5 },
    },
    dashboardLayout: {
      type: [String],
      default: () => ['overview', 'notifications', 'tasks', 'payments'],
    },
  },
  { timestamps: true }
);

const UserSettings = mongoose.model<IUserSettings>('UserSettings', userSettingsSchema);

export default UserSettings;
