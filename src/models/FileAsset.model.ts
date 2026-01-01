import mongoose, { Document, Schema } from 'mongoose';

export interface IFileAsset extends Document {
  originalName: string;
  filename: string;
  path: string;
  mimeType: string;
  size: number;
  uploadedBy: mongoose.Types.ObjectId;
  description?: string;
  tags: string[];
  visibility: 'private' | 'department' | 'public';
  checksum?: string;
  createdAt: Date;
  updatedAt: Date;
}

const fileAssetSchema = new Schema<IFileAsset>(
  {
    originalName: {
      type: String,
      required: true,
    },
    filename: {
      type: String,
      required: true,
      unique: true,
    },
    path: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    description: String,
    tags: {
      type: [String],
      default: [],
    },
    visibility: {
      type: String,
      enum: ['private', 'department', 'public'],
      default: 'private',
      index: true,
    },
    checksum: String,
  },
  {
    timestamps: true,
  }
);

fileAssetSchema.index({ uploadedBy: 1, createdAt: -1 });

const FileAsset = mongoose.model<IFileAsset>('FileAsset', fileAssetSchema);

export default FileAsset;
