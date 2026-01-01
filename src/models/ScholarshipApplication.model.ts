import mongoose, { Document, Schema } from 'mongoose';

export interface IScholarshipApplication extends Document {
  scholarship: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  reason: string;
  documents: Array<{
    name: string;
    url: string;
    uploadedAt: Date;
  }>;
  financialInfo: {
    familyIncome: number;
    outstandingFees: number;
    bankAccount?: {
      accountName: string;
      accountNumber: string;
      bankName: string;
    };
  };
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewComment?: string;
  approvedAmount?: number;
  disbursed: boolean;
  disbursedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ScholarshipApplicationSchema = new Schema<IScholarshipApplication>(
  {
    scholarship: {
      type: Schema.Types.ObjectId,
      ref: 'Scholarship',
      required: true,
      index: true
    },
    student: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    reason: {
      type: String,
      required: [true, 'Reason for application is required'],
      minlength: [50, 'Reason must be at least 50 characters']
    },
    documents: [{
      name: {
        type: String,
        required: true
      },
      url: {
        type: String,
        required: true
      },
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }],
    financialInfo: {
      familyIncome: {
        type: Number,
        required: [true, 'Family income is required'],
        min: 0
      },
      outstandingFees: {
        type: Number,
        default: 0,
        min: 0
      },
      bankAccount: {
        accountName: String,
        accountNumber: String,
        bankName: String
      }
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewedAt: {
      type: Date
    },
    reviewComment: {
      type: String
    },
    approvedAmount: {
      type: Number,
      min: 0
    },
    disbursed: {
      type: Boolean,
      default: false
    },
    disbursedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// Compound index to prevent duplicate applications
ScholarshipApplicationSchema.index({ scholarship: 1, student: 1 }, { unique: true });

// Index for efficient queries
ScholarshipApplicationSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<IScholarshipApplication>('ScholarshipApplication', ScholarshipApplicationSchema);
