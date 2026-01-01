import { v2 as cloudinary } from 'cloudinary';
import logger from './logger';

const initializeCloudinary = (): void => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    logger.warn('Cloudinary credentials not configured, file uploads will be disabled');
    return;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  logger.info('Cloudinary initialized successfully');
};

export { cloudinary };
export default initializeCloudinary;
