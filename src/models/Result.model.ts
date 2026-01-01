import mongoose, { Document, Schema } from 'mongoose';

export interface IResult extends Document {
  student: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  session: mongoose.Types.ObjectId;
  semester: string;
  caScore: number;
  examScore: number;
  totalScore: number;
  grade: string;
  gradePoints: number;
  enteredBy: mongoose.Types.ObjectId;
  approvedByHOD: boolean;
  approvedByAdmin: boolean;
  hodApprovedBy?: mongoose.Types.ObjectId;
  adminApprovedBy?: mongoose.Types.ObjectId;
  hodApprovedAt?: Date;
  adminApprovedAt?: Date;
  hodRejectionReason?: string;
  hodRejectedBy?: mongoose.Types.ObjectId;
  hodRejectedAt?: Date;
  isPublished: boolean;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const resultSchema = new Schema<IResult>(
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
    caScore: {
      type: Number,
      required: true,
      min: 0,
      max: 30,
    },
    examScore: {
      type: Number,
      required: true,
      min: 0,
      max: 70,
    },
    totalScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    grade: {
      type: String,
      required: true,
      enum: ['A', 'B', 'C', 'D', 'E', 'F'],
    },
    gradePoints: {
      type: Number,
      required: true,
      min: 0,
      max: 5,
    },
    enteredBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedByHOD: {
      type: Boolean,
      default: false,
    },
    approvedByAdmin: {
      type: Boolean,
      default: false,
    },
    hodApprovedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    adminApprovedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    hodApprovedAt: Date,
    adminApprovedAt: Date,
    hodRejectionReason: String,
    hodRejectedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    hodRejectedAt: Date,
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },
    publishedAt: Date,
  },
  {
    timestamps: true,
  }
);

resultSchema.index({ student: 1, course: 1, session: 1 }, { unique: true });
resultSchema.index({ student: 1, session: 1 });

const Result = mongoose.model<IResult>('Result', resultSchema);

export default Result;
