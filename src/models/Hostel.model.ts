import mongoose, { Document, Schema } from 'mongoose';

export interface IHostel extends Document {
  name: string;
  gender: 'male' | 'female' | 'mixed';
  totalRooms: number;
  capacity: number;
  occupied: number;
  rooms: Array<{
    number: string;
    capacity: number;
    occupied: number;
    students: mongoose.Types.ObjectId[];
  }>;
  facilities: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const hostelSchema = new Schema<IHostel>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'mixed'],
      required: true,
    },
    totalRooms: {
      type: Number,
      required: true,
      min: 1,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
    },
    occupied: {
      type: Number,
      default: 0,
      min: 0,
    },
    rooms: [
      {
        number: String,
        capacity: Number,
        occupied: {
          type: Number,
          default: 0,
        },
        students: [
          {
            type: Schema.Types.ObjectId,
            ref: 'User',
          },
        ],
      },
    ],
    facilities: [String],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Hostel = mongoose.model<IHostel>('Hostel', hostelSchema);

export default Hostel;
