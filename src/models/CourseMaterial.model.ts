import mongoose, { Document, Schema } from 'mongoose';

export interface ICourseMaterial extends Document {
  course: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  type: 'pdf' | 'doc' | 'video' | 'link' | 'other';
  fileUrl: string;
  fileName: string;
  fileSize: number;
  uploadedBy: mongoose.Types.ObjectId;
  uploadedAt: Date;
  isActive: boolean;
  downloads: number;
  createdAt: Date;
  updatedAt: Date;
}

const CourseMaterialSchema = new Schema<ICourseMaterial>(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: [true, 'Material title is required'],
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    type: {
      type: String,
      enum: ['pdf', 'doc', 'video', 'link', 'other'],
      default: 'pdf'
    },
    fileUrl: {
      type: String,
      required: [true, 'File URL is required']
    },
    fileName: {
      type: String,
      required: [true, 'File name is required']
    },
    fileSize: {
      type: Number,
      required: [true, 'File size is required']
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    },
    downloads: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient queries
CourseMaterialSchema.index({ course: 1, uploadedAt: -1 });
CourseMaterialSchema.index({ uploadedBy: 1, uploadedAt: -1 });

export default mongoose.model<ICourseMaterial>('CourseMaterial', CourseMaterialSchema);
