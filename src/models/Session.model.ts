import mongoose, { Document, Schema } from 'mongoose';

export interface ISession extends Document {
  name: string;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    isCurrent: {
      type: Boolean,
      default: false,
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

const Session = mongoose.model<ISession>('Session', sessionSchema);

export default Session;
