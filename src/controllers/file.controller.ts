import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import fs from 'fs';
import crypto from 'crypto';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { formatFileSize } from '../utils/helpers';

const VISIBILITY_VALUES = new Set(['private', 'department', 'public']);
const ELEVATED_ROLES = new Set(['admin', 'hod', 'bursary']);

const getAuthUserId = (req: Request): string => {
  const authUser = req.user;
  const id = authUser?.userId;
  if (!id) {
    throw ApiError.unauthorized('User context missing');
  }
  return id;
};

const parseTags = (value: unknown): string[] => {
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

const mapFileAsset = (asset: FileAsset) => ({
  id: asset.id,
  originalName: asset.original_name,
  filename: asset.filename,
  mimeType: asset.mime_type,
  size: asset.size,
  sizeReadable: formatFileSize(asset.size),
  visibility: asset.visibility,
  description: asset.description,
  tags: asset.tags,
  checksum: asset.checksum,
  uploadedBy: asset.uploaded_by,
  created_at: asset.created_at,
  updated_at: asset.updated_at,
  downloadUrl: buildDownloadUrl(asset.id),
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

interface FileAsset {
  id: string;
  original_name: string;
  filename: string;
  path: string;
  mime_type: string;
  size: number;
  uploaded_by: string;
  visibility: string;
  description?: string;
  tags?: string[];
  checksum: string;
  created_at: string;
  updated_at: string;
}

const canAccessAsset = (asset: FileAsset | null, userId: string, role: string) => {
  if (!asset) return false;
  const owner = asset.uploaded_by === userId;
  if (owner) return true;
  if (ELEVATED_ROLES.has(role)) return true;
  if (asset.visibility === 'public') return true;
  return false;
};

const getUploadedFile = (req: Request): Express.Multer.File | undefined => {
  return (req as unknown as { file?: Express.Multer.File }).file;
};

export const uploadFileAsset = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = getAuthUserId(req);
  const role = req.user?.role ?? 'student';
  const file = getUploadedFile(req);

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

  const { data: asset, error } = await db.from('file_assets').insert({
    original_name: file.originalname,
    filename: file.filename,
    path: file.path,
    mime_type: file.mimetype,
    size: file.size,
    uploaded_by: userId,
    description,
    tags,
    visibility,
    checksum,
  }).select().single();

  if (error || !asset) throw ApiError.internal(`Failed to upload file: ${error?.message}`);

  return res.status(201).json(ApiResponse.success('File uploaded successfully', mapFileAsset(asset)));
});

export const getFileAsset = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = getAuthUserId(req);
  const role = req.user?.role ?? 'student';
  
  const { data: asset, error } = await db
    .from('file_assets')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) throw ApiError.internal(`Failed to retrieve file: ${error.message}`);
  if (!asset) throw ApiError.notFound('File not found');

  if (!canAccessAsset(asset, userId, role)) {
    throw ApiError.forbidden('You do not have access to this file');
  }

  const shouldDownload = ['1', 'true', 'download', 'yes'].includes(String(req.query.download || '').toLowerCase());

  if (shouldDownload) {
    if (!fs.existsSync(asset.path)) {
      throw ApiError.notFound('File contents no longer available');
    }
    return res.download(asset.path, asset.original_name);
  }

  return res.json(ApiResponse.success('File retrieved successfully', mapFileAsset(asset)));
});

export const deleteFileAsset = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = getAuthUserId(req);
  const role = req.user?.role ?? 'student';
  
  const { data: asset, error: fetchError } = await db
    .from('file_assets')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  if (fetchError) throw ApiError.internal(`Failed to retrieve file: ${fetchError.message}`);
  if (!asset) throw ApiError.notFound('File not found');

  const isOwner = asset.uploaded_by === userId;
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

  const { error: deleteError } = await db
    .from('file_assets')
    .delete()
    .eq('id', asset.id);

  if (deleteError) throw ApiError.internal(`Failed to delete file: ${deleteError.message}`);

  return res.json(ApiResponse.success('File deleted successfully', { id: asset.id }));
});

