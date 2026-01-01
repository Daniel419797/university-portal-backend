import mongoose, { Document, Schema } from 'mongoose';

export interface IEnrollment extends Document {
  student: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  session: mongoose.Types.ObjectId;
  semester: string;
  enrolledAt: Date;
  status: 'active' | 'dropped' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

const enrollmentSchema = new Schema<IEnrollment>(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    session: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
    },
    semester: {
      type: String,
      required: true,
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['active', 'dropped', 'completed'],
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

enrollmentSchema.index({ student: 1, course: 1, session: 1 }, { unique: true });

const Enrollment = mongoose.model<IEnrollment>('Enrollment', enrollmentSchema);

export default Enrollment;
