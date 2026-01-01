import mongoose, { Document, Schema } from 'mongoose';

export interface ICourse extends Document {
  code: string;
  title: string;
  description: string;
  credits: number;
  level: string;
  semester: 'first' | 'second';
  department: mongoose.Types.ObjectId;
  lecturer: mongoose.Types.ObjectId;
  prerequisites: mongoose.Types.ObjectId[];
  schedule: Array<{
    day: string;
    startTime: string;
    endTime: string;
    venue: string;
  }>;
  capacity: number;
  session: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const courseSchema = new Schema<ICourse>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
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
    credits: {
      type: Number,
      required: true,
      min: 1,
      max: 6,
    },
    level: {
      type: String,
      required: true,
      index: true,
    },
    semester: {
      type: String,
      enum: ['first', 'second'],
      required: true,
      index: true,
    },
    department: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
      index: true,
    },
    lecturer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    prerequisites: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Course',
      },
    ],
    schedule: [
      {
        day: String,
        startTime: String,
        endTime: String,
        venue: String,
      },
    ],
    capacity: {
      type: Number,
      default: 100,
    },
    session: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

courseSchema.index({ department: 1, level: 1, semester: 1 });

const Course = mongoose.model<ICourse>('Course', courseSchema);

export default Course;
