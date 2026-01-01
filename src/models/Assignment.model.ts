import mongoose, { Document, Schema } from 'mongoose';

export interface IAssignment extends Document {
  course: mongoose.Types.ObjectId;
  title: string;
  description: string;
  dueDate: Date;
  totalMarks: number;
  attachments: Array<{
    url: string;
    name: string;
    size: number;
  }>;
  allowLateSubmission: boolean;
  latePenalty: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const assignmentSchema = new Schema<IAssignment>(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    totalMarks: {
      type: Number,
      required: true,
      min: 1,
    },
    attachments: [
      {
        url: String,
        name: String,
        size: Number,
      },
    ],
    allowLateSubmission: {
      type: Boolean,
      default: false,
    },
    latePenalty: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Assignment = mongoose.model<IAssignment>('Assignment', assignmentSchema);

export default Assignment;
