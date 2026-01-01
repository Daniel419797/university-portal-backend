import mongoose, { Document, Schema } from 'mongoose';

export interface IPayment extends Document {
  student: mongoose.Types.ObjectId;
  type: 'tuition' | 'hostel' | 'library' | 'medical' | 'sports' | 'exam' | 'late_registration';
  amount: number;
  reference: string;
  status: 'pending' | 'verified' | 'rejected' | 'processing';
  paymentMethod?: string;
  paymentDate?: Date;
  verifiedBy?: mongoose.Types.ObjectId;
  verifiedAt?: Date;
  receipt?: string;
  session: mongoose.Types.ObjectId;
  semester: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['tuition', 'hostel', 'library', 'medical', 'sports', 'exam', 'late_registration'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected', 'processing'],
      default: 'pending',
      index: true,
    },
    paymentMethod: String,
    paymentDate: Date,
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    verifiedAt: Date,
    receipt: String,
    session: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
    },
    semester: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ student: 1, session: 1, type: 1 });

const Payment = mongoose.model<IPayment>('Payment', paymentSchema);

export default Payment;
