import mongoose, { Document, Schema } from 'mongoose';

export interface IAttendance extends Document {
  course: mongoose.Types.ObjectId;
  lecturer: mongoose.Types.ObjectId;
  date: Date;
  topic?: string;
  attendees: mongoose.Types.ObjectId[];
  absentees: mongoose.Types.ObjectId[];
  late: Array<{
    student: mongoose.Types.ObjectId;
    arrivedAt: Date;
  }>;
  totalStudents: number;
  attendancePercentage: number;
  session: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema = new Schema<IAttendance>(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true
    },
    lecturer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    topic: {
      type: String,
      trim: true
    },
    attendees: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    absentees: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    late: [{
      student: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      arrivedAt: {
        type: Date
      }
    }],
    totalStudents: {
      type: Number,
      required: true,
      default: 0
    },
    attendancePercentage: {
      type: Number,
      default: 0
    },
    session: {
      type: String,
      required: true,
      default: '2024/2025'
    }
  },
  {
    timestamps: true
  }
);

// Indexes for efficient queries
AttendanceSchema.index({ course: 1, date: -1 });
AttendanceSchema.index({ lecturer: 1, date: -1 });
AttendanceSchema.index({ 'attendees': 1 });

// Calculate attendance percentage before saving
AttendanceSchema.pre('save', function(next) {
  if (this.totalStudents > 0) {
    this.attendancePercentage = (this.attendees.length / this.totalStudents) * 100;
  }
  next();
});

export default mongoose.model<IAttendance>('Attendance', AttendanceSchema);
