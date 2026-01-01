import mongoose, { Document, Schema } from 'mongoose';

export interface IClearance extends Document {
  student: mongoose.Types.ObjectId;
  academicYear: string;
  semester: string;
  overallStatus: 'in-progress' | 'completed' | 'rejected';
  departments: Array<{
    name: string;
    description: string;
    status: 'pending' | 'approved' | 'rejected';
    approvedBy?: mongoose.Types.ObjectId;
    approvedAt?: Date;
    comment?: string;
    required: boolean;
  }>;
  documentRequests: Array<{
    documentType: string;
    purpose: string;
    deliveryMethod: string;
    urgency: 'normal' | 'urgent';
    status: 'pending' | 'processing' | 'ready' | 'delivered';
    requestedAt: Date;
    processedBy?: mongoose.Types.ObjectId;
    processedAt?: Date;
    documentUrl?: string;
  }>;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ClearanceSchema = new Schema<IClearance>(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    academicYear: {
      type: String,
      required: true,
      default: '2024/2025'
    },
    semester: {
      type: String,
      required: true,
      default: 'Second Semester'
    },
    overallStatus: {
      type: String,
      enum: ['in-progress', 'completed', 'rejected'],
      default: 'in-progress'
    },
    departments: [{
      name: {
        type: String,
        required: true
      },
      description: {
        type: String,
        required: true
      },
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
      },
      approvedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedAt: {
        type: Date
      },
      comment: {
        type: String
      },
      required: {
        type: Boolean,
        default: true
      }
    }],
    documentRequests: [{
      documentType: {
        type: String,
        required: true
      },
      purpose: {
        type: String,
        required: true
      },
      deliveryMethod: {
        type: String,
        required: true
      },
      urgency: {
        type: String,
        enum: ['normal', 'urgent'],
        default: 'normal'
      },
      status: {
        type: String,
        enum: ['pending', 'processing', 'ready', 'delivered'],
        default: 'pending'
      },
      requestedAt: {
        type: Date,
        default: Date.now
      },
      processedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      processedAt: {
        type: Date
      },
      documentUrl: {
        type: String
      }
    }],
    completedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient queries
ClearanceSchema.index({ student: 1, academicYear: 1, semester: 1 });
ClearanceSchema.index({ overallStatus: 1 });

export default mongoose.model<IClearance>('Clearance', ClearanceSchema);
