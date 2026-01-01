import mongoose, { Document, Schema } from 'mongoose';

export interface IGradeAppeal extends Document {
  student: mongoose.Types.ObjectId;
  result: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  reason: string;
  preferredResolution?: string;
  attachments: Array<{
    name: string;
    url: string;
    uploadedAt: Date;
  }>;
  status: 'pending' | 'in-review' | 'resolved' | 'rejected';
  resolutionNote?: string;
  resolvedBy?: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GradeAppealSchema = new Schema<IGradeAppeal>(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    result: {
      type: Schema.Types.ObjectId,
      ref: 'Result',
      required: true,
      index: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: [true, 'Appeal reason is required'],
      minlength: 20,
    },
    preferredResolution: String,
    attachments: [
      {
        name: {
          type: String,
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    status: {
      type: String,
      enum: ['pending', 'in-review', 'resolved', 'rejected'],
      default: 'pending',
      index: true,
    },
    resolutionNote: String,
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedAt: Date,
  },
  {
    timestamps: true,
  }
);

GradeAppealSchema.index({ student: 1, result: 1 }, { unique: true });

export default mongoose.model<IGradeAppeal>('GradeAppeal', GradeAppealSchema);
