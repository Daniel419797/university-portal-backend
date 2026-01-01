import mongoose, { Document, Schema } from 'mongoose';

export interface IInstallmentPlan extends Document {
  student: mongoose.Types.ObjectId;
  paymentType: string;
  session: mongoose.Types.ObjectId;
  semester: string;
  totalAmount: number;
  installments: Array<{
    dueDate: Date;
    amount: number;
    status: 'pending' | 'paid' | 'overdue';
    paidAt?: Date;
    payment?: mongoose.Types.ObjectId;
  }>;
  status: 'active' | 'completed' | 'defaulted';
  createdAt: Date;
  updatedAt: Date;
}

const InstallmentPlanSchema = new Schema<IInstallmentPlan>(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    paymentType: {
      type: String,
      required: true,
    },
    session: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
      index: true,
    },
    semester: {
      type: String,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    installments: [
      {
        dueDate: {
          type: Date,
          required: true,
        },
        amount: {
          type: Number,
          required: true,
          min: 0,
        },
        status: {
          type: String,
          enum: ['pending', 'paid', 'overdue'],
          default: 'pending',
        },
        paidAt: Date,
        payment: {
          type: Schema.Types.ObjectId,
          ref: 'Payment',
        },
      },
    ],
    status: {
      type: String,
      enum: ['active', 'completed', 'defaulted'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

InstallmentPlanSchema.index({ student: 1, paymentType: 1, session: 1, semester: 1 }, { unique: true });

export default mongoose.model<IInstallmentPlan>('InstallmentPlan', InstallmentPlanSchema);
