import mongoose from 'mongoose';
import logger from './logger';

const connectDatabase = async (): Promise<void> => {
  try {
    if (process.env.AUTH_STRATEGY === 'supabase' || process.env.DB_STRATEGY === 'supabase') {
      logger.info('Skipping MongoDB connection (Supabase mode)');
      return;
    }

    const mongoUri =
      (process.env.NODE_ENV === 'test' && process.env.MONGODB_TEST_URI) ||
      process.env.MONGODB_URI ||
      'mongodb://localhost:27017/university_portal';
    
    await mongoose.connect(mongoUri, {
      maxPoolSize: 10,
      minPoolSize: 5,
      socketTimeoutMS: 45000,
    });

    logger.info('MongoDB connected successfully');

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed through app termination');
      process.exit(0);
    });
  } catch (error) {
    logger.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};

export default connectDatabase;
