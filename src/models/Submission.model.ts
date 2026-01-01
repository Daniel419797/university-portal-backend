import mongoose, { Document, Schema } from 'mongoose';

export interface ISubmission extends Document {
  assignment: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  files: Array<{
    url: string;
    name: string;
    size: number;
    cloudinaryId: string;
  }>;
  comment?: string;
  submittedAt: Date;
  isLate: boolean;
  grade?: number;
  feedback?: string;
  gradedBy?: mongoose.Types.ObjectId;
  gradedAt?: Date;
  plagiarismScore?: number;
  createdAt: Date;
  updatedAt: Date;
}

const submissionSchema = new Schema<ISubmission>(
  {
    assignment: {
      type: Schema.Types.ObjectId,
      ref: 'Assignment',
      required: true,
      index: true,
    },
    student: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    files: [
      {
        url: String,
        name: String,
        size: Number,
        cloudinaryId: String,
      },
    ],
    comment: String,
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    isLate: {
      type: Boolean,
      default: false,
    },
    grade: {
      type: Number,
      min: 0,
    },
    feedback: String,
    gradedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    gradedAt: Date,
    plagiarismScore: {
      type: Number,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
  }
);

submissionSchema.index({ assignment: 1, student: 1 }, { unique: true });

const Submission = mongoose.model<ISubmission>('Submission', submissionSchema);

export default Submission;
