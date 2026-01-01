import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ApiError } from '../utils/ApiError';
import { sanitizeFilename } from '../utils/helpers';

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const sanitizedName = sanitizeFilename(file.originalname);
    cb(null, `${uniqueSuffix}-${sanitizedName}`);
  },
});

// File filter for different file types
const createFileFilter = (allowedTypes: string[]) => {
  return (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, `Only ${allowedTypes.join(', ')} files are allowed`));
    }
  };
};

// File size limits (in bytes)
const FILE_SIZE_LIMITS = {
  IMAGE: 5 * 1024 * 1024, // 5MB
  DOCUMENT: 10 * 1024 * 1024, // 10MB
  VIDEO: 50 * 1024 * 1024, // 50MB
};

// Document file types
const DOCUMENT_TYPES = ['.pdf', '.doc', '.docx', '.txt', '.xls', '.xlsx', '.ppt', '.pptx', '.csv'];

// Image file types
const IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];

// Video file types
const VIDEO_TYPES = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv'];

/**
 * Middleware for uploading images
 */
export const uploadImage = multer({
  storage,
  limits: { fileSize: FILE_SIZE_LIMITS.IMAGE },
  fileFilter: createFileFilter(IMAGE_TYPES),
}).single('image');

/**
 * Middleware for uploading multiple images
 */
export const uploadImages = multer({
  storage,
  limits: { fileSize: FILE_SIZE_LIMITS.IMAGE },
  fileFilter: createFileFilter(IMAGE_TYPES),
}).array('images', 10); // Max 10 images

/**
 * Middleware for uploading documents
 */
export const uploadDocument = multer({
  storage,
  limits: { fileSize: FILE_SIZE_LIMITS.DOCUMENT },
  fileFilter: createFileFilter(DOCUMENT_TYPES),
}).single('document');

/**
 * Middleware for uploading multiple documents
 */
export const uploadDocuments = multer({
  storage,
  limits: { fileSize: FILE_SIZE_LIMITS.DOCUMENT },
  fileFilter: createFileFilter(DOCUMENT_TYPES),
}).array('documents', 10); // Max 10 documents

/**
 * Middleware for uploading CSV files
 */
export const uploadCsv = multer({
  storage,
  limits: { fileSize: FILE_SIZE_LIMITS.DOCUMENT },
  fileFilter: createFileFilter(['.csv']),
}).single('file');

/**
 * Middleware for uploading assignment submissions
 */
export const uploadSubmission = multer({
  storage,
  limits: { fileSize: FILE_SIZE_LIMITS.DOCUMENT },
  fileFilter: createFileFilter([...DOCUMENT_TYPES, ...IMAGE_TYPES]),
}).array('files', 5); // Max 5 files

/**
 * Middleware for uploading videos
 */
export const uploadVideo = multer({
  storage,
  limits: { fileSize: FILE_SIZE_LIMITS.VIDEO },
  fileFilter: createFileFilter(VIDEO_TYPES),
}).single('video');

/**
 * Middleware for uploading any file type
 */
export const uploadAny = multer({
  storage,
  limits: { fileSize: FILE_SIZE_LIMITS.DOCUMENT },
}).single('file');

/**
 * Middleware for uploading multiple files of any type
 */
export const uploadMultiple = multer({
  storage,
  limits: { fileSize: FILE_SIZE_LIMITS.DOCUMENT },
}).array('files', 10);

/**
 * Error handler for multer errors
 */
export const handleUploadError = (error: any, _req: any, res: any, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size is too large',
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files',
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field name',
      });
    }
  }
  next(error);
};
