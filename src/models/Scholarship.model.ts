import mongoose, { Document, Schema } from 'mongoose';

export interface IScholarship extends Document {
  name: string;
  description: string;
  amount: number;
  eligibilityCriteria: {
    minCGPA?: number;
    minIncome?: number;
    maxIncome?: number;
    levels?: string[];
    departments?: string[];
  };
  availableSlots: number;
  filledSlots: number;
  applicationDeadline: Date;
  disbursementDate?: Date;
  status: 'active' | 'closed' | 'disbursed';
  academicYear: string;
  createdBy: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ScholarshipSchema = new Schema<IScholarship>(
  {
    name: {
      type: String,
      required: [true, 'Scholarship name is required'],
      trim: true
    },
    description: {
      type: String,
      required: [true, 'Description is required']
    },
    amount: {
      type: Number,
      required: [true, 'Scholarship amount is required'],
      min: 0
    },
    eligibilityCriteria: {
      minCGPA: {
        type: Number,
        min: 0,
        max: 5
      },
      minIncome: {
        type: Number,
        min: 0
      },
      maxIncome: {
        type: Number,
        min: 0
      },
      levels: [{
        type: String
      }],
      departments: [{
        type: String
      }]
    },
    availableSlots: {
      type: Number,
      required: [true, 'Available slots is required'],
      min: 1
    },
    filledSlots: {
      type: Number,
      default: 0,
      min: 0
    },
    applicationDeadline: {
      type: Date,
      required: [true, 'Application deadline is required']
    },
    disbursementDate: {
      type: Date
    },
    status: {
      type: String,
      enum: ['active', 'closed', 'disbursed'],
      default: 'active'
    },
    academicYear: {
      type: String,
      required: [true, 'Academic year is required'],
      default: '2024/2025'
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient queries
ScholarshipSchema.index({ status: 1, applicationDeadline: -1 });
ScholarshipSchema.index({ academicYear: 1 });

export default mongoose.model<IScholarship>('Scholarship', ScholarshipSchema);
