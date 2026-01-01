import Redis from 'ioredis';
import logger from './logger';

let redisClient: Redis | null = null;

const connectRedis = (): Redis | null => {
  try {
    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl) {
      logger.warn('Redis URL not configured, caching will be disabled');
      return null;
    }

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis connection error:', err);
      redisClient = null;
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });

    redisClient.connect().catch((err) => {
      logger.error('Failed to connect to Redis:', err);
      redisClient = null;
    });

    return redisClient;
  } catch (error) {
    logger.error('Redis initialization failed:', error);
    return null;
  }
};

export const getRedisClient = (): Redis | null => {
  return redisClient;
};

export default connectRedis;
