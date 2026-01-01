import mongoose, { Document, Schema } from 'mongoose';
import { UserRole } from '../types';

export interface IAnnouncement extends Document {
  title: string;
  message: string;
  audience: UserRole[] | ['all'];
  tags: string[];
  isPinned: boolean;
  isPublished: boolean;
  publishAt: Date;
  expiresAt?: Date;
  attachments: Array<{
    name: string;
    url: string;
  }>;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const announcementSchema = new Schema<IAnnouncement>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
    },
    audience: {
      type: [String],
      default: ['all'],
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
    publishAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expiresAt: Date,
    attachments: [
      {
        name: String,
        url: String,
      },
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

announcementSchema.index({ isPinned: -1, publishAt: -1 });

const Announcement = mongoose.model<IAnnouncement>('Announcement', announcementSchema);

export default Announcement;
