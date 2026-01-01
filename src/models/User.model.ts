import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';
import { SALT_ROUNDS } from '../utils/constants';

export interface IUser extends Document {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'student' | 'lecturer' | 'admin' | 'hod' | 'bursary';
  avatar?: string;
  studentId?: string;
  department?: mongoose.Types.ObjectId;
  level?: string;
  isEmailVerified: boolean;
  twoFactorMethod?: 'totp' | 'email';
  twoFactorSecret?: string;
  twoFactorEnabled: boolean;
  refreshTokens: string[];
  failedLoginAttempts: number;
  accountLocked: boolean;
  lastLogin?: Date;
  emailVerificationToken?: string;
  emailVerificationExpiry?: Date;
  passwordResetToken?: string;
  passwordResetExpiry?: Date;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  fullName(): string;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },
    role: {
      type: String,
      enum: ['student', 'lecturer', 'admin', 'hod', 'bursary'],
      default: 'student',
      index: true,
    },
    avatar: String,
    studentId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    department: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
    },
    level: String,
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    twoFactorMethod: {
      type: String,
      enum: ['totp', 'email'],
    },
    twoFactorSecret: String,
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    refreshTokens: [String],
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    accountLocked: {
      type: Boolean,
      default: false,
    },
    lastLogin: Date,
    emailVerificationToken: String,
    emailVerificationExpiry: Date,
    passwordResetToken: String,
    passwordResetExpiry: Date,
    deletedAt: Date,
  },
  {
    timestamps: true,
  }
);

userSchema.index({ email: 1, deletedAt: 1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  next();
});

userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.fullName = function (): string {
  return `${this.firstName} ${this.lastName}`;
};

const User = mongoose.model<IUser>('User', userSchema);

export default User;
