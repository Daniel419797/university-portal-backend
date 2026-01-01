import mongoose, { Document, Schema } from 'mongoose';

export interface IHostelApplication extends Document {
  student: mongoose.Types.ObjectId;
  hostel?: mongoose.Types.ObjectId;
  room?: string;
  session: mongoose.Types.ObjectId;
  status: 'pending' | 'approved' | 'rejected' | 'allocated';
  roommatePref?: string;
  specialRequests?: string;
  processedBy?: mongoose.Types.ObjectId;
  processedAt?: Date;
  allocatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const hostelApplicationSchema = new Schema<IHostelApplication>(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    hostel: {
      type: Schema.Types.ObjectId,
      ref: 'Hostel',
    },
    room: String,
    session: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'allocated'],
      default: 'pending',
      index: true,
    },
    roommatePref: String,
    specialRequests: String,
    processedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    processedAt: Date,
    allocatedAt: Date,
  },
  {
    timestamps: true,
  }
);

hostelApplicationSchema.index({ student: 1, session: 1 }, { unique: true });

const HostelApplication = mongoose.model<IHostelApplication>('HostelApplication', hostelApplicationSchema);

export default HostelApplication;
