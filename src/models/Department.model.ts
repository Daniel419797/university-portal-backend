import mongoose, { Document, Schema } from 'mongoose';

export interface IDepartment extends Document {
  name: string;
  code: string;
  faculty: string;
  hod?: mongoose.Types.ObjectId;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const departmentSchema = new Schema<IDepartment>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    faculty: {
      type: String,
      required: true,
      trim: true,
    },
    hod: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    description: String,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Department = mongoose.model<IDepartment>('Department', departmentSchema);

export default Department;
