import { Request, Response } from 'express';
import fs from 'fs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import FileAsset from '../models/FileAsset.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { formatFileSize } from '../utils/helpers';

const VISIBILITY_VALUES = new Set(['private', 'department', 'public']);
const ELEVATED_ROLES = new Set(['admin', 'hod', 'bursary']);

const getAuthUserId = (req: Request): mongoose.Types.ObjectId => {
  const authUser = (req as any).user;
  const id = authUser?._id || authUser?.userId;
  if (!id) {
    throw ApiError.unauthorized('User context missing');
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest('Invalid user identifier');
  }
  return new mongoose.Types.ObjectId(id);
};

const parseTags = (value: any): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }
  return [];
};

const buildDownloadUrl = (id: string) => `/api/v1/files/${id}?download=true`;

const mapFileAsset = (asset: any) => ({
  id: asset._id,
  originalName: asset.originalName,
  filename: asset.filename,
  mimeType: asset.mimeType,
  size: asset.size,
  sizeReadable: formatFileSize(asset.size),
  visibility: asset.visibility,
  description: asset.description,
  tags: asset.tags,
  checksum: asset.checksum,
  uploadedBy: asset.uploadedBy,
  createdAt: asset.createdAt,
  updatedAt: asset.updatedAt,
  downloadUrl: buildDownloadUrl(asset._id.toString()),
});

const computeChecksum = (filePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
};

const canAccessAsset = (asset: any, userId: mongoose.Types.ObjectId, role: string) => {
  if (!asset) return false;
  const owner = asset.uploadedBy?.toString() === userId.toString();
  if (owner) return true;
  if (ELEVATED_ROLES.has(role)) return true;
  if (asset.visibility === 'public') return true;
  return false;
};

export const uploadFileAsset = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const role = (req as any).user?.role ?? 'student';
  const file = (req as any).file as Express.Multer.File | undefined;

  if (!file) {
    throw ApiError.badRequest('File payload is required');
  }

  const description = req.body?.description ? String(req.body.description) : undefined;
  const tags = parseTags(req.body?.tags);
  const requestedVisibility = req.body?.visibility ? String(req.body.visibility).toLowerCase() : 'private';
  const visibility = VISIBILITY_VALUES.has(requestedVisibility) ? requestedVisibility : 'private';

  if (visibility === 'department' && !ELEVATED_ROLES.has(role)) {
    // Basic guard to prevent students from widely sharing sensitive files
    throw ApiError.forbidden('Only administrative roles can share department-level files');
  }

  const checksum = await computeChecksum(file.path);

  const asset = await FileAsset.create({
    originalName: file.originalname,
    filename: file.filename,
    path: file.path,
    mimeType: file.mimetype,
    size: file.size,
    uploadedBy: userId,
    description,
    tags,
    visibility,
    checksum,
  });

  return res.status(201).json(ApiResponse.success('File uploaded successfully', mapFileAsset(asset)));
});

export const getFileAsset = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const role = (req as any).user?.role ?? 'student';
  const asset = await FileAsset.findById(req.params.id);

  if (!asset) {
    throw ApiError.notFound('File not found');
  }

  if (!canAccessAsset(asset, userId, role)) {
    throw ApiError.forbidden('You do not have access to this file');
  }

  const shouldDownload = ['1', 'true', 'download', 'yes'].includes(String(req.query.download || '').toLowerCase());

  if (shouldDownload) {
    if (!fs.existsSync(asset.path)) {
      throw ApiError.notFound('File contents no longer available');
    }
    return res.download(asset.path, asset.originalName);
  }

  return res.json(ApiResponse.success('File retrieved successfully', mapFileAsset(asset)));
});

export const deleteFileAsset = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const role = (req as any).user?.role ?? 'student';
  const asset = await FileAsset.findById(req.params.id);

  if (!asset) {
    throw ApiError.notFound('File not found');
  }

  const isOwner = asset.uploadedBy?.toString() === userId.toString();
  if (!isOwner && !ELEVATED_ROLES.has(role)) {
    throw ApiError.forbidden('You do not have permission to delete this file');
  }

  if (fs.existsSync(asset.path)) {
    try {
      fs.unlinkSync(asset.path);
    } catch (error) {
      // Ignore file system errors to avoid blocking API deletion
    }
  }

  await asset.deleteOne();

  return res.json(ApiResponse.success('File deleted successfully', { id: asset._id }));
});

