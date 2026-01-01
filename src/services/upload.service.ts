import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import { ApiError } from '../utils/ApiError';
import { sanitizeFilename } from '../utils/helpers';
import logger from '../config/logger';

interface UploadResult {
  url: string;
  publicId: string;
  format: string;
  size: number;
  width?: number;
  height?: number;
}

class UploadService {
  /**
   * Upload a file to Cloudinary
   * @param filePath - Local file path
   * @param folder - Cloudinary folder name
   * @param resourceType - Type of resource (image, video, raw, auto)
   * @returns Upload result with URL and metadata
   */
  async uploadFile(
    filePath: string,
    folder: string = 'university-portal',
    resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto'
  ): Promise<UploadResult> {
    try {
      const result = await cloudinary.uploader.upload(filePath, {
        folder,
        resource_type: resourceType,
        use_filename: true,
        unique_filename: true,
      });

      // Delete the local file after upload
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        size: result.bytes,
        width: result.width,
        height: result.height,
      };
    } catch (error: any) {
      logger.error('Cloudinary upload error:', error);
      throw ApiError.internal('Failed to upload file to cloud storage');
    }
  }

  /**
   * Upload multiple files to Cloudinary
   * @param files - Array of file objects with path property
   * @param folder - Cloudinary folder name
   * @returns Array of upload results
   */
  async uploadMultipleFiles(
    files: Express.Multer.File[],
    folder: string = 'university-portal'
  ): Promise<UploadResult[]> {
    try {
      const uploadPromises = files.map((file) => this.uploadFile(file.path, folder));
      return await Promise.all(uploadPromises);
    } catch (error: any) {
      logger.error('Multiple file upload error:', error);
      throw ApiError.internal('Failed to upload files');
    }
  }

  /**
   * Delete a file from Cloudinary
   * @param publicId - Cloudinary public ID
   * @param resourceType - Type of resource
   */
  async deleteFile(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'image'): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
      logger.info(`Deleted file from Cloudinary: ${publicId}`);
    } catch (error: any) {
      logger.error('Cloudinary delete error:', error);
      throw ApiError.internal('Failed to delete file from cloud storage');
    }
  }

  /**
   * Delete multiple files from Cloudinary
   * @param publicIds - Array of Cloudinary public IDs
   */
  async deleteMultipleFiles(publicIds: string[]): Promise<void> {
    try {
      const deletePromises = publicIds.map((publicId) => this.deleteFile(publicId));
      await Promise.all(deletePromises);
    } catch (error: any) {
      logger.error('Multiple file deletion error:', error);
      throw ApiError.internal('Failed to delete files');
    }
  }

  /**
   * Upload file from buffer (useful for direct uploads without saving locally)
   * @param buffer - File buffer
   * @param filename - Original filename
   * @param folder - Cloudinary folder name
   * @returns Upload result
   */
  async uploadFromBuffer(
    buffer: Buffer,
    filename: string,
    folder: string = 'university-portal'
  ): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: sanitizeFilename(filename),
          resource_type: 'auto',
        },
        (error: any, result: any) => {
          if (error) {
            logger.error('Cloudinary buffer upload error:', error);
            reject(ApiError.internal('Failed to upload file'));
          } else if (result) {
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
              format: result.format,
              size: result.bytes,
              width: result.width,
              height: result.height,
            });
          }
        }
      );

      uploadStream.end(buffer);
    });
  }

  /**
   * Get file URL from public ID
   * @param publicId - Cloudinary public ID
   * @returns Secure URL
   */
  getFileUrl(publicId: string): string {
    return cloudinary.url(publicId, { secure: true });
  }

  /**
   * Generate a signed URL for temporary access
   * @param publicId - Cloudinary public ID
   * @param _expiresIn - Expiration time in seconds (default: 1 hour) - reserved for future use
   * @returns Signed URL
   */
  generateSignedUrl(publicId: string, _expiresIn: number = 3600): string {
    // Note: _expiresIn parameter is available for future use with custom signing logic
    return cloudinary.url(publicId, {
      secure: true,
      sign_url: true,
      type: 'authenticated',
    });
  }
}

export default new UploadService();
