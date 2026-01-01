import mongoose, { Document, Schema } from 'mongoose';

export interface ISystemSetting extends Document {
  portal: {
    name: string;
    logo?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    maintenanceMode: boolean;
    defaultCurrency: string;
  };
  academic: {
    currentSession?: string;
    currentSemester?: 'first' | 'second';
    maxCreditLoad?: number;
    enrollmentDeadline?: Date;
    autoPublishResults: boolean;
  };
  finance: {
    baseTuitionFee: number;
    latePaymentPenaltyPercent: number;
    autoInvoiceGeneration: boolean;
    paymentInstructions?: string;
  };
  notifications: {
    emailEnabled: boolean;
    pushEnabled: boolean;
    smsEnabled: boolean;
  };
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const systemSettingSchema = new Schema<ISystemSetting>(
  {
    portal: {
      name: { type: String, default: 'University Portal' },
      logo: String,
      contactEmail: String,
      contactPhone: String,
      address: String,
      maintenanceMode: { type: Boolean, default: false },
      defaultCurrency: { type: String, default: 'NGN' },
    },
    academic: {
      currentSession: String,
      currentSemester: { type: String, enum: ['first', 'second'], default: 'first' },
      maxCreditLoad: { type: Number, default: 24 },
      enrollmentDeadline: Date,
      autoPublishResults: { type: Boolean, default: false },
    },
    finance: {
      baseTuitionFee: { type: Number, default: 150000 },
      latePaymentPenaltyPercent: { type: Number, default: 10 },
      autoInvoiceGeneration: { type: Boolean, default: false },
      paymentInstructions: String,
    },
    notifications: {
      emailEnabled: { type: Boolean, default: true },
      pushEnabled: { type: Boolean, default: true },
      smsEnabled: { type: Boolean, default: false },
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

const SystemSetting = mongoose.model<ISystemSetting>('SystemSetting', systemSettingSchema);
export default SystemSetting;
